// ============================================================================
// OpsV opsv review
// Supports --circle mode: manifest-driven review
// Global mode (no --circle): document frontmatter is the single source of truth
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { ManifestReader } from '../core/ManifestReader';
import { ManifestReviewStrategy, GlobalReviewStrategy } from '../core/ReviewStrategy';
import { ReviewOptionsSchema, ReviewOptions } from '../types/ManifestSchema';
import { logger } from '../utils/logger';
import { getProjectDir } from '../utils/configLoader';
import { createReviewApp, setupTtlShutdown } from '../review-ui/ReviewServer';
import { CloudReviewSession, resolveCloudConfig, executeCloudCommand, TunnelProvider } from '../tunnel/CloudReviewSession';

const DEFAULT_REVIEW_PORT = 3100;
const DEFAULT_REVIEW_TTL = 900;

function autoCommitPendingChanges(projectRoot: string): void {
  try {
    execSync('git add -A', { cwd: projectRoot, stdio: 'ignore' });
    execSync('git diff --cached --quiet', { cwd: projectRoot, encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    try {
      const timestamp = new Date().toISOString();
      execSync(`git commit -m "pre-review checkpoint: ${timestamp}"`, { cwd: projectRoot, stdio: 'ignore' });
      console.log(chalk.green(`Changes committed before review (${timestamp})`));
    } catch (err: any) {
      logger.debug(`autoCommit failed: ${err.message}`);
    }
  }
}

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Start visual review server')
    .option('--port <number>', 'Server port', `${DEFAULT_REVIEW_PORT}`)
    .option('--circle [path]', 'Run in manifest-driven mode. Auto-discovers latest manifest if no path given.')
    .option('--latest', 'Show only latest circle outputs (global mode)')
    .option('--all', 'Show all circle outputs (global mode)')
    .option('--ttl <seconds>', `Auto-shutdown after idle seconds (default: ${DEFAULT_REVIEW_TTL})`, `${DEFAULT_REVIEW_TTL}`)
    .option('--cloud', 'Expose the review server through OpsV Cloud tunnel')
    .option('--cloud-url <url>', 'OpsV Cloud base URL (or OPSV_CLOUD_URL)')
    .option('--cloud-api-key <key>', 'OpsV Cloud API key (or OPSV_CLOUD_API_KEY)')
    .option('--edge', 'Use Tencent Cloud Edge tunnel (requires --cloud, stable URL)')
    .option('--edge-url <url>', 'Edge Function WebSocket URL (or OPSV_EDGE_URL)')
    .option('--status <sessionId>', 'Get cloud session status')
    .option('--rotate-review-token <sessionId>', 'Rotate the reviewer URL token')
    .option('--close <sessionId>', 'Close a cloud session')
    .action(async (options: ReviewOptions) => {
      try {
        const parsed = ReviewOptionsSchema.safeParse(options);
        if (!parsed.success) {
          console.error(chalk.red('Invalid options'));
          process.exit(1);
        }
        const opts: ReviewOptions = parsed.data;

        // ─── Cloud lifecycle commands (no local server needed) ───
        const cloudConfig = await resolveCloudConfig(opts);
        if (cloudConfig && (opts.status || opts.rotateReviewToken || opts.close)) {
          if (opts.status) await executeCloudCommand(cloudConfig, 'status', opts.status);
          if (opts.rotateReviewToken) await executeCloudCommand(cloudConfig, 'rotate', opts.rotateReviewToken);
          if (opts.close) await executeCloudCommand(cloudConfig, 'close', opts.close);
          return;
        }

        // ─── Standard review server startup ───
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red(`Queue directory not found: ${queueRoot}`));
          console.error(chalk.yellow('Run "opsv circle create" first.'));
          process.exit(1);
        }

        const manifestReader = new ManifestReader();
        const circleMode = opts.circle !== undefined;
        const manifestInfo = circleMode
          ? manifestReader.resolveForReview(projectRoot, opts.circle === true ? undefined : opts.circle as string)
          : null;

        if (circleMode && !manifestInfo) {
          console.error(chalk.red('No manifest found. Run "opsv circle create" first.'));
          process.exit(1);
        }

        if (circleMode && manifestInfo) {
          const assetCount = Object.keys(manifestInfo.manifest.assets || {}).length;
          console.log(chalk.cyan(`Manifest-driven mode: ${manifestInfo.circleName} (${assetCount} assets, target: ${manifestInfo.manifest.target || 'videospec'})`));
        }

        autoCommitPendingChanges(projectRoot);

        const strategy = circleMode && manifestInfo
          ? new ManifestReviewStrategy(manifestInfo, manifestReader, projectRoot)
          : new GlobalReviewStrategy(projectRoot, queueRoot, opts, manifestReader);

        const app = createReviewApp({
          projectRoot,
          queueRoot,
          opts,
          strategy,
          manifestReader,
        });

        let cloudSession: CloudReviewSession | null = null;

        const server = app.listen(opts.port, async () => {
          console.log(chalk.green(`Review server running at http://localhost:${opts.port}`));

          if (!cloudConfig) return;

          try {
            // Determine tunnel provider
            let tunnelProvider: TunnelProvider = 'cloudflared';
            let edgeConfig: { edgeFunctionUrl: string; edgeDomain?: string } | undefined;

            if (opts.edge) {
              tunnelProvider = 'tencent-edge';
              const edgeUrl = (opts as any).edgeUrl || process.env.OPSV_EDGE_URL;
              if (!edgeUrl) {
                throw new Error('Edge tunnel requires --edge-url or OPSV_EDGE_URL');
              }
              edgeConfig = { edgeFunctionUrl: edgeUrl };
            }

            cloudSession = new CloudReviewSession(
              cloudConfig.cloudUrl,
              cloudConfig.authToken,
              tunnelProvider,
              edgeConfig,
            );
            await cloudSession.start(opts.port, app);
          } catch (err: any) {
            logger.error(err.message);
            await cloudSession?.stop();
            server.close(() => process.exit(1));
          }
        });

        server.on('close', () => {
          void cloudSession?.stop();
        });

        const shutdown = () => {
          cloudSession?.stop().then(() => {
            server.close(() => process.exit(0));
          });
          setTimeout(() => process.exit(0), 5000);
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);

        setupTtlShutdown(server, opts.ttl);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

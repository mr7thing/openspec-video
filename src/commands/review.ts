// ============================================================================
// OpsV opsv review
// Supports --circle mode: manifest-driven review
// Global mode (no --circle): document frontmatter is the single source of truth
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { ManifestReader } from '../core/ManifestReader';
import { ManifestReviewStrategy, GlobalReviewStrategy } from '../core/ReviewStrategy';
import { ReviewOptionsSchema, ReviewOptions } from '../types/ManifestSchema';
import { logger } from '../utils/logger';
import { getProjectDir } from '../utils/configLoader';
import { createReviewApp, setupTtlShutdown } from '../review-ui/ReviewServer';
import { CloudClient } from '../tunnel/CloudClient';
import { TunnelClient } from '../tunnel/TunnelClient';

const DEFAULT_REVIEW_PORT = 3100;
const DEFAULT_REVIEW_TTL = 900;

function normalizeCloudUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolveCloudConfig(opts: ReviewOptions): { cloudUrl: string; apiKey: string } | null {
  if (!opts.cloud) return null;

  const cloudUrl = opts.cloudUrl || process.env.OPSV_CLOUD_URL;
  const apiKey = opts.cloudApiKey || process.env.OPSV_CLOUD_API_KEY;

  if (!cloudUrl || !apiKey) {
    console.error(chalk.red('Cloud review requires --cloud-url/OPSV_CLOUD_URL and --cloud-api-key/OPSV_CLOUD_API_KEY.'));
    process.exit(1);
  }

  return { cloudUrl: normalizeCloudUrl(cloudUrl), apiKey };
}

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
    .option('--circle [path]', 'Run in manifest-driven mode. Auto-discovers latest manifest if no path given. Accepts circle dir or manifest file path.')
    .option('--latest', 'Show only latest circle outputs (global mode)')
    .option('--all', 'Show all circle outputs (global mode)')
    .option('--ttl <seconds>', `Auto-shutdown after idle seconds (default: ${DEFAULT_REVIEW_TTL})`, `${DEFAULT_REVIEW_TTL}`)
    .option('--cloud', 'Expose the review server through OpsV Cloud tunnel')
    .option('--cloud-url <url>', 'OpsV Cloud base URL (or OPSV_CLOUD_URL)')
    .option('--cloud-api-key <key>', 'OpsV Cloud API key (or OPSV_CLOUD_API_KEY)')
    .action(async (options: ReviewOptions) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');

        if (!fs.existsSync(queueRoot)) {
          console.error(chalk.red(`Queue directory not found: ${queueRoot}`));
          console.error(chalk.yellow('Run "opsv circle create" first.'));
          process.exit(1);
        }

        const parsed = ReviewOptionsSchema.safeParse(options);
        if (!parsed.success) {
          console.error(chalk.red('Invalid options'));
          process.exit(1);
        }
        const opts: ReviewOptions = parsed.data;

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

        const cloudConfig = resolveCloudConfig(opts);
        let tunnelClient: TunnelClient | null = null;
        let cloudClient: CloudClient | null = null;
        let cloudSessionId: string | null = null;
        let cleanedUp = false;

        const cleanupCloud = async () => {
          if (cleanedUp) return;
          cleanedUp = true;
          tunnelClient?.close();
          if (cloudClient && cloudSessionId) {
            try {
              await cloudClient.closeSession(cloudSessionId);
              console.log(chalk.gray(`Cloud session closed: ${cloudSessionId}`));
            } catch (err: any) {
              logger.warn(`Failed to close cloud session: ${err.message}`);
            }
          }
        };

        const server = app.listen(opts.port, async () => {
          console.log(chalk.green(`Review server running at http://localhost:${opts.port}`));

          if (!cloudConfig) return;

          try {
            cloudClient = new CloudClient(cloudConfig.cloudUrl, cloudConfig.apiKey);
            const session = await cloudClient.createSession();
            cloudSessionId = session.sessionId;
            tunnelClient = new TunnelClient(cloudConfig.cloudUrl, session.sessionToken, opts.port);
            await tunnelClient.connect();
            console.log(chalk.green(`Cloud review URL: ${session.reviewUrl}`));
            console.log(chalk.gray(`Cloud session: ${session.sessionId}`));
          } catch (err: any) {
            logger.error(err.message);
            await cleanupCloud();
            server.close(() => process.exit(1));
          }
        });

        server.on('close', () => {
          void cleanupCloud();
        });

        const shutdown = () => {
          server.close(async () => {
            await cleanupCloud();
            process.exit(0);
          });
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

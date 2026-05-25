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
import qrcode from 'qrcode-terminal';
import { ManifestReader } from '../core/ManifestReader';
import { ManifestReviewStrategy, GlobalReviewStrategy } from '../core/ReviewStrategy';
import { ReviewOptionsSchema, ReviewOptions } from '../types/ManifestSchema';
import { logger } from '../utils/logger';
import { getProjectDir } from '../utils/configLoader';
import { createReviewApp, setupTtlShutdown } from '../review-ui/ReviewServer';
import { CloudClient } from '../tunnel/CloudClient';
import { TunnelClient, AccessLogEntry } from '../tunnel/TunnelClient';
import { CloudflaredManager } from '../tunnel/CloudflaredManager';
import { createAuthMiddleware } from '../review-ui/middleware/auth';
import { CredentialManager } from '../auth/CredentialManager';
import { DeviceFlowClient } from '../auth/DeviceFlowClient';

const DEFAULT_REVIEW_PORT = 3100;
const DEFAULT_REVIEW_TTL = 900;

function normalizeCloudUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function resolveCloudConfig(opts: ReviewOptions): Promise<{ cloudUrl: string; authToken: string } | null> {
  if (!opts.cloud) return null;

  const cloudUrl = opts.cloudUrl || process.env.OPSV_CLOUD_URL;
  if (!cloudUrl) {
    console.error(chalk.red('Cloud review requires --cloud-url/OPSV_CLOUD_URL.'));
    process.exit(1);
  }

  const normalizedUrl = normalizeCloudUrl(cloudUrl);

  // Try OAuth first
  const deviceFlow = new DeviceFlowClient(normalizedUrl);
  let authToken = await deviceFlow.refreshIfNeeded();

  // Fallback to API key
  if (!authToken) {
    const apiKey = opts.cloudApiKey || process.env.OPSV_CLOUD_API_KEY;
    if (apiKey) {
      authToken = `Bearer ${apiKey}`;
    }
  }

  if (!authToken) {
    console.error(chalk.red('未登录。请先运行 opsv login，或设置 OPSV_CLOUD_API_KEY。'));
    process.exit(1);
  }

  return { cloudUrl: normalizedUrl, authToken };
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
    .option('--cloud-api-key <key>', 'OpsV Cloud API key (or OPSV_CLOUD_API_KEY, fallback if not logged in)')
    .option('--status <sessionId>', 'Get cloud session status (requires --cloud)')
    .option('--refresh <sessionId>', 'Refresh cloud session JWT (requires --cloud)')
    .option('--close <sessionId>', 'Close a cloud session (requires --cloud)')
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
        if (cloudConfig && (opts.status || opts.refresh || opts.close)) {
          const client = new CloudClient(cloudConfig.cloudUrl, cloudConfig.authToken);

          if (opts.status) {
            const info = await client.getSession(opts.status);
            console.log(chalk.cyan(`Session: ${opts.status}`));
            console.log(JSON.stringify(info, null, 2));
            return;
          }

          if (opts.refresh) {
            const result = await client.refreshSession(opts.refresh);
            console.log(chalk.green(`Session refreshed: ${opts.refresh}`));
            console.log(chalk.green(`Review URL: ${result.reviewUrl}`));
            return;
          }

          if (opts.close) {
            await client.closeSession(opts.close);
            console.log(chalk.green(`Session closed: ${opts.close}`));
            return;
          }
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

        let cloudflaredManager: CloudflaredManager | null = null;

        let tunnelClient: TunnelClient | null = null;
        let cloudClient: CloudClient | null = null;
        let cloudSessionId: string | null = null;
        let cloudSessionToken: string | null = null;
        let cleanedUp = false;

        const cleanupCloud = async () => {
          if (cleanedUp) return;
          cleanedUp = true;
          tunnelClient?.close();
          cloudflaredManager?.stop();
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
            cloudClient = new CloudClient(cloudConfig.cloudUrl, cloudConfig.authToken);
            const session = await cloudClient.createSession();
            cloudSessionId = session.sessionId;
            cloudSessionToken = session.sessionToken;

            // Mount HMAC auth middleware for tunnel mode
            app.use(createAuthMiddleware({ sessionToken: session.sessionToken }));

            // Start cloudflared tunnel
            cloudflaredManager = new CloudflaredManager();
            const tunnelUrl = await cloudflaredManager.start(opts.port);
            console.log(chalk.green(`Cloudflared tunnel: ${tunnelUrl}`));

            // Report tunnel URL to VPS
            await cloudClient.updateTunnelUrl(session.sessionId, tunnelUrl);

            // Keep WebSocket connection for relay fallback + control
            tunnelClient = new TunnelClient(cloudConfig.cloudUrl, session.sessionToken, opts.port, session.sessionId);
            await tunnelClient.connect();

            // Write full URL to file so it's never truncated in terminal
            const urlFile = path.join(process.cwd(), '.opsv-review-url');
            fs.writeFileSync(urlFile, session.reviewUrl, 'utf-8');

            console.log(chalk.green(`Cloud review URL: ${session.reviewUrl}`));
            console.log(chalk.gray(`Cloud session: ${session.sessionId}`));
            console.log(chalk.cyan('Full URL saved to:'), chalk.yellow(urlFile));
            console.log(chalk.cyan('Scan QR code to open on mobile:'));
            qrcode.generate(session.reviewUrl, { small: true });

            // Expose relay control endpoints
            app.get('/api/session-info', async (_req, res) => {
              try {
                const info = await cloudClient!.getSession(session.sessionId);
                res.json(info);
              } catch (err: any) {
                res.status(500).json({ error: err.message });
              }
            });

            app.post('/api/enable-relay', async (_req, res) => {
              try {
                const result = await cloudClient!.enableRelay(session.sessionId);
                res.json(result);
              } catch (err: any) {
                res.status(500).json({ error: err.message });
              }
            });
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
          // Close cloud resources first, then the HTTP server.
          // server.close() waits for all connections (including WS) to close,
          // so we must cleanup before calling it, with a timeout fallback.
          cleanupCloud().then(() => {
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

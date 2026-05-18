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
    .option('--circle [path]', 'Run in manifest-driven mode. Auto-discovers latest manifest if no path given. Accepts circle dir or manifest file path.')
    .option('--latest', 'Show only latest circle outputs (global mode)')
    .option('--all', 'Show all circle outputs (global mode)')
    .option('--ttl <seconds>', `Auto-shutdown after idle seconds (default: ${DEFAULT_REVIEW_TTL})`, `${DEFAULT_REVIEW_TTL}`)
    .action(async (options: any) => {
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

        const server = app.listen(opts.port, () => {
          console.log(chalk.green(`Review server running at http://localhost:${opts.port}`));
        });

        setupTtlShutdown(server, opts.ttl);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

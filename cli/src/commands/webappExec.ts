/**
 * opsv webapp-exec — Execute webapp generation tasks
 *
 * Routes compiled task JSONs to site-specific runners (gemini, wan, etc.)
 * and handles post-processing (watermark, result saving).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { parseTask, findPendingTasks, scanQueueStatus } from '../webapp-runner/core/task';
import { executeTask, executeBatch } from '../webapp-runner/index';
import { logger } from '../utils/logger';

export function registerWebappExecCommand(program: Command): void {
  const cmd = program
    .command('webapp-exec')
    .description('Execute webapp generation tasks (multi-site runner)')
    .helpOption('-h, --help', 'Show help');

  // ── run ──────────────────────────────────────────────────────────────
  cmd
    .command('run')
    .description('Execute generation tasks')
    .option('--task <path>', 'Path to a single task JSON')
    .option('--dir <path>', 'Queue directory for batch processing')
    .option('--queue-dir <path>', 'Output queue dir (default: same as task/dir)')
    .option('--no-watermark', 'Skip watermark removal')
    .option('--retry', 'Retry previously failed tasks')
    .option('--json', 'Output JSON (useful for programmatic use)')
    .action(async (options) => {
      try {
        const enableWm = options.watermark !== false;

        if (options.task) {
          const queueDir = options.queueDir || require('path').dirname(options.task);
          const result = await executeTask(options.task, queueDir, enableWm);
          console.log(JSON.stringify(result, null, 2));
          if (result.status !== 'completed') process.exit(1);
        } else if (options.dir) {
          const queueDir = options.queueDir || options.dir;
          const summary = await executeBatch(options.dir, enableWm, options.retry);

          // Handle retry tasks (those with error logs)
          if (options.retry) {
            const fs = require('fs');
            const path = require('path');
            const qp = path.resolve(options.dir);
            const errorLogs = fs.readdirSync(qp).filter((f: string) => f.endsWith('_error.log')).sort();
            for (const errLog of errorLogs) {
              const shotId = errLog.replace('_error.log', '');
              const taskJson = path.join(qp, `${shotId}.json`);
              if (fs.existsSync(taskJson)) {
                try {
                  const result = await executeTask(taskJson, queueDir, enableWm);
                  summary.results.push(result);
                  if (result.status === 'completed') summary.success++;
                  else summary.failed++;
                } catch (e: any) {
                  logger.error(`Retry ${shotId} exception: ${e.message}`);
                  summary.failed++;
                }
              }
            }
          }

          console.log(JSON.stringify(summary, null, 2));
          if (summary.failed > 0) process.exit(1);
        } else {
          console.log(chalk.red('ERROR: specify --task or --dir'));
          process.exit(1);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // ── status ───────────────────────────────────────────────────────────
  cmd
    .command('status')
    .description('Show task status in queue directory')
    .requiredOption('--dir <path>', 'Queue directory')
    .action((options) => {
      try {
        const info = scanQueueStatus(options.dir);
        console.log(JSON.stringify(info, null, 2));
        if (info.total === 0) process.exit(1);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  // ── info ─────────────────────────────────────────────────────────────
  cmd
    .command('info')
    .description('Show parsed info about a task JSON')
    .requiredOption('--task <path>', 'Path to task JSON')
    .action((options) => {
      try {
        const info = parseTask(options.task);
        console.log(JSON.stringify(info, null, 2));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

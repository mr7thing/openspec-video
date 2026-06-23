// ============================================================================
// OpsV opsv run
// ============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { QueueRunner } from '../executor/QueueRunner';
import { logger } from '../utils/logger';
import { container, ctx } from '../cli';

interface RunCommandOptions {
  retry?: boolean;
  dryRun?: boolean;
  concurrency?: number;
  force?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <paths...>')
    .description('Execute compiled task .json files by path')
    .option('--retry', 'Retry failed tasks')
    .option('--force', 'Force re-run all tasks, ignoring previous success')
    .option('--dry-run', 'Show execution plan without running')
    .option('-c, --concurrency <number>', 'Max concurrent tasks per provider (overrides api_config)', (v) => parseInt(v, 10))
    .action(async (paths: string[], options: RunCommandOptions) => {
      try {
        const runner = new QueueRunner(container, ctx);
        const results = await runner.runPaths(paths, {
          retry: options.retry || false,
          force: options.force || false,
          dryRun: options.dryRun || false,
          concurrency: options.concurrency,
        });

        if (!options.dryRun) {
          const failed = results.filter((r) => !r.success);
          if (failed.length > 0) {
            console.log(chalk.yellow(`\nFailed tasks (${failed.length}):`));
            for (const f of failed) {
              console.log(chalk.red(`  ${f.shotId}: ${f.error}`));
            }
            process.exit(1);
          }
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

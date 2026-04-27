// ============================================================================
// OpsV v0.8 — opsv run
// ============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { QueueRunner } from '../executor/QueueRunner';
import { logger } from '../utils/logger';

export function registerRunCommand(program: Command): void {
  program
    .command('run <paths...>')
    .description('Execute compiled task .json files by path')
    .option('--retry', 'Retry failed tasks')
    .option('--dry-run', 'Show execution plan without running')
    .action(async (paths: string[], options: any) => {
      try {
        const runner = new QueueRunner();
        const results = await runner.runPaths(paths, {
          retry: options.retry || false,
          dryRun: options.dryRun || false,
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

// ============================================================================
// OpsV opsv repair — Generate → Verify → Repair feedback report (Q5)
// ============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { buildRepairReport } from '../canonical/repair/RepairReport';
import { logger } from '../utils/logger';

export function registerRepairCommand(program: Command): void {
  program
    .command('repair <asset>')
    .description('Show the repair feedback report for an asset (state, validation, suggested next action)')
    .option('--json', 'emit structured JSON')
    .action(async (asset: string, options: any) => {
      try {
        const report = buildRepairReport(process.cwd(), asset);

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log(chalk.cyan.bold(`Repair report: ${chalk.white(asset)}`));
        console.log(chalk.gray('─'.repeat(50)));

        if (!report.exists) {
          console.log(chalk.red(`Document not found: ${asset}`));
          console.log(chalk.yellow(`  ${report.suggested}`));
          return;
        }

        console.log(`  Document: ${chalk.white(report.docPath!)}`);
        console.log(`  Canonical parse: ${report.canonicalOk ? chalk.green('OK') : chalk.red('FAILED')}`);
        if (!report.canonicalOk) {
          console.log(chalk.red(`    ${report.canonicalError}`));
        }
        console.log(`  Asset state: ${chalk.green(report.state)} (${report.transitions} transition${report.transitions === 1 ? '' : 's'})`);
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`  ${chalk.bold('Suggested:')} ${report.suggested}`);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

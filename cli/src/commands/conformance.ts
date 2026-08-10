import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { checkConformance, ConformanceReport } from '../core/Conformance';
import { logger } from '../utils/logger';

function renderReport(report: ConformanceReport): void {
  const label = report.pack.id ? `${report.pack.id}@${report.pack.version ?? '?'}` : report.pack.root;
  console.log(`${label} — conformance matrix`);
  report.checks.forEach((check, index) => {
    const badge =
      check.status === 'pass' ? chalk.green('[PASS]') : check.status === 'fail' ? chalk.red('[FAIL]') : chalk.yellow('[WARN]');
    console.log(`${badge} ${index + 1}. ${check.title}`);
    for (const finding of check.findings) {
      console.log(`       ${finding.file}${finding.line ? `:${finding.line}` : ''}  ${finding.message}`);
    }
  });
  const failing = report.checks.filter(check => check.status === 'fail').length;
  if (report.ok) {
    console.log(chalk.green('conformance: pass'));
  } else {
    console.log(chalk.red(`conformance: ${failing} check(s) failing`));
  }
}

export function registerConformanceCommand(program: Command): void {
  program
    .command('conformance <pack>')
    .description(
      'Run the six-check conformance matrix against a Pack ' +
        '(stage inputs/outputs, role context, review+sync, soft tooling, constraint layering)',
    )
    .option('--json', 'Print machine-readable JSON report on stdout')
    .action((packPath: string, options: { json?: boolean }) => {
      try {
        // projectRoot = cwd: check 3 reads .opsv/bootstrap/ materialization
        // status when the command runs inside a project. Never reads .trellis/.
        const report = checkConformance(path.resolve(process.cwd(), packPath), { projectRoot: process.cwd() });
        if (options.json) {
          // stdout carries machine JSON only; human diagnostics stay on stderr.
          console.log(JSON.stringify(report, null, 2));
        } else {
          renderReport(report);
        }
        if (!report.ok) process.exitCode = 1;
      } catch (error: any) {
        logger.error(error.message);
        process.exitCode = 1;
      }
    });
}

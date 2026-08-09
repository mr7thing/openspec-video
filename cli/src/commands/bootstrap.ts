import { Command } from 'commander';
import chalk from 'chalk';
import { checkBootstrapStale, writeBootstrap } from '../core/Bootstrap';
import { logger } from '../utils/logger';

export function registerBootstrapCommand(program: Command): void {
  const bootstrap = program
    .command('bootstrap')
    .description('Generate the project execution context (.opsv/bootstrap/) from the Pack Stack + Project Config')
    .option('--json', 'Print the manifest JSON on stdout')
    .action((options: { json?: boolean }) => {
      try {
        const { manifestPath, manifest } = writeBootstrap(process.cwd());
        if (options.json) {
          // stdout carries machine JSON only; human diagnostics stay on stderr.
          console.log(JSON.stringify(manifest, null, 2));
          return;
        }
        console.log(chalk.green(`Bootstrap manifest written: ${manifestPath}`));
        console.log(`  Packs: ${manifest.packs.length}  Workflow stages: ${manifest.workflowGraph.length}  Roles: ${manifest.roles.length}`);
        for (const diagnostic of manifest.diagnostics) {
          console.log(chalk.yellow(`${diagnostic.code}: ${diagnostic.message}`));
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exitCode = 1;
      }
    });

  bootstrap
    .command('check')
    .description('Fail-closed staleness check for .opsv/bootstrap/ (Execution/hook preflight)')
    .option('--json', 'Print machine-readable status JSON on stdout')
    .action((options: { json?: boolean }, command: Command) => {
      try {
        // The parent command also declares --json; commander routes the flag
        // there when it follows the subcommand name, so merge both sources.
        const json = options.json || (command.parent?.opts() as { json?: boolean } | undefined)?.json;
        const status = checkBootstrapStale(process.cwd());
        if (json) {
          console.log(JSON.stringify(status, null, 2));
        } else if (!status.stale) {
          console.log(chalk.green('Bootstrap is fresh.'));
        } else {
          for (const issue of status.issues) console.log(chalk.red(`${issue.code}: ${issue.message}`));
        }
        // Fail-closed: missing/invalid/stale blocks execution preflight.
        if (status.stale) process.exitCode = 1;
      } catch (error: any) {
        logger.error(error.message);
        process.exitCode = 1;
      }
    });
}

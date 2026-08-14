import { Command } from 'commander';
import chalk from 'chalk';
import { commitArtifact } from '../canonical/artifacts/CommitService';
import { inferMediaType } from '../canonical/artifacts/mediaProbe';
import { logger } from '../utils/logger';

export function registerImportCommand(program: Command): void {
  program
    .command('import <path>')
    .description('Normalize an external artifact into an OPSV candidate asset (Normalization Layer)')
    .option('--task <taskId>', 'asset/task id this artifact belongs to')
    .option('--variant <name>', 'variant name (defaults to filename base)')
    .option('--type <type>', 'override artifact type (video/image/audio/composite)')
    .option('--timeline <start>-<end>', 'timeline range in seconds, e.g. 0-4s')
    .option('--provider <name>', 'provenance provider')
    .option('--model <name>', 'provenance model')
    .option('--capability <name>', 'provenance capability (default external.import)')
    .action(async (artifactPath: string, opts: any) => {
      try {
        const projectRoot = process.cwd();
        const result = await commitArtifact({
          projectRoot,
          artifactPath,
          type: opts.type ?? inferMediaType(artifactPath),
          task: opts.task,
          variant: opts.variant,
          provider: opts.provider,
          model: opts.model,
          capability: opts.capability,
          actor: { type: 'human', id: 'cli' },
          reason: opts.timeline ? `imported with timeline ${opts.timeline}` : undefined,
        });

        if (!result.ok) {
          console.error(chalk.red('Import rejected:'));
          for (const e of result.errors) {
            console.error(`  ${chalk.yellow(e.rule)}: expected ${JSON.stringify(e.expected)} got ${JSON.stringify(e.actual)}`);
          }
          process.exit(1);
        }

        const timeline = opts.timeline ? ` [timeline ${opts.timeline}]` : '';
        console.log(chalk.green(`Imported ${result.asset}:${result.artifact} → ${result.state}${timeline}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

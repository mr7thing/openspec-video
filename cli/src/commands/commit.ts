import { Command } from 'commander';
import chalk from 'chalk';
import { commitArtifact } from '../canonical/artifacts/CommitService';
import { inferMediaType } from '../canonical/artifacts/mediaProbe';
import { logger } from '../utils/logger';

export function registerCommitCommand(program: Command): void {
  program
    .command('commit <artifact>')
    .description('Commit an external artifact into OPSV as a candidate asset (Commit Boundary)')
    .option('--task <taskId>', 'asset/task id this artifact was produced for')
    .option('--variant <name>', 'variant name (defaults to filename base)')
    .option('--type <type>', 'override artifact type (video/image/audio/composite)')
    .option('--duration <seconds>', 'expected duration in seconds for tolerance validation')
    .option('--provider <name>', 'provenance provider (seedance/veo/rhcli/...)')
    .option('--model <name>', 'provenance model')
    .option('--capability <name>', 'provenance capability (default external.import)')
    .action(async (artifact: string, opts: any) => {
      try {
        const result = await commitArtifact({
          projectRoot: process.cwd(),
          artifactPath: artifact,
          type: opts.type ?? inferMediaType(artifact),
          task: opts.task,
          variant: opts.variant,
          expectedDuration: opts.duration !== undefined ? Number(opts.duration) : undefined,
          provider: opts.provider,
          model: opts.model,
          capability: opts.capability,
          actor: { type: 'human', id: 'cli' },
          reason: opts.provider ? `committed via ${opts.provider}${opts.model ? '/' + opts.model : ''}` : undefined,
        });

        if (!result.ok) {
          console.error(chalk.red('Artifact rejected:'));
          for (const e of result.errors) {
            console.error(`  ${chalk.yellow(e.rule)}: expected ${JSON.stringify(e.expected)} got ${JSON.stringify(e.actual)}`);
          }
          process.exit(1);
        }

        const warn = result.degradedProbe ? chalk.yellow(' (media probe degraded — duration/codec not verified)') : '';
        console.log(chalk.green(`Committed ${result.asset}:${result.artifact} → ${result.state}${warn}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

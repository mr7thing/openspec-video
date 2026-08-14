// ============================================================================
// OpsV opsv build — incremental rebuild plan (video build system)
//
// `opsv build <asset>` computes the transitive set of assets affected by a
// change to one asset and prints the incremental rebuild plan. With
// `--circle <name>` it also compiles the affected production assets into that
// circle (execution stays with `opsv run` — compile/execute stay separate).
// Analysis: 项目意义与改进建议.md §7 / §18 P2.
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { computeBuildPlan } from '../canonical/graph/BuildPlan';
import { ManifestReader } from '../core/ManifestReader';
import { ProductionPipeline } from '../core/ProductionPipeline';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

function latestCircleManifest(queueRoot: string): string | null {
  if (!fs.existsSync(queueRoot)) return null;
  const dirs = fs.readdirSync(queueRoot)
    .filter((d) => /_circle\d+$/.test(d))
    .sort((a, b) => {
      const na = parseInt(a.match(/_circle(\d+)$/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/_circle(\d+)$/)?.[1] || '0', 10);
      return na - nb;
    });
  if (dirs.length === 0) return null;
  const manifest = path.join(queueRoot, dirs[dirs.length - 1], '_manifest.json');
  return fs.existsSync(manifest) ? manifest : null;
}

export function registerBuildCommand(program: Command): void {
  program
    .command('build <asset>')
    .description('Show the incremental rebuild plan for a changed asset (or compile affected production assets into a circle)')
    .option('--json', 'emit structured JSON')
    .option('--circle <name>', 'compile affected production assets into this circle')
    .option('--model <key>', 'provider model key for compilation (defaults to Profile binding)')
    .option('--dry-run', 'compile in dry-run mode (no task files written)')
    .action(async (asset: string, options: any) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');

        // Determine the manifest used for production/workflow classification.
        let manifestPath: string | null = null;
        if (options.circle) {
          manifestPath = new ManifestReader().resolveForProduce(projectRoot, options.circle);
        } else {
          manifestPath = latestCircleManifest(queueRoot);
        }

        const plan = computeBuildPlan(projectRoot, asset, manifestPath);

        if (options.json) {
          console.log(JSON.stringify({ changed: plan.changed, affected: plan.affected }, null, 2));
          return;
        }

        console.log(chalk.cyan.bold(`Incremental build plan for ${chalk.white(asset)}`));
        console.log(chalk.gray('─'.repeat(50)));

        if (plan.affected.length === 0) {
          console.log(chalk.green('No affected assets — nothing to rebuild.'));
          return;
        }

        for (const a of plan.affected) {
          const kind = a.kind === 'production'
            ? chalk.green('production')
            : a.kind === 'workflow' ? chalk.yellow('workflow') : chalk.gray('unknown');
          console.log(`  ${chalk.white(a.asset)} (${a.category}) [${a.depType}] ${kind}`);
        }

        const production = plan.affected.filter((a) => a.kind === 'production');
        console.log(chalk.gray('─'.repeat(50)));
        if (production.length > 0) {
          console.log(`${chalk.bold(production.length)} production asset(s) need regeneration.`);
          console.log(chalk.cyan(`Run \`opsv build ${asset} --circle <name>\` to compile them.`));
        } else {
          console.log(chalk.green('No production assets affected.'));
        }

        // Compile the affected production assets when a circle is requested.
        if (options.circle && production.length > 0) {
          const circleManifest = new ManifestReader().resolveForProduce(projectRoot, options.circle);
          const circleDir = path.dirname(circleManifest);
          const pipeline = new ProductionPipeline(projectRoot);
          let compiled = 0;
          for (const a of production) {
            try {
              const result = await pipeline.run({
                modelKey: options.model,
                circleDir,
                file: a.asset,
                skipStatuses: ['approved'],
                dryRun: options.dryRun,
              });
              compiled += result.compiled;
            } catch (err: any) {
              console.log(chalk.yellow(`  ${a.asset}: ${err.message}`));
            }
          }
          console.log(chalk.green(`\n${compiled} affected task(s) compiled to ${circleDir}.`));
          console.log(chalk.cyan('Run `opsv run` to execute them.'));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

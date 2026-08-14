// ============================================================================
// OpsV opsv provenance — artifact lineage (Q3)
//
// Renders "why does this look like this": the asset's state machine
// transitions with their provenance (provider/model/seed/parents), plus the
// current artifact state. Analysis: 项目意义与改进建议.md §13 / §18 P1.
// ============================================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { currentState } from '../canonical/state/TransitionStore';
import { logger } from '../utils/logger';

export function registerProvenanceCommand(program: Command): void {
  program
    .command('provenance <asset>')
    .description('Show the artifact provenance lineage for an asset (state machine transitions + provenance)')
    .option('--json', 'emit structured JSON')
    .action(async (asset: string, options: any) => {
      try {
        const projectRoot = process.cwd();
        const { state, transitions } = await currentState(projectRoot, asset);

        if (options.json) {
          console.log(JSON.stringify({ asset, state, transitions }, null, 2));
          return;
        }

        console.log(chalk.cyan.bold(`Provenance: ${chalk.white(asset)}`));
        console.log(chalk.gray('─'.repeat(50)));

        if (transitions.length === 0) {
          console.log(chalk.yellow('No state transitions recorded for this asset.'));
          console.log(chalk.gray('Commit an artifact via `opsv commit <artifact> --task <asset>` to start the lineage.'));
          return;
        }

        console.log(`  Current state: ${chalk.green(state)} (${transitions.length} transition${transitions.length === 1 ? '' : 's'})`);

        for (const t of transitions) {
          const actor = `${t.actor.type}:${t.actor.id}`;
          const line = `  ${chalk.gray(t.from)} → ${chalk.white(t.to)}  ${chalk.gray('by')} ${actor}`;
          console.log(line);
          if (t.reason) console.log(`    reason: ${t.reason}`);
          if (t.provenance) {
            const p = t.provenance;
            const parts: string[] = [];
            if (p.provider) parts.push(`provider=${p.provider}`);
            if (p.model) parts.push(`model=${p.model}`);
            if (p.seed !== undefined) parts.push(`seed=${p.seed}`);
            if (p.parentAssets?.length) parts.push(`parents=[${p.parentAssets.join(', ')}]`);
            if (parts.length) console.log(`    provenance: ${parts.join('  ')}`);
          }
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

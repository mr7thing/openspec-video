// ============================================================================
// OpsV opsv status
// Quick overview of circle completion, blocked assets, and recent errors
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ManifestReader } from '../core/ManifestReader';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

interface CircleStatus {
  name: string;
  total: number;
  approved: number;
  syncing: number;
  drafting: number;
  blocked: string[];
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show project status: circle completion, blocked assets, recent errors')
    .option('--circle <name>', 'Show status for a specific circle')
    .action(async (options: { circle?: string }) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = getProjectDir(projectRoot, 'queue');

        if (!fs.existsSync(queueRoot)) {
          console.log(chalk.yellow('No queue directory found. Run "opsv circle create" first.'));
          return;
        }

        const manifestReader = new ManifestReader();
        const circleDirs = fs.readdirSync(queueRoot)
          .filter(d => /_circle\d+$/.test(d))
          .sort((a, b) => {
            const numA = parseInt(a.match(/_circle(\d+)$/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/_circle(\d+)$/)?.[1] || '0', 10);
            return numA - numB;
          });

        if (circleDirs.length === 0) {
          console.log(chalk.yellow('No circles found. Run "opsv circle create" first.'));
          return;
        }

        const targetCircles = options.circle
          ? circleDirs.filter(d => d.includes(options.circle!))
          : circleDirs;

        if (targetCircles.length === 0) {
          console.log(chalk.yellow(`Circle "${options.circle}" not found.`));
          return;
        }

        const allStatuses: CircleStatus[] = [];

        for (const circleDir of targetCircles) {
          const manifestPath = path.join(queueRoot, circleDir, '_manifest.json');
          if (!fs.existsSync(manifestPath)) continue;

          const manifest = manifestReader.read(manifestPath);
          const assets = manifest.assets || {};

          const status: CircleStatus = {
            name: circleDir,
            total: Object.keys(assets).length,
            approved: 0,
            syncing: 0,
            drafting: 0,
            blocked: [],
          };

          for (const [id, info] of Object.entries(assets)) {
            switch (info.status) {
              case 'approved': status.approved++; break;
              case 'syncing': status.syncing++; break;
              default: status.drafting++; break;
            }
          }

          allStatuses.push(status);
        }

        // Print summary
        console.log(chalk.cyan.bold('Project Status'));
        console.log(chalk.gray('─'.repeat(50)));

        let totalAll = 0, approvedAll = 0;

        for (const status of allStatuses) {
          totalAll += status.total;
          approvedAll += status.approved;

          const pct = status.total > 0
            ? Math.round((status.approved / status.total) * 100)
            : 0;
          const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));

          console.log(`\n${chalk.bold(status.name)}`);
          console.log(`  Progress: ${chalk.green(bar)} ${pct}% (${status.approved}/${status.total})`);

          if (status.syncing > 0) {
            console.log(`  ${chalk.yellow('⟳')} ${status.syncing} syncing (need to sync changes back)`);
          }
          if (status.drafting > 0) {
            console.log(`  ${chalk.gray('○')} ${status.drafting} pending`);
          }
        }

        // Overall
        const overallPct = totalAll > 0 ? Math.round((approvedAll / totalAll) * 100) : 0;
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.bold('Overall')}: ${approvedAll}/${totalAll} approved (${overallPct}%)`);

        // Show next action hint
        const lastStatus = allStatuses[allStatuses.length - 1];
        if (lastStatus && lastStatus.drafting > 0) {
          console.log(chalk.cyan(`\nNext: compile and run ${lastStatus.drafting} pending assets in ${lastStatus.name}`));
        } else if (lastStatus && lastStatus.approved === lastStatus.total) {
          console.log(chalk.green(`\n${lastStatus.name} is complete! Ready for next circle or downstream processing.`));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

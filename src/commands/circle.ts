// ============================================================================
// OpsV v0.8 — opsv circle (create + refresh)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { DependencyGraph } from '../core/DependencyGraph';
import { logger } from '../utils/logger';

export function registerCircleCommands(program: Command): void {
  const circle = program.command('circle').description('Circle lifecycle management');

  circle
    .command('create')
    .description('Build dependency graph, create circle directories and _assets.json')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .option('--skip-middle-circle', 'Skip generating middle circles')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const videospecDir = path.resolve(projectRoot, options.dir);

        if (!fs.existsSync(videospecDir)) {
          console.error(chalk.red(`Videospec directory not found: ${videospecDir}`));
          process.exit(1);
        }

        console.log(chalk.cyan('Building dependency graph...'));
        const graph = DependencyGraph.buildFromProject(projectRoot);

        const { batches, cycles } = graph.topologicalSort();

        if (cycles.length > 0) {
          console.error(chalk.red(`Circular dependency detected: ${cycles.join(', ')}`));
          process.exit(1);
        }

        let circles = graph.getCircles();

        if (options.skipMiddleCircle && circles.length > 2) {
          const zero = circles[0];
          const end = circles[circles.length - 1];
          circles = [zero, end];
          end.name = 'firstcircle';
        }

        const queueRoot = path.join(projectRoot, 'opsv-queue');

        console.log(chalk.cyan(`Creating ${circles.length} circles...`));
        graph.writeCircleAssets(queueRoot, circles);
        graph.writeManifest(queueRoot, circles);

        for (const c of circles) {
          console.log(chalk.green(`  ${c.name}/ (layer ${c.layer}): ${c.assetIds.join(', ')}`));
        }

        console.log(chalk.green(`\nManifest written to opsv-queue/videospec/_manifest.json`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  circle
    .command('refresh')
    .description('Rebuild graph, diff, update _assets.json and _manifest.json')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const videospecDir = path.resolve(projectRoot, options.dir);

        if (!fs.existsSync(videospecDir)) {
          console.error(chalk.red(`Videospec directory not found: ${videospecDir}`));
          process.exit(1);
        }

        console.log(chalk.cyan('Rebuilding dependency graph...'));
        const graph = DependencyGraph.buildFromProject(projectRoot);
        const circles = graph.getCircles();

        const queueRoot = path.join(projectRoot, 'opsv-queue');
        const manifestPath = path.join(queueRoot, 'videospec', '_manifest.json');

        let existingAssets: Record<string, string> = {};
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          for (const circle of manifest.circles || []) {
            Object.assign(existingAssets, circle.status || {});
          }
        }

        graph.writeCircleAssets(queueRoot, circles);
        graph.writeManifest(queueRoot, circles);

        const newAssets: Record<string, string> = {};
        for (const c of circles) {
          for (const id of c.assetIds) {
            newAssets[id] = existingAssets[id] || 'drafting';
          }
        }

        const added = Object.keys(newAssets).filter((k) => !existingAssets[k]);
        const removed = Object.keys(existingAssets).filter((k) => !newAssets[k]);

        if (added.length > 0) {
          console.log(chalk.yellow(`  New assets: ${added.join(', ')}`));
        }
        if (removed.length > 0) {
          console.log(chalk.yellow(`  Removed assets: ${removed.join(', ')}`));
        }

        if (added.length === 0 && removed.length === 0) {
          console.log(chalk.green('  No changes detected.'));
        }

        console.log(chalk.green('Circle assets and manifest updated.'));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

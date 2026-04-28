// ============================================================================
// OpsV v0.8.2 — opsv circle (create + refresh)
// Flat .circleN directory naming + merged _manifest.json
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
    .description('Build dependency graph, create {name}.circle{N}/ directory with _manifest.json')
    .option('--dir <path>', 'Target directory (e.g. videospec, elements/role)', 'videospec')
    .option('--name <name>', 'Override target basename (default: last segment of --dir)')
    .option('--skip-middle-circle', 'Skip generating middle circles')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = path.join(projectRoot, 'opsv-queue');
        const basename = options.name || DependencyGraph.resolveTargetBasename(options.dir);

        // Name conflict detection
        const conflict = DependencyGraph.checkNameConflict(queueRoot, basename, options.dir);
        if (conflict) {
          console.error(chalk.red(`Error: ${conflict}`));
          process.exit(1);
        }

        console.log(chalk.cyan('Building dependency graph...'));
        const graph = DependencyGraph.buildFromDir(projectRoot, options.dir);

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

        // Determine next circleN
        const circleN = DependencyGraph.detectCircleN(queueRoot, basename);

        console.log(chalk.cyan(`Creating ${basename}.circle${circleN}/...`));
        const circleDir = graph.writeCircleDir(queueRoot, basename, circleN, circles, options.dir);

        for (const c of circles) {
          console.log(chalk.green(`  Layer ${c.layer} (${c.name}): ${c.assetIds.join(', ')}`));
        }

        console.log(chalk.green(`\nManifest written to ${path.join(circleDir, '_manifest.json')}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  circle
    .command('refresh')
    .description('Rebuild graph, diff, update _manifest.json in target circle directory')
    .option('--dir <path>', 'Target directory (must match original --dir)', 'videospec')
    .option('--name <name>', 'Override target basename (default: last segment of --dir)')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const queueRoot = path.join(projectRoot, 'opsv-queue');
        const basename = options.name || DependencyGraph.resolveTargetBasename(options.dir);

        // Find latest .circleN for this basename
        const latestN = DependencyGraph.findLatestCircleN(queueRoot, basename);
        if (latestN === 0) {
          console.error(chalk.red(`No circle directory found for "${basename}". Run "opsv circle create --dir ${options.dir}" first.`));
          process.exit(1);
        }

        const circleDirName = `${basename}.circle${latestN}`;
        const circleDir = path.join(queueRoot, circleDirName);
        const manifestPath = path.join(circleDir, '_manifest.json');

        // Read existing manifest to preserve status
        let existingAssets: Record<string, string> = {};
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.assets) {
            for (const [id, info] of Object.entries(manifest.assets)) {
              existingAssets[id] = (info as any).status || 'drafting';
            }
          } else {
            // Fallback: read from circles[].status (old format)
            for (const circle of manifest.circles || []) {
              Object.assign(existingAssets, circle.status || {});
            }
          }
        }

        console.log(chalk.cyan('Rebuilding dependency graph...'));
        const graph = DependencyGraph.buildFromDir(projectRoot, options.dir);
        const circles = graph.getCircles();

        // Write updated manifest (overwrite existing)
        graph.writeCircleDir(queueRoot, basename, latestN, circles, options.dir);

        // Diff detection
        const newAssets: Record<string, string> = {};
        for (const c of circles) {
          for (const id of c.assetIds) {
            newAssets[id] = existingAssets[id] || 'drafting';
          }
        }

        // Read the newly written manifest and preserve existing statuses
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.assets) {
            for (const [id, info] of Object.entries(manifest.assets) as [string, any][]) {
              if (existingAssets[id]) {
                info.status = existingAssets[id];
              }
            }
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
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

        console.log(chalk.green(`Circle manifest updated: ${manifestPath}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

// ============================================================================
// OpsV image-stitch — CLI registration
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { stitchImages } from '../utils/imageStitch';
import { logger } from '../utils/logger';

export function registerImageStitchCommand(program: Command): void {
  program
    .command('image-stitch <inputs...>')
    .description('Stitch multiple images horizontally (--right) or vertically (--down)')
    .option('-o, --output <path>', 'Output file path', 'stitched.png')
    .option('--right', 'Stitch side by side (horizontal)')
    .option('--down', 'Stitch top to bottom (vertical)')
    .action(async (inputs: string[], options: { output: string; right?: boolean; down?: boolean }) => {
      try {
        if (!options.right && !options.down) {
          console.error(chalk.red('Must specify --right or --down'));
          process.exit(1);
        }
        if (options.right && options.down) {
          console.error(chalk.red('Cannot use both --right and --down'));
          process.exit(1);
        }

        // Resolve all input paths
        const resolved = inputs.map(f => path.resolve(f));
        for (const fp of resolved) {
          if (!fs.existsSync(fp)) {
            console.error(chalk.red(`File not found: ${fp}`));
            process.exit(1);
          }
        }

        const direction = options.right ? 'right' : 'down';
        const result = await stitchImages(resolved, path.resolve(options.output), direction);

        console.log(chalk.green(
          `Stitched ${result.count} images → ${options.output} (${result.width}x${result.height})`
        ));
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

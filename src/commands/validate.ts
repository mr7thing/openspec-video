// ============================================================================
// OpsV v0.8 — opsv validate
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { z } from 'zod';
import { FrontmatterParser } from '../core/FrontmatterParser';
import {
  BaseFrontmatterSchema,
  ProjectFrontmatterSchema,
  ShotDesignFrontmatterSchema,
  ShotProductionFrontmatterSchema,
  AssetCategoryEnum,
  StatusEnum,
} from '../types/FrontmatterSchema';
import { logger } from '../utils/logger';

export function registerValidateCommand(program: Command, version: string): void {
  program
    .command('validate')
    .description('Validate project documents and frontmatter')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (options: any) => {
      try {
        const projectRoot = path.resolve(options.dir);
        const videospecDir = path.join(projectRoot, 'videospec');

        if (!fs.existsSync(videospecDir)) {
          console.error(chalk.red(`Videospec directory not found: ${videospecDir}`));
          process.exit(1);
        }

        let totalFiles = 0;
        let validFiles = 0;
        const errors: Array<{ file: string; message: string }> = [];

        const dirs = ['elements', 'scenes'];
        for (const dir of dirs) {
          const dirPath = path.join(videospecDir, dir);
          if (!fs.existsSync(dirPath)) continue;

          const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));

          for (const file of files) {
            totalFiles++;
            const filePath = path.join(dirPath, file);

            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const { frontmatter } = FrontmatterParser.parseRaw(content);

              // Determine schema based on category
              const schema = getSchemaForCategory(frontmatter.category);
              FrontmatterParser.parse(content, schema);
              validFiles++;
            } catch (err: any) {
              errors.push({ file, message: err.message });
            }
          }
        }

        console.log(chalk.cyan(`\nValidation: ${validFiles}/${totalFiles} files valid`));

        if (errors.length > 0) {
          console.log(chalk.red(`\n${errors.length} error(s):`));
          for (const e of errors) {
            console.log(chalk.red(`  ${e.file}: ${e.message}`));
          }
          process.exit(1);
        } else {
          console.log(chalk.green('All documents valid!'));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function getSchemaForCategory(category?: string): z.ZodType {
  switch (category) {
    case 'project':
      return ProjectFrontmatterSchema;
    case 'shot-design':
      return ShotDesignFrontmatterSchema;
    case 'shot-production':
      return ShotProductionFrontmatterSchema;
    default:
      return BaseFrontmatterSchema;
  }
}

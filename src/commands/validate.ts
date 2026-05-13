// ============================================================================
// OpsV opsv validate
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
} from '../types/FrontmatterSchema';
import { logger } from '../utils/logger';
import { resolveProjectRoot } from '../utils/projectResolver';
import { buildAssetDocIndex } from '../core/AssetDocIndex';

export function registerValidateCommand(program: Command, version: string): void {
  program
    .command('validate')
    .description('Validate project documents and frontmatter')
    .option('--dir <path>', 'Target directory to validate (default: videospec)', 'videospec')
    .action(async (options: any) => {
      try {
        const projectRoot = resolveProjectRoot(process.cwd());
        const targetDir = path.resolve(projectRoot, options.dir);

        if (!fs.existsSync(targetDir)) {
          console.error(chalk.red(`Target directory not found: ${targetDir}`));
          process.exit(1);
        }

        if (!fs.statSync(targetDir).isDirectory()) {
          console.error(chalk.red(`Target is not a directory: ${targetDir}`));
          process.exit(1);
        }

        // Build asset index recursively (supports deep nesting)
        const index = buildAssetDocIndex(targetDir);
        const { entries, duplicates } = index;

        if (entries.size === 0) {
          console.log(chalk.yellow(`No .md files found in ${targetDir}`));
          return;
        }

        console.log(chalk.cyan(`Asset index: ${entries.size} document(s) in ${targetDir}`));

        if (duplicates.length > 0) {
          console.log(chalk.yellow(`\n${duplicates.length} duplicate assetId(s) found:`));
          for (const id of duplicates) {
            console.log(chalk.yellow(`  "${id}"`));
          }
        }

        // Validate documents: only files in subdirectories (*/*.md) are validated
        // Root level *.md files are treated as assets but not validated as documents
        let totalFiles = 0;
        let validFiles = 0;
        const errors: Array<{ file: string; message: string }> = [];
        const deadRefs: Array<{ file: string; ref: string; relPath: string }> = [];

        for (const [assetId, entry] of entries) {
          // Only validate files in subdirectories (not root level)
          if (entry.relativePath.split('/').length > 1) {
            totalFiles++;
            try {
              const content = fs.readFileSync(entry.filePath, 'utf-8');
              const { frontmatter } = FrontmatterParser.parseRaw(content);

              // Schema validation
              const schema = getSchemaForCategory(frontmatter.category);
              FrontmatterParser.parse(content, schema);
              validFiles++;
            } catch (err: any) {
              errors.push({ file: entry.relativePath, message: err.message });
            }
          }

          // Dead link detection: check refs in frontmatter and body
          try {
            const content = fs.readFileSync(entry.filePath, 'utf-8');
            const { frontmatter } = FrontmatterParser.parseRaw(content);

            const refsInFrontmatter = frontmatter.refs || [];
            const refsInBody = extractRefsFromBody(content);

            const allRefs = [...refsInFrontmatter, ...refsInBody];
            for (const ref of allRefs) {
              let refId = ref.startsWith('@') ? ref.slice(1) : ref;
              const colonIdx = refId.indexOf(':');
              if (colonIdx > 0) refId = refId.slice(0, colonIdx);
              if (!entries.has(refId)) {
                deadRefs.push({ file: entry.relativePath, ref: refId, relPath: entry.relativePath });
              }
            }
          } catch {
            // Skip ref check for files that failed to parse
          }
        }

        console.log(chalk.cyan(`\nValidated: ${validFiles}/${totalFiles} files`));

        if (deadRefs.length > 0) {
          console.log(chalk.red(`\n${deadRefs.length} dead reference(s):`));
          for (const e of deadRefs) {
            console.log(chalk.red(`  ${e.file}: refs "@${e.ref}" — document not found`));
          }
        }

        if (errors.length > 0) {
          console.log(chalk.red(`\n${errors.length} error(s):`));
          for (const e of errors) {
            console.log(chalk.red(`  ${e.file}: ${e.message}`));
          }
          process.exit(1);
        } else if (deadRefs.length > 0) {
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

function extractRefsFromBody(content: string): string[] {
  const refs: string[] = [];
  const refRegex = /@([a-zA-Z0-9_:.\-]+)/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}
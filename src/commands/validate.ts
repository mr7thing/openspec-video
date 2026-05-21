// ============================================================================
// OpsV opsv validate (v0.10.0)
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
import { RefsByType } from '../types/Refs';
import { logger } from '../utils/logger';
import { resolveProjectRoot } from '../utils/projectResolver';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { AssetManager } from '../core/AssetManager';
import { CategoryValidateLoader } from '../utils/categoryValidateLoader';
import { InputTypesLoader } from '../utils/inputTypesLoader';
import { validateCategory, ValidationIssue } from '../core/CategoryValidator';
import { bindRefs } from '../core/RefBinder';
import { parseKey } from '../core/RefBinder';

interface ValidateCommandOptions {
  dir: string;
  category?: string;
  strict?: boolean;
  skipCategoryRules?: boolean;
}

export function registerValidateCommand(program: Command, version: string): void {
  program
    .command('validate')
    .description('Validate project documents and frontmatter')
    .option('--dir <path>', 'Target directory to validate (default: videospec)', 'videospec')
    .option('--category <cat>', 'Only validate documents of this category')
    .option('--strict', 'Treat warnings as errors (non-zero exit)')
    .option('--skip-category-rules', 'Skip category_validate.yaml rule checks')
    .action(async (options: ValidateCommandOptions) => {
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

        // Load category rules + input_types registry
        const catLoader = new CategoryValidateLoader();
        catLoader.load(projectRoot, { silent: true });
        const inputTypes = new InputTypesLoader();
        inputTypes.load(projectRoot, { silent: true });

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

        let totalFiles = 0;
        let validFiles = 0;
        const errors: Array<{ file: string; message: string }> = [];
        const deadRefs: Array<{ file: string; ref: string; relPath: string }> = [];
        const missingImages: Array<{ file: string; ref: string }> = [];
        const statusIssues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
        const categoryIssues: Array<{ file: string; issue: ValidationIssue }> = [];

        for (const [assetId, entry] of entries) {
          // Only validate files in subdirectories (not root level)
          if (path.dirname(entry.relativePath) !== '.') {
            totalFiles++;
            try {
              const content = fs.readFileSync(entry.filePath, 'utf-8');
              const { frontmatter, body } = FrontmatterParser.parseRaw(content);

              if (options.category && frontmatter.category !== options.category) {
                totalFiles--;
                continue;
              }

              // Schema validation
              const schema = getSchemaForCategory(frontmatter.category);
              FrontmatterParser.parse(content, schema);

              // refs structure check (input_type registered + key syntax)
              const refsResult = bindRefs(frontmatter.refs as RefsByType | undefined, {
                projectRoot,
                inputTypes,
              });
              for (const err of refsResult.errors) {
                errors.push({ file: entry.relativePath, message: err });
              }

              // Category-level business rules
              if (!options.skipCategoryRules) {
                const rule = catLoader.getRule(String(frontmatter.category ?? ''));
                const issues = validateCategory(frontmatter, body, rule);
                for (const issue of issues) {
                  categoryIssues.push({ file: entry.relativePath, issue });
                }
              }

              validFiles++;
            } catch (err: any) {
              errors.push({ file: entry.relativePath, message: err.message });
            }
          }

          // Dead link detection: refs target docs must exist
          try {
            const content = fs.readFileSync(entry.filePath, 'utf-8');
            const { frontmatter } = FrontmatterParser.parseRaw(content);
            const refs = (frontmatter.refs || {}) as RefsByType;

            for (const typeMap of Object.values(refs)) {
              for (const key of Object.keys(typeMap || {})) {
                const parsed = parseKey(key);
                if (!parsed) continue;
                if (parsed.kind === 'doc') continue; // local doc refs not in asset index
                if (!entries.has(parsed.id)) {
                  deadRefs.push({ file: entry.relativePath, ref: parsed.id, relPath: entry.relativePath });
                }
              }
            }
          } catch {
            // Skip ref check for files that failed to parse
          }
        }

        // Image ref existence check
        const imageDir = path.resolve(projectRoot, options.dir);
        const foundMissingImages = findMissingImageRefs(imageDir);
        missingImages.push(...foundMissingImages);

        // Status consistency check: manifest status vs document frontmatter status
        const foundStatusIssues = findStatusInconsistencies(projectRoot);
        statusIssues.push(...foundStatusIssues);

        console.log(chalk.cyan(`\nValidated: ${validFiles}/${totalFiles} files`));

        if (deadRefs.length > 0) {
          console.log(chalk.red(`\n${deadRefs.length} dead reference(s):`));
          for (const e of deadRefs) {
            console.log(chalk.red(`  ${e.file}: refs "@${e.ref}" — document not found`));
          }
        }

        if (missingImages.length > 0) {
          console.log(chalk.yellow(`\n${missingImages.length} missing image file(s):`));
          for (const e of missingImages) {
            console.log(chalk.yellow(`  ${e.file}: ![...](${e.ref}) — file not found`));
          }
        }

        if (statusIssues.length > 0) {
          console.log(chalk.yellow(`\n${statusIssues.length} status inconsistency(ies):`));
          for (const e of statusIssues) {
            console.log(chalk.yellow(`  ${e.file}: doc="${e.docStatus}" vs manifest="${e.manifestStatus}"`));
          }
        }

        const catErrors = categoryIssues.filter(x => x.issue.severity === 'error');
        const catWarnings = categoryIssues.filter(x => x.issue.severity === 'warning');

        if (catErrors.length > 0) {
          console.log(chalk.red(`\n${catErrors.length} category rule error(s):`));
          for (const { file, issue } of catErrors) {
            const f = issue.field ? `[${issue.field}] ` : '';
            console.log(chalk.red(`  ${file} (${issue.category}): ${f}${issue.message}`));
          }
        }

        if (catWarnings.length > 0) {
          console.log(chalk.yellow(`\n${catWarnings.length} category rule warning(s):`));
          for (const { file, issue } of catWarnings) {
            const f = issue.field ? `[${issue.field}] ` : '';
            console.log(chalk.yellow(`  ${file} (${issue.category}): ${f}${issue.message}`));
          }
        }

        if (errors.length > 0) {
          console.log(chalk.red(`\n${errors.length} error(s):`));
          for (const e of errors) {
            console.log(chalk.red(`  ${e.file}: ${e.message}`));
          }
          process.exit(1);
        }

        const hasFailure =
          deadRefs.length > 0 ||
          missingImages.length > 0 ||
          statusIssues.length > 0 ||
          catErrors.length > 0 ||
          (options.strict && catWarnings.length > 0);

        if (hasFailure) {
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

export function extractRefsFromBody(content: string): string[] {
  const refs: string[] = [];
  const refRegex = /@([a-zA-Z0-9_:.\\-]+)/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

/**
 * Check consistency between manifest status and document frontmatter status.
 * Scans all `_manifest.json` files under `opsv-queue/` directory within projectRoot.
 * Returns inconsistencies where manifest says "approved" but frontmatter says something else.
 */
export function findStatusInconsistencies(
  projectRoot: string,
): Array<{ file: string; docStatus: string; manifestStatus: string }> {
  const inconsistencies: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
  const queueDir = path.join(projectRoot, 'opsv-queue');

  if (!fs.existsSync(queueDir)) return [];

  // Find all manifest files
  const manifestPaths: string[] = [];
  function findManifests(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        findManifests(full);
      } else if (entry.name === '_manifest.json') {
        manifestPaths.push(full);
      }
    }
  }
  findManifests(queueDir);

  const videospecDir = path.join(projectRoot, 'videospec');

  for (const manifestPath of manifestPaths) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      continue;
    }

    const assets = (manifest.assets || {}) as Record<string, unknown>;
    const manifestDir = path.dirname(manifestPath);

    for (const [assetId, assetInfo] of Object.entries(assets)) {
      const info = assetInfo as Record<string, unknown>;
      const manifestStatus = info.status as string | undefined;
      if (!manifestStatus) continue;

      // Find the corresponding document file using recursive search
      // (asset may be in subdirectory, not just root level)
      const docPath = AssetManager.findAssetFilePathUnder(videospecDir, assetId);
      if (!docPath) continue;

      // Skip root-level documents (same as validate command)
      const relPath = path.relative(videospecDir, docPath);
      if (path.dirname(relPath) === '.') continue;

      try {
        const content = fs.readFileSync(docPath, 'utf-8');
        const { frontmatter } = FrontmatterParser.parseRaw(content);
        const docStatus = frontmatter.status || 'drafting';

        if (docStatus !== manifestStatus) {
          inconsistencies.push({
            file: relPath,
            docStatus,
            manifestStatus,
          });
        }
      } catch {
        // Skip documents that fail to parse
      }
    }
  }

  return inconsistencies;
}

/**
 * Extract markdown image refs `![alt](path)` from body content.
 * Only returns local/relative paths (not http/https URLs).
 */
export function extractImageRefsFromBody(content: string): string[] {
  const refs: string[] = [];
  // Match ![alt](path) where path is NOT an http/https URL
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    const ref = match[2].trim();
    if (ref && !ref.startsWith('http://') && !ref.startsWith('https://')) {
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * Find image refs in body content whose files don't exist on disk.
 * Resolves relative paths from the document's directory.
 */
export function findMissingImageRefs(docDir: string): Array<{ file: string; ref: string }> {
  const missing: Array<{ file: string; ref: string }> = [];

  function walkDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden directories and provider dirs
        if (!entry.name.startsWith('.') && !entry.name.startsWith('_')) {
          walkDir(fullPath);
        }
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const imageRefs = extractImageRefsFromBody(content);
        for (const ref of imageRefs) {
          // Resolve relative to the document's directory
          const resolved = path.isAbsolute(ref)
            ? ref
            : path.resolve(path.dirname(fullPath), ref);
          if (!fs.existsSync(resolved)) {
            missing.push({ file: path.relative(docDir, fullPath), ref });
          }
        }
      }
    }
  }

  walkDir(docDir);
  return missing;
}
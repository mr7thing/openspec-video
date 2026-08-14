// ============================================================================
// OpsV opsv validate (v0.11.0)
// Multi-dir scan, maxDepth, exclude, skip dot-dirs
// --inline: validate proposed content (file/stdin) via the shared core/Validator
// kernel — the disk scan and inline mode share one implementation (A6).
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { logger } from '../utils/logger';
import { resolveProjectRoot } from '../utils/projectResolver';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { AssetManager } from '../core/AssetManager';
import { ManifestReader } from '../core/ManifestReader';
import { CircleManifest } from '../types/ManifestSchema';
import { CategoryValidateLoader } from '../utils/categoryValidateLoader';
import { InputTypesLoader } from '../utils/inputTypesLoader';
import { ValidationIssue } from '../core/CategoryValidator';
import { parseAssetDocument } from '../canonical/parser/CanonicalNormalizer';
import { resolveDocumentContract } from '../core/PackContracts';
import {
  DocumentValidationContext,
  DocumentValidationResult,
  VALIDATOR_CONTRACT_VERSION,
  hashProposedContent,
  validateDocumentContent,
} from '../core/Validator';
import { addDirOption, resolveDirs, DEFAULT_SCAN_DIRS } from '../utils/dirOption';

interface ValidateCommandOptions {
  dir?: string[];
  category?: string;
  strict?: boolean;
  skipCategoryRules?: boolean;
  exclude?: string[];
  maxDepth?: string;
  circle?: string;
  categoryConfig?: string;
  inline?: string | boolean;
  json?: boolean;
}

export function registerValidateCommand(program: Command, version: string): void {
  const validateCmd = program
    .command('validate')
    .description('Validate project documents and frontmatter');
  addDirOption(validateCmd);
  validateCmd
    .option('--exclude <patterns...>', 'Exclude paths matching these patterns (relative to project root)')
    .option('--max-depth <number>', 'Max scan depth (default: 1, -1=unlimited, 0=root only)', (v) => v)
    .option('--category <cat>', 'Only validate documents of this category')
    .option('--strict', 'Treat warnings as errors (non-zero exit)')
    .option('--skip-category-rules', 'Skip category_validate.yaml rule checks')
    .option('--category-config <path>', 'Explicit path to category validate config (resolves conflicts; overrides discovery)')
    .option('--circle [path]', 'Validate only documents in a specific circle. Accepts circle dir or manifest path. Auto-discovers latest if omitted.')
    .option('--inline [path]', 'Validate proposed content (frontmatter+body) from a file, or stdin when no path given, instead of scanning disk')
    .option('--json', 'Machine-readable JSON report on stdout (inline mode)')
    .action(async (options: ValidateCommandOptions) => {
      try {
        if (options.inline !== undefined) {
          await runInlineValidate(options);
          return;
        }
        const projectRoot = resolveProjectRoot(process.cwd());
        const dirs = resolveDirs(options.dir, projectRoot, { log: console.log });
        const maxDepth = options.maxDepth !== undefined ? parseInt(options.maxDepth, 10) : 1;

        // Load category rules + input_types registry
        const catLoader = new CategoryValidateLoader();
        const catResult = catLoader.load(projectRoot, { explicitPath: options.categoryConfig });
        // If discovery found conflicting configs, abort (user must resolve with --category-config)
        if (catResult.discovery.errors.length > 0) {
          console.error(chalk.red(`\nResolve the category validate config conflict above before running validate.\n`));
          process.exit(2);
        }
        const inputTypes = new InputTypesLoader();
        inputTypes.load(projectRoot, { silent: true });

        let circleManifest: CircleManifest | null = null;
        let circleName: string | null = null;
        let circleTargetRoot: string | null = null;
        const allEntries = new Map<string, { id: string; filePath: string; relativePath: string }>();
        const allDuplicates: string[] = [];
        const scannedDirs: string[] = [];

        // Circle mode: load documents from Circle manifest
        if (options.circle !== undefined) {
          const manifestReader = new ManifestReader();
          const circleInfo = manifestReader.resolveForReview(projectRoot, options.circle);
          if (!circleInfo) {
            console.error(chalk.red(`No circle manifest found. Run "opsv circle create" first.`));
            process.exit(1);
          }
          circleManifest = circleInfo.manifest;
          circleName = circleInfo.circleName;
          scannedDirs.push(circleInfo.circleName);

          const assetsMap = circleInfo.manifest.assets || {};
          const assetIds = Object.keys(assetsMap);
          const targetRoot = path.resolve(projectRoot, circleInfo.manifest.target || 'videospec');
          circleTargetRoot = targetRoot;

          console.log(chalk.cyan(`Circle: ${circleInfo.circleName} (${assetIds.length} assets)`));
          console.log(chalk.cyan(`  Target: ${targetRoot}`));

          for (const assetId of assetIds) {
            const docPath = AssetManager.findAssetFilePathUnder(targetRoot, assetId);
            if (!docPath) {
              console.log(chalk.yellow(`  ${assetId}: document file not found, skipping`));
              continue;
            }
            const relativePath = path.relative(projectRoot, docPath);
            allEntries.set(assetId, { id: assetId, filePath: docPath, relativePath });
          }

          console.log(chalk.cyan(`  Documents found: ${allEntries.size}/${assetIds.length}`));
        } else {
          // Build index per directory, merge results
          for (const rawDir of dirs) {
            const targetDir = path.resolve(projectRoot, rawDir);

            if (!fs.existsSync(targetDir)) {
              console.log(chalk.yellow(`Directory not found, skipping: ${targetDir}`));
              continue;
            }

            if (!fs.statSync(targetDir).isDirectory()) {
              console.log(chalk.yellow(`Not a directory, skipping: ${targetDir}`));
              continue;
            }

            const index = buildAssetDocIndex(targetDir, {
              maxDepth,
              excludePatterns: options.exclude,
              projectRoot,
            });

            for (const [id, entry] of index.entries) {
              allEntries.set(id, entry);
            }
            allDuplicates.push(...index.duplicates);
            scannedDirs.push(rawDir);

            console.log(chalk.cyan(`  ${chalk.bold(rawDir)}: ${index.entries.size} document(s)`));
          }
        }

        if (allEntries.size === 0) {
          console.log(chalk.yellow(`No .md files found in any target directory.`));
          return;
        }

        if (circleName) {
          console.log(chalk.cyan(`\nTotal: ${allEntries.size} document(s) in circle "${circleName}"`));
        } else {
          console.log(chalk.cyan(`\nTotal: ${allEntries.size} document(s) across ${scannedDirs.length} director(ies)`));
        }

        if (allDuplicates.length > 0) {
          const uniqueDups = [...new Set(allDuplicates)];
          console.log(chalk.yellow(`\n${uniqueDups.length} duplicate assetId(s) found:`));
          for (const id of uniqueDups) {
            console.log(chalk.yellow(`  "${id}"`));
          }
        }

        let totalFiles = 0;
        let validFiles = 0;
        const errors: Array<{ file: string; message: string }> = [];
        const canonicalWarnings: Array<{ file: string; message: string }> = [];
        const deadRefs: Array<{ file: string; ref: string; relPath: string }> = [];
        const missingImages: Array<{ file: string; ref: string }> = [];
        const statusIssues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
        const categoryIssues: Array<{ file: string; issue: ValidationIssue }> = [];

        // Shared validation kernel context — identical to --inline mode (A6).
        const docCtx: DocumentValidationContext = {
          knownAssetIds: new Set(allEntries.keys()),
          getCategoryRule: (cat) => catLoader.getRule(cat),
          inputTypes,
          skipCategoryRules: options.skipCategoryRules,
        };

        for (const [assetId, entry] of allEntries) {
          // Circle mode: validate all files; global mode: skip root-level documents
          const isRootLevel = path.dirname(entry.relativePath) === '.';
          if (!circleManifest && isRootLevel) {
            continue;
          }
            totalFiles++;
            let result: DocumentValidationResult;
            try {
              const content = fs.readFileSync(entry.filePath, 'utf-8');
              result = validateDocumentContent(content, docCtx);
              // P7: canonical parser smoke check — exercise the IR on every real
              // document. Warn-only; a throw here means a parser regression, not
              // a document defect (valid docs always parse canonically).
              try {
                parseAssetDocument(content);
              } catch (err: any) {
                canonicalWarnings.push({ file: entry.relativePath, message: err.message });
              }
            } catch (err: any) {
              errors.push({ file: entry.relativePath, message: err.message });
              continue;
            }

            const frontmatter = result.frontmatter ?? {};

            if (options.category && frontmatter.category !== options.category) {
              totalFiles--;
              continue;
            }

            for (const issue of result.issues) {
              switch (issue.source) {
                case 'frontmatter':
                case 'refs':
                  errors.push({ file: entry.relativePath, message: issue.message });
                  break;
                case 'category':
                  categoryIssues.push({
                    file: entry.relativePath,
                    issue: {
                      severity: issue.severity,
                      category: issue.category ?? String(frontmatter.category ?? ''),
                      field: issue.field,
                      message: issue.message,
                    },
                  });
                  break;
                case 'ref-target':
                  // Dead link detection: refs target docs must exist
                  deadRefs.push({ file: entry.relativePath, ref: issue.ref ?? '', relPath: entry.relativePath });
                  break;
              }
            }

            // Circle mode: check manifest status vs frontmatter status
            if (result.schemaValid && circleManifest && circleManifest.assets) {
              const manifestEntry = circleManifest.assets[assetId];
              if (manifestEntry && frontmatter.status) {
                const manifestStatus = manifestEntry.status;
                const docStatus = frontmatter.status;
                if (docStatus !== manifestStatus) {
                  statusIssues.push({
                    file: entry.relativePath,
                    docStatus,
                    manifestStatus,
                  });
                }
              }
            }

            if (result.schemaValid) validFiles++;
        }

        // Image ref existence check
        if (circleManifest && circleTargetRoot) {
          // Circle mode: scan the target directory where circle documents live
          const foundMissingImages = findMissingImageRefs(circleTargetRoot);
          missingImages.push(...foundMissingImages);
        } else {
          for (const rawDir of scannedDirs) {
            const imageDir = path.resolve(projectRoot, rawDir);
            const foundMissingImages = findMissingImageRefs(imageDir);
            missingImages.push(...foundMissingImages);
          }
        }

        // Status consistency check (global mode only — circle mode checks inline)
        if (!circleManifest) {
          const foundStatusIssues = findStatusInconsistencies(projectRoot);
          statusIssues.push(...foundStatusIssues);
        }

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

        if (canonicalWarnings.length > 0) {
          console.log(chalk.yellow(`\n${canonicalWarnings.length} canonical parse warning(s):`));
          for (const w of canonicalWarnings) {
            console.log(chalk.yellow(`  ${w.file}: ${w.message}`));
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

// ---------------------------------------------------------------------------
// --inline mode (A6): validate proposed content via the shared core/Validator
// kernel. No .trellis/ access — works in Trellis-free projects.
// ---------------------------------------------------------------------------

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

/**
 * Best-effort Pack digest for the hook cache key (08-05 Go follow-up #2:
 * cache key = project + source path + proposed content hash + Pack
 * content_digest + validator contract version). Contract resolution failures
 * (no Pack exports the category, ambiguous export, invalid Pack) must not fail
 * content validation — an omitted digest simply forces the hook to re-validate.
 */
function resolvePackDigestForContent(
  projectRoot: string,
  frontmatter?: Record<string, any>,
): { id: string; version: string; contentDigest: string } | undefined {
  const category = frontmatter?.category;
  if (!category) return undefined;
  try {
    const contract = resolveDocumentContract(projectRoot, String(category), frontmatter?.profile);
    return {
      id: contract.pack.manifest.id,
      version: contract.pack.manifest.version,
      contentDigest: contract.pack.contentDigest,
    };
  } catch {
    return undefined;
  }
}

async function runInlineValidate(options: ValidateCommandOptions): Promise<void> {
  const projectRoot = resolveProjectRoot(process.cwd());

  // 1. Proposed content: explicit file path, or stdin when --inline is bare.
  let content: string;
  if (typeof options.inline === 'string') {
    const inlinePath = path.resolve(projectRoot, options.inline);
    if (!fs.existsSync(inlinePath) || !fs.statSync(inlinePath).isFile()) {
      console.error(chalk.red(`Inline file not found: ${inlinePath}`));
      process.exit(1);
    }
    content = fs.readFileSync(inlinePath, 'utf-8');
  } else {
    content = await readStdin();
    if (!content.trim()) {
      console.error(chalk.red('No proposed content on stdin. Pipe frontmatter+body, or use --inline <path>.'));
      process.exit(2);
    }
  }

  // 2. Same loaders as the disk path (.opsv/ + user tier only — never .trellis/).
  const catLoader = new CategoryValidateLoader();
  const catResult = catLoader.load(projectRoot, { explicitPath: options.categoryConfig });
  if (catResult.discovery.errors.length > 0) {
    console.error(chalk.red(`\nResolve the category validate config conflict above before running validate.\n`));
    process.exit(2);
  }
  const inputTypes = new InputTypesLoader();
  inputTypes.load(projectRoot, { silent: true });

  // 3. Known asset ids for the dead-ref pass — best-effort over scan dirs.
  //    When no scan dir exists (standalone), omit the set so the check skips
  //    instead of flagging every external ref as missing.
  const knownAssetIds = new Set<string>();
  let indexAvailable = false;
  for (const rawDir of options.dir ?? DEFAULT_SCAN_DIRS) {
    const targetDir = path.resolve(projectRoot, rawDir);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) continue;
    indexAvailable = true;
    const index = buildAssetDocIndex(targetDir, { projectRoot });
    for (const id of index.entries.keys()) knownAssetIds.add(id);
  }

  // 4. Shared kernel — identical implementation to the disk scan.
  const result = validateDocumentContent(content, {
    knownAssetIds: indexAvailable ? knownAssetIds : undefined,
    getCategoryRule: (cat) => catLoader.getRule(cat),
    inputTypes,
    skipCategoryRules: options.skipCategoryRules,
  });

  const frontmatter = result.frontmatter ?? {};
  if (options.category && frontmatter.category !== options.category) {
    console.log(chalk.yellow(`Skipped: document category "${frontmatter.category}" does not match --category ${options.category}`));
    return;
  }

  const pack = resolvePackDigestForContent(projectRoot, frontmatter);
  const proposedContentHash = hashProposedContent(content);

  const errorIssues = result.issues.filter((i) => i.severity === 'error');
  const warningIssues = result.issues.filter((i) => i.severity === 'warning');
  const failed = errorIssues.length > 0 || (options.strict && warningIssues.length > 0);

  if (options.json) {
    // Machine channel: stdout carries JSON only (human diagnostics go to stderr).
    process.stdout.write(JSON.stringify({
      validatorContractVersion: VALIDATOR_CONTRACT_VERSION,
      proposedContentHash,
      pack,
      ok: !failed,
      issues: result.issues,
    }, null, 2) + '\n');
  } else {
    console.log(chalk.cyan('Proposed content validation (inline)'));
    console.log(chalk.gray(`  proposedContentHash: ${proposedContentHash}`));
    if (pack) {
      console.log(chalk.gray(`  pack: ${pack.id}@${pack.version} content_digest=${pack.contentDigest}`));
    }
    if (errorIssues.length > 0) {
      console.log(chalk.red(`\n${errorIssues.length} error(s):`));
      for (const issue of errorIssues) {
        const f = issue.field ? `[${issue.field}] ` : '';
        console.log(chalk.red(`  [${issue.code}] ${f}${issue.message}`));
      }
    }
    if (warningIssues.length > 0) {
      console.log(chalk.yellow(`\n${warningIssues.length} warning(s):`));
      for (const issue of warningIssues) {
        const f = issue.field ? `[${issue.field}] ` : '';
        console.log(chalk.yellow(`  [${issue.code}] ${f}${issue.message}`));
      }
    }
    if (!failed) {
      console.log(chalk.green('\nProposed content valid!'));
    }
  }

  if (failed) {
    process.exit(1);
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

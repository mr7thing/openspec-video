// ============================================================================
// OpsV v0.8.8 — opsv imagen
// Reads from circle manifest, compiles to circle/{model}/
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { CircleAssetEntry } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver } from '../core/RefResolver';
import { DesignRefReader } from '../core/DesignRefReader';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';
import { resolveManifestPath, parseStatusSkip, filterAssets, buildProduceContext, validateRefStatuses } from './produceUtils';

export function registerImagenCommand(program: Command): void {
  program
    .command('imagen')
    .description('Compile image generation tasks from circle manifest')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seadream)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category (e.g. character, prop, scene)')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved, use "none" to skip nothing)')
    .option('--file <id>', 'Run specific asset by id (from manifest)')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;

        // Resolve manifest path
        const manifestPath = resolveManifestPath(projectRoot, options.manifest);
        const circleDir = path.dirname(manifestPath);

        const { assetManager, designRefReader, refResolver } = await buildProduceContext(projectRoot);

        // Read assets from circle manifest
        const circleAssets = await assetManager.loadCircleAssets(circleDir);

        // Filter by file, category, and status
        const skipStatuses = parseStatusSkip(options.statusSkip);
        const targetAssets = filterAssets(circleAssets.assets, options.file, options.category, skipStatuses);

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending image assets found.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} image tasks for ${modelKey}...`));
        console.log(chalk.gray(`Manifest: ${manifestPath}`));

        // Build manifest assets map for ref status validation
        const manifestAssets: Record<string, { status: string }> = {};
        for (const a of circleAssets.assets) {
          manifestAssets[a.id] = { status: a.status };
        }

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          // Validate ref statuses - all refs must be approved
          const refErrors = validateRefStatuses(asset, manifestAssets);
          if (refErrors.length > 0) {
            console.log(chalk.yellow(`  Skipping ${asset.id}: ${refErrors.join(', ')}`));
            continue;
          }

          const job = await buildImageJob(asset, refResolver, designRefReader);
          jobs.push(job);
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs compiled after validation.'));
          return;
        }

        // Output to circleDir/{model}/
        const outputDir = path.join(circleDir, modelKey);
        const builder = new TaskBuilder(projectRoot);

        const results = builder.compileToDir(jobs, modelKey, outputDir, options.dryRun);

        if (options.dryRun) {
          console.log(chalk.cyan('\n[dry-run] Compiled tasks:'));
          for (const task of results) {
            console.log(`  ${task._opsv.shotId}: ${JSON.stringify(task, null, 2).slice(0, 100)}...`);
          }
        } else {
          console.log(chalk.green(`\n${results.length} tasks compiled to ${outputDir}`));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

async function buildImageJob(
  asset: CircleAssetEntry,
  refResolver: RefResolver,
  designRefReader: DesignRefReader
): Promise<Job> {
  const filePath = asset.filePath;
  if (!filePath) {
    throw new Error(`File path not found for asset: ${asset.id}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = frontmatter.prompt_en || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  let referenceImages: string[] = [];
  if (frontmatter.refs && frontmatter.refs.length > 0) {
    const refs = await refResolver.parseAll(body);
    referenceImages = refs
      .filter((r) => r.resolvedImagePath)
      .map((r) => r.resolvedImagePath!);
  }

  // Load design refs directly from file
  const designRefs = await designRefReader.getAll(filePath);
  if (designRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...designRefs.map((r) => r.filePath),
    ];
  }

  return {
    id: asset.id,
    type: 'imagen',
    prompt_en: prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: '1:1',
        quality: 'standard',
      },
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
  };
}

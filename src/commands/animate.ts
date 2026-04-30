// ============================================================================
// OpsV v0.8.6 — opsv animate
// Reads from circle manifest, compiles to circle/{model}/
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { AssetManager, CircleAssetEntry } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DesignRefReader } from '../core/DesignRefReader';
import { Job, FrameRef } from '../types/Job';
import { logger } from '../utils/logger';

export function registerAnimateCommand(program: Command): void {
  program
    .command('animate')
    .description('Compile video generation tasks from circle manifest')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seedance2)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category (e.g. shot-production, shot-design)')
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

        const assetManager = new AssetManager(projectRoot);
        const approvedRefReader = new ApprovedRefReader(projectRoot);
        const designRefReader = new DesignRefReader(projectRoot);
        const refResolver = new RefResolver(projectRoot, approvedRefReader);

        // Read assets from circle manifest
        const circleAssets = await assetManager.loadCircleAssets(circleDir);

        // Parse status-skip option (default: approved)
        const statusSkipStr = options.statusSkip || 'approved';
        const skipStatuses = statusSkipStr === 'none'
          ? []
          : statusSkipStr.split(',').map((s: string) => s.trim());

        // Filter by file (if specified), category, and status
        let targetAssets = circleAssets.assets;
        if (options.file) {
          targetAssets = targetAssets.filter((a) => a.id === options.file);
          if (targetAssets.length === 0) {
            throw new Error(`Asset "${options.file}" not found in manifest`);
          }
        }
        targetAssets = targetAssets.filter((a) => {
          if (skipStatuses.includes(a.status)) return false;
          if (options.category && a.category !== options.category) return false;
          return true;
        });

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending shot assets found.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} video tasks for ${modelKey}...`));
        console.log(chalk.gray(`Manifest: ${manifestPath}`));

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          const job = await buildVideoJob(asset, refResolver, designRefReader);
          jobs.push(job);
        }

        // Output to circleDir/{model}/
        const outputDir = path.join(circleDir, modelKey);
        const builder = new TaskBuilder(projectRoot);

        const results = builder.compileToDir(jobs, modelKey, outputDir, options.dryRun);

        if (options.dryRun) {
          console.log(chalk.cyan('\n[dry-run] Compiled tasks:'));
          for (const task of results) {
            console.log(`  ${task._opsv.shotId}`);
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

function resolveManifestPath(cwd: string, manifestOption?: string): string {
  if (manifestOption) {
    const manifestPath = fs.statSync(manifestOption).isDirectory()
      ? path.join(manifestOption, '_manifest.json')
      : manifestOption;
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }
    return manifestPath;
  }

  // Check current directory
  const currentManifest = path.join(cwd, '_manifest.json');
  if (fs.existsSync(currentManifest)) {
    return currentManifest;
  }

  // Check parent directory
  const parentManifest = path.join(cwd, '..', '_manifest.json');
  if (fs.existsSync(parentManifest)) {
    return parentManifest;
  }

  throw new Error(
    `No _manifest.json found. Run inside a circle directory or use --manifest <path>.`
  );
}

async function buildVideoJob(
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

  const prompt = frontmatter.prompt_en || frontmatter.visual_detailed || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  let frameRef: FrameRef | undefined;
  if (frontmatter.frame_ref) {
    frameRef = {
      first: frontmatter.frame_ref.first || null,
      last: frontmatter.frame_ref.last || null,
    };
  } else if (frontmatter.first_frame || frontmatter.last_frame) {
    frameRef = {
      first: frontmatter.first_frame || null,
      last: frontmatter.last_frame || null,
    };
  }

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
    type: 'video',
    prompt_en: prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: '16:9',
        quality: 'standard',
      },
      duration: frontmatter.duration,
      frame_ref: frameRef,
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
  };
}

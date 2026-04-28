// ============================================================================
// OpsV v0.8 — opsv webapp
// Browser automation via Chrome extension HTTP API
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { AssetManager } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';

export function registerWebappCommand(program: Command): void {
  program
    .command('webapp')
    .description('Compile browser automation tasks for a specific webapp model')
    .requiredOption('--model <model>', 'Webapp model key (e.g. webapp.gemini)')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .option('--circle <name>', 'Target circle (default: auto-detect)')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;

        const assetManager = new AssetManager(projectRoot);
        await assetManager.loadFromVideospec();

        const approvedRefReader = new ApprovedRefReader(projectRoot);
        const refResolver = new RefResolver(projectRoot, approvedRefReader);

        const circleName = await resolveCircle(projectRoot, options.circle);
        const circleDir = path.join(projectRoot, 'opsv-queue', 'videospec', circleName);

        const circleAssets = await assetManager.loadCircleAssets(circleDir);
        const targetIds = circleAssets.assets
          .filter((a: any) => a.status !== 'approved')
          .map((a: any) => a.id);

        const allAssets = assetManager.getAllAssets();
        const targetAssets = allAssets.filter((a) => targetIds.includes(a.id));

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending assets found in this circle.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} webapp tasks for ${modelKey}...`));

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          const job = await buildWebappJob(asset, refResolver, projectRoot);
          jobs.push(job);
        }

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
          console.log(chalk.gray(`Run: opsv run ${outputDir}`));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

async function resolveCircle(projectRoot: string, circleName?: string): Promise<string> {
  if (circleName) return circleName;

  const manifestPath = path.join(projectRoot, 'opsv-queue', 'videospec', '_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const circles = manifest.circles || [];
    for (const circle of circles) {
      const hasPending = Object.values(circle.status || {}).some((s) => s !== 'approved');
      if (hasPending) return circle.circle;
    }
    if (circles.length > 0) return circles[0].circle;
  }

  return 'zerocircle';
}

async function buildWebappJob(asset: any, refResolver: RefResolver, projectRoot: string): Promise<Job> {
  const content = fs.readFileSync(asset.filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = frontmatter.prompt_en || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  let referenceImages: string[] = [];
  if (frontmatter.refs && frontmatter.refs.length > 0) {
    const refs = await refResolver.parseAll(body);
    referenceImages = refs
      .filter((r) => r.resolvedImagePath)
      .map((r) => r.resolvedImagePath!);
  }

  if (asset.approvedRefs && asset.approvedRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...asset.approvedRefs.map((r: any) => r.filePath),
    ];
  }

  let frameRef;
  if (frontmatter.frame_ref) {
    frameRef = {
      first: frontmatter.frame_ref.first || null,
      last: frontmatter.frame_ref.last || null,
    };
  }

  return {
    id: asset.id,
    type: 'webapp',
    prompt_en: prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: frontmatter.aspect_ratio || '1:1',
        quality: 'standard',
      },
      frame_ref: frameRef,
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
  };
}

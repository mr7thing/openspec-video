// ============================================================================
// OpsV v0.8 — opsv imagen
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { AssetManager, Asset } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver } from '../core/RefResolver';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { Job, JobType } from '../types/Job';
import { FileUtils } from '../utils/FileUtils';
import { logger } from '../utils/logger';

export function registerImagenCommand(program: Command): void {
  program
    .command('imagen')
    .description('Compile image generation tasks for a specific model')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seadream)')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .option('--circle <name>', 'Target circle (default: auto-detect from _assets.json)')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;
        const { provider } = TaskBuilder.parseModelKey(modelKey);

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

        const allAssets = assetManager.getAllElements();
        const targetAssets = allAssets.filter((a) => targetIds.includes(a.id));

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending image assets found in this circle.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} image tasks for ${modelKey}...`));

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          const job = await buildImageJob(asset, refResolver, projectRoot);
          jobs.push(job);
        }

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

async function buildImageJob(asset: Asset, refResolver: RefResolver, projectRoot: string): Promise<Job> {
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

  if (asset.approvedRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...asset.approvedRefs.map((r) => r.filePath),
    ];
  }

  return {
    id: asset.id,
    type: 'image_generation',
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

// ============================================================================
// OpsV v0.8 — opsv animate
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
import { Job, FrameRef } from '../types/Job';
import { logger } from '../utils/logger';

export function registerAnimateCommand(program: Command): void {
  program
    .command('animate')
    .description('Compile video generation tasks for a specific model')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seedance2)')
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

        const circleName = resolveCircle(projectRoot, options.circle);
        const circleDir = path.join(projectRoot, 'opsv-queue', 'videospec', circleName);

        const circleAssets = await assetManager.loadCircleAssets(circleDir);
        const targetIds = circleAssets.assets
          .filter((a: any) => a.status !== 'approved')
          .map((a: any) => a.id);

        const allAssets = assetManager.getAllAssets();
        const shotAssets = allAssets.filter(
          (a) => targetIds.includes(a.id) && (a.type === 'shot-production' || a.type === 'shot-design')
        );

        if (shotAssets.length === 0) {
          console.log(chalk.yellow('No pending shot assets found in this circle.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${shotAssets.length} video tasks for ${modelKey}...`));

        const jobs: Job[] = [];
        for (const asset of shotAssets) {
          const job = await buildVideoJob(asset, refResolver, projectRoot, circleDir, modelKey);
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
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

function resolveCircle(projectRoot: string, circleName?: string): string {
  if (circleName) return circleName;

  const manifestPath = path.join(projectRoot, 'opsv-queue', 'videospec', '_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const circles = manifest.circles || [];
    for (const circle of circles) {
      const hasPending = Object.values(circle.status || {}).some((s) => s !== 'approved');
      if (hasPending) return circle.circle;
    }
    if (circles.length > 0) return circles[circles.length - 1].circle;
  }

  return 'zerocircle';
}

async function buildVideoJob(
  asset: Asset,
  refResolver: RefResolver,
  projectRoot: string,
  circleDir: string,
  modelKey: string
): Promise<Job> {
  const content = fs.readFileSync(asset.filePath, 'utf-8');
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

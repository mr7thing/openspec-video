// ============================================================================
// OpsV v0.8 — opsv comfy
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { AssetManager, Asset } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';

export function registerComfyCommand(program: Command): void {
  program
    .command('comfy')
    .description('Compile ComfyUI workflow tasks for a specific model')
    .requiredOption('--model <model>', 'ComfyUI model key (e.g. comfy.sdxl)')
    .option('--dir <path>', 'Project videospec directory', 'videospec')
    .option('--circle <name>', 'Target circle (default: auto-detect)')
    .option('--param <json>', 'Override workflow parameters as JSON')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;

        const assetManager = new AssetManager(projectRoot);
        await assetManager.loadFromVideospec();

        const circleName = resolveCircle(projectRoot, options.circle);
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

        console.log(chalk.cyan(`Compiling ${targetAssets.length} comfy tasks for ${modelKey}...`));

        let paramOverrides: Record<string, any> = {};
        if (options.param) {
          try {
            paramOverrides = JSON.parse(options.param);
          } catch {
            console.error(chalk.red('--param must be valid JSON'));
            process.exit(1);
          }
        }

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          const job = buildComfyJob(asset, paramOverrides);
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
    if (circles.length > 0) return circles[0].circle;
  }

  return 'zerocircle';
}

function buildComfyJob(asset: Asset, paramOverrides: Record<string, any>): Job {
  const content = fs.readFileSync(asset.filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = frontmatter.prompt_en || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  return {
    id: asset.id,
    type: frontmatter.type === 'shot-production' ? 'video' : 'imagen',
    prompt_en: prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: '1:1',
        quality: 'standard',
      },
      extra: {
        media_refs: [],
        ...paramOverrides,
      },
    },
  };
}

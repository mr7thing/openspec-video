// ============================================================================
// OpsV v0.8.2 — opsv comfy
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { AssetManager, Asset } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { DependencyGraph } from '../core/DependencyGraph';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';

export function registerComfyCommand(program: Command): void {
  program
    .command('comfy')
    .description('Compile ComfyUI workflow tasks for a specific model')
    .requiredOption('--model <model>', 'ComfyUI model key (e.g. comfy.sdxl)')
    .option('--dir <path>', 'Target directory (must match circle create --dir)', 'videospec')
    .option('--name <name>', 'Override target basename')
    .option('--param <json>', 'Override workflow parameters as JSON')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;

        const assetManager = new AssetManager(projectRoot);
        await assetManager.loadFromVideospec();

        const { circleDir } = resolveTarget(projectRoot, options.dir, options.name);

        const pendingIds = readPendingAssetIds(circleDir);

        const allAssets = assetManager.getAllAssets();
        const targetAssets = allAssets.filter((a) => pendingIds.includes(a.id));

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

function readPendingAssetIds(circleDir: string): string[] {
  const manifestPath = path.join(circleDir, '_manifest.json');
  if (!fs.existsSync(manifestPath)) return [];

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const assets: Record<string, any> = manifest.assets || {};
  return Object.entries(assets)
    .filter(([_, info]) => info.status !== 'approved')
    .map(([id]) => id);
}

function resolveTarget(projectRoot: string, dirOption?: string, nameOption?: string): { targetDir: string; circleDir: string } {
  const basename = nameOption || DependencyGraph.resolveTargetBasename(dirOption || 'videospec');
  const queueRoot = path.join(projectRoot, 'opsv-queue');

  const maxN = DependencyGraph.findLatestCircleN(queueRoot, basename);
  if (maxN === 0) {
    throw new Error(`No circle found for "${basename}". Run "opsv circle create --dir ${dirOption || 'videospec'}" first.`);
  }

  const circleDir = path.join(queueRoot, `${basename}.circle${maxN}`);
  return { targetDir: dirOption || 'videospec', circleDir };
}

function buildComfyJob(asset: Asset, paramOverrides: Record<string, any>): Job {
  const content = fs.readFileSync(asset.filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = frontmatter.prompt_en || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  return {
    id: asset.id,
    type: 'comfy' as const,
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

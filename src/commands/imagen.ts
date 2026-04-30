// ============================================================================
// OpsV v0.8.2 — opsv imagen
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
import { DependencyGraph } from '../core/DependencyGraph';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';

export function registerImagenCommand(program: Command): void {
  program
    .command('imagen')
    .description('Compile image generation tasks for a specific model')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seadream)')
    .option('--dir <path>', 'Target directory (must match circle create --dir)', 'videospec')
    .option('--name <name>', 'Override target basename')
    .option('--category <cat>', 'Filter assets by category (e.g. character, prop, scene)')
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

        const { circleDir } = resolveTarget(projectRoot, options.dir, options.name);

        // Read pending asset IDs from _manifest.json
        const pendingIds = readPendingAssetIds(circleDir);

        const allAssets = options.category
          ? assetManager.getByCategory(options.category)
          : assetManager.getAllAssets();
        const targetAssets = allAssets.filter((a) => pendingIds.includes(a.id));

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

  if (asset.designRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...asset.designRefs.map((r) => r.filePath),
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

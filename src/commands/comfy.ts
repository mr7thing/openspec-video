// ============================================================================
// OpsV v0.8.4 — opsv comfy
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
import { DependencyGraph } from '../core/DependencyGraph';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';

export function registerComfyCommand(program: Command): void {
  program
    .command('comfy')
    .description('Compile ComfyUI workflow tasks for a specific model')
    .requiredOption('--model <model>', 'ComfyUI model key (e.g. comfyui.sdxl)')
    .option('--dir <path>', 'Target directory (must match circle create --dir)', 'videospec')
    .option('--name <name>', 'Override target basename')
    .option('--category <cat>', 'Filter assets by category')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved, use "none" to skip nothing)')
    .option('--workflow <file>', 'Specific workflow file (absolute path or filename in workflow-dir)')
    .option('--workflow-dir <dir>', 'Workflow template directory (overrides api_config defaults.templateDir)')
    .option('--param <json>', 'Override workflow parameters as JSON')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: any) => {
      try {
        const projectRoot = process.cwd();
        const modelKey = options.model;

        const assetManager = new AssetManager(projectRoot);
        const approvedRefReader = new ApprovedRefReader(projectRoot);
        const designRefReader = new DesignRefReader(projectRoot);
        const refResolver = new RefResolver(projectRoot, approvedRefReader);

        const { circleDir } = resolveTarget(projectRoot, options.dir, options.name);

        // Read assets from circle manifest (not from directory scan)
        const circleAssets = await assetManager.loadCircleAssets(circleDir);

        // Parse status-skip option (default: approved)
        const statusSkipStr = options.statusSkip || 'approved';
        const skipStatuses = statusSkipStr === 'none'
          ? []
          : statusSkipStr.split(',').map((s: string) => s.trim());

        // Filter by category (if specified) and skip specified statuses
        const targetAssets = circleAssets.assets.filter((a) => {
          if (skipStatuses.includes(a.status)) return false;
          if (options.category && a.category !== options.category) return false;
          return true;
        });

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

        const workflowPath: string | undefined = options.workflow;
        const workflowDir: string | undefined = options.workflowDir;

        const jobs: Job[] = [];
        const errors: string[] = [];

        for (const asset of targetAssets) {
          try {
            const job = await buildComfyJob(asset, refResolver, designRefReader, paramOverrides);
            jobs.push(job);
          } catch (err: any) {
            errors.push(`  ${asset.id}: ${err.message}`);
          }
        }

        if (errors.length > 0) {
          console.log(chalk.yellow(`\n${errors.length} asset(s) skipped due to errors:`));
          errors.forEach((e) => console.log(chalk.yellow(e)));
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs to compile after filtering.'));
          return;
        }

        const outputDir = path.join(circleDir, modelKey);
        const builder = new TaskBuilder(projectRoot);

        const results = builder.compileToDir(
          jobs, modelKey, outputDir, options.dryRun,
          workflowPath, workflowDir
        );

        if (options.dryRun) {
          console.log(chalk.cyan('\n[dry-run] Compiled tasks:'));
          for (const task of results) {
            const wf = task._opsv?.workflowFile || '?';
            console.log(`  ${task._opsv.shotId} (workflow: ${wf})`);
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

async function buildComfyJob(
  asset: CircleAssetEntry,
  refResolver: RefResolver,
  designRefReader: DesignRefReader,
  paramOverrides: Record<string, any>
): Promise<Job> {
  const filePath = asset.filePath;
  if (!filePath) {
    throw new Error(`File path not found for asset: ${asset.id}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = frontmatter.prompt_en || frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);

  // Collect reference images
  let referenceImages: string[] = [];

  // External refs (@assetId:variant → resolved image paths)
  if (frontmatter.refs && frontmatter.refs.length > 0) {
    const refs = await refResolver.parseAll(body);
    referenceImages = refs
      .filter((r) => r.resolvedImagePath)
      .map((r) => r.resolvedImagePath!);
  }

  // Internal design refs (## Design References)
  const designRefs = await designRefReader.getAll(filePath);
  if (designRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...designRefs.map((r) => r.filePath),
    ];
  }

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
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
  };
}

// ============================================================================
// OpsV opsv comfy
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { TaskBuilder } from '../core/compiler/TaskBuilder';
import { OpsVContext } from '../container/OpsVContext';
import { CircleAssetEntry } from '../core/AssetManager';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { RefResolver } from '../core/RefResolver';
import { DesignRefReader } from '../core/DesignRefReader';
import { Job } from '../types/Job';
import { logger } from '../utils/logger';
import { parseStatusSkip, filterAssets, buildProduceContext, validateRefStatuses, resolveModelQueueDir, ComfyCommandOptions, resolvePromptText } from './produceUtils';
import { ManifestReader } from '../core/ManifestReader';
import { resolveProjectRoot } from '../utils/projectResolver';

import { InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

export function registerComfyCommand(program: Command): void {
  program
    .command('comfy')
    .description('Compile ComfyUI workflow tasks from circle manifest')
    .requiredOption('--model <model>', 'ComfyUI model key (e.g. comfyui.sdxl)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved, use "none" to skip nothing)')
    .option('--file <id>', 'Run specific asset by id (from manifest)')
    .option('--workflow <file>', 'Workflow JSON file path (absolute or relative to project root)')
    .option('--param <json>', 'Override workflow parameters as JSON')
    .option('--force-api-mapping', 'Force use api_config.node_mappings, ignore frontmatter node_mapping')
    .option('--prompt-mode <mode>', 'Prompt @-token compile mode: keep | index | name')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: ComfyCommandOptions) => {
      try {
        const cwd = process.cwd();
        const modelKey = options.model;

        // Resolve manifest path and project root
        const manifestPath = new ManifestReader().resolveForProduce(cwd, options.manifest);
        const projectRoot = resolveProjectRoot(cwd);
        const circleDir = path.dirname(manifestPath);

        const { assetManager, designRefReader, refResolver } = await buildProduceContext(projectRoot);

        // Read assets from circle manifest
        const circleAssets = await assetManager.loadCircleAssets(circleDir);

        // Filter by file, category, and status
        const skipStatuses = parseStatusSkip(options.statusSkip);
        const targetAssets = filterAssets(circleAssets.assets, options.file, options.category, skipStatuses);

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending assets found in this circle.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} comfy tasks for ${modelKey}...`));
        console.log(chalk.gray(`Manifest: ${manifestPath}`));

        // Build manifest assets map for ref status validation
        const manifestAssets: Record<string, { status: string }> = {};
        for (const a of circleAssets.assets) {
          manifestAssets[a.id] = { status: a.status };
        }

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

        const jobs: Job[] = [];
        const errors: string[] = [];

        for (const asset of targetAssets) {
          // Validate ref statuses - all refs must be approved
          const refErrors = validateRefStatuses(asset, manifestAssets);
          if (refErrors.length > 0) {
            errors.push(`  ${asset.id}: ${refErrors.join(', ')}`);
            continue;
          }

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

        // Output to circleDir/{model}_NNN/
        const outputDir = resolveModelQueueDir(circleDir, modelKey);
        const ctx = OpsVContext.create(cwd);
        const builder = new TaskBuilder(ctx);

        const results = await builder.compileToDir(
          jobs, modelKey, outputDir, options.dryRun,
          workflowPath, options.forceApiMapping, options.promptMode
        );

        if (options.dryRun) {
          console.log(chalk.cyan('\n[dry-run] Compiled tasks:'));
          for (const task of results) {
            const wf = task._opsv?.workflowId || task._opsv?.workflowFile || '?';
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

async function buildComfyJob(
  asset: CircleAssetEntry,
  refResolver: RefResolver,
  designRefReader: DesignRefReader,
  paramOverrides: Record<string, any>
): Promise<Job> {
  const filePath = asset.filePath;
  if (!filePath) {
    throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `File path not found for asset: ${asset.id}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = resolvePromptText(frontmatter, body, asset.id);

  // Collect reference images
  let referenceImages: string[] = [];
  let referenceVideos: string[] = [];
  let referenceAudios: string[] = [];

  // v0.10.0: refs is { type: { key: paths[] } }; flatten image/video/audio paths
  const fmRefs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
  if (fmRefs.image) {
    for (const paths of Object.values(fmRefs.image)) {
      if (Array.isArray(paths)) referenceImages.push(...paths);
    }
  }
  if (fmRefs.video) {
    for (const paths of Object.values(fmRefs.video)) {
      if (Array.isArray(paths)) referenceVideos.push(...paths);
    }
  }
  if (fmRefs.audio) {
    for (const paths of Object.values(fmRefs.audio)) {
      if (Array.isArray(paths)) referenceAudios.push(...paths);
    }
  }

  // Internal design refs (## Design References)
  const designRefs = await designRefReader.getAll(filePath);
  if (designRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...designRefs.map((r) => r.filePath),
    ];
  }

  // Video/audio refs from frontmatter (shot-production assets)
  const fmAny = frontmatter as any;
  if (fmAny.ref_videos) {
    referenceVideos = fmAny.ref_videos;
  }
  if (fmAny.ref_audios) {
    referenceAudios = fmAny.ref_audios;
  }

  // Deduplicate reference images
  referenceImages = [...new Set(referenceImages)];

  return {
    id: asset.id,
    type: 'comfy' as const,
    prompt: prompt,
    workflow: frontmatter.workflow,
    workflow_id: frontmatter.workflow_id,
    workflow_path: frontmatter.workflow_path,
    node_mapping: frontmatter.node_mapping,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: frontmatter.aspect_ratio,
        quality: frontmatter.quality || 'standard',
      },
      extra: {
        media_refs: [],
        negative_prompt: frontmatter.negative_prompt,
        ...paramOverrides,
      },
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
    reference_videos: referenceVideos.length > 0 ? referenceVideos : undefined,
    reference_audios: referenceAudios.length > 0 ? referenceAudios : undefined,
  };
}

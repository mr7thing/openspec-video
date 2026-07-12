// ============================================================================
// OpsV opsv produce — unified command for imagen / video / comfy
// Reads from circle manifest, compiles to circle/{model}/
// All type-specific behavior is driven by api_config.yaml (inputs + payload_example)
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
import { Job, FrameRef, PromptExtra } from '../types/Job';
import { logger } from '../utils/logger';
import { InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';
import { parseStatusSkip, filterAssets, buildProduceContext, validateRefStatuses, resolveModelQueueDir, resolvePromptText, resolveRefPaths } from './produceUtils';
import { ManifestReader } from '../core/ManifestReader';
import { resolveProjectRoot } from '../utils/projectResolver';

interface ProduceOptions {
  model: string;
  manifest?: string;
  category?: string;
  statusSkip?: string;
  file?: string;
  workflow?: string;
  param?: string;
  promptMode?: 'keep' | 'index' | 'name';
  dryRun?: boolean;
}

export function registerProduceCommand(program: Command): void {
  program
    .command('produce')
    .description('Compile generation tasks from circle manifest (imagen/video/comfy)')
    .requiredOption('--model <model>', 'Provider model key (e.g. volc.seedance2, rh-api.seedance)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category (e.g. shot-production, character)')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved)')
    .option('--file <id>', 'Run specific asset by id (from manifest)')
    .option('--workflow <file>', 'Workflow JSON file path (ComfyUI only)')
    .option('--param <json>', 'Override parameters as JSON (injected into payload.extra)')
    .option('--prompt-mode <mode>', 'Prompt @-token compile mode: keep | index | name')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: ProduceOptions) => {
      try {
        const cwd = process.cwd();
        const modelKey = options.model;

        const manifestPath = new ManifestReader().resolveForProduce(cwd, options.manifest);
        const projectRoot = resolveProjectRoot(cwd);
        const circleDir = path.dirname(manifestPath);

        const { assetManager, designRefReader, refResolver } = await buildProduceContext(projectRoot);

        const circleAssets = await assetManager.loadCircleAssets(circleDir);

        const skipStatuses = parseStatusSkip(options.statusSkip);
        const targetAssets = filterAssets(circleAssets.assets, options.file, options.category, skipStatuses);

        if (targetAssets.length === 0) {
          console.log(chalk.yellow('No pending assets found in this circle.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} tasks for ${modelKey}...`));
        console.log(chalk.gray(`Manifest: ${manifestPath}`));

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
          const refErrors = await validateRefStatuses(asset, manifestAssets, projectRoot);
          if (refErrors.length > 0) {
            errors.push(`  ${asset.id}: ${refErrors.join(', ')}`);
            continue;
          }

          try {
            const job = await buildProduceJob(asset, refResolver, designRefReader, projectRoot, paramOverrides);
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

        const outputDir = resolveModelQueueDir(circleDir, modelKey);
        const ctx = OpsVContext.create(cwd);
        const builder = new TaskBuilder(ctx);

        const results = await builder.compileToDir(
          jobs, modelKey, outputDir, options.dryRun,
          workflowPath, undefined, options.promptMode
        );

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

function resolveFrameRef(filePath: string, value: unknown): FrameRef | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return {
      first: resolveFramePath(filePath, obj.first as string | undefined),
      last: resolveFramePath(filePath, obj.last as string | undefined),
    };
  }
  return undefined;
}

function resolveFramePath(filePath: string, ref: string | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith('http') || ref.startsWith('data:')) return ref;
  return path.resolve(path.dirname(filePath), ref);
}

async function buildProduceJob(
  asset: CircleAssetEntry,
  refResolver: RefResolver,
  designRefReader: DesignRefReader,
  projectRoot: string,
  paramOverrides: Record<string, any>
): Promise<Job> {
  const filePath = asset.filePath;
  if (!filePath) {
    throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `File path not found for asset: ${asset.id}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = resolvePromptText(frontmatter, body, asset.id);

  // Resolve refs — unified handling for all types (image/video/audio)
  const fmRefs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
  let referenceImages: string[] = await resolveRefPaths(fmRefs, 'image', refResolver, projectRoot, filePath, asset.id);
  let referenceVideos: string[] = await resolveRefPaths(fmRefs, 'video', refResolver, projectRoot, filePath, asset.id);
  let referenceAudios: string[] = await resolveRefPaths(fmRefs, 'audio', refResolver, projectRoot, filePath, asset.id);

  // Design refs (inline ## refs in document)
  const designRefs = await designRefReader.getAll(filePath);
  if (designRefs.length > 0) {
    referenceImages = [...referenceImages, ...designRefs.map((r) => r.filePath)];
  }

  // Legacy flat ref_videos / ref_audios
  const fmAny = frontmatter as any;
  if (Array.isArray(fmAny.ref_videos)) {
    referenceVideos = [...referenceVideos, ...fmAny.ref_videos];
  }
  if (Array.isArray(fmAny.ref_audios)) {
    referenceAudios = [...referenceAudios, ...fmAny.ref_audios];
  }

  referenceImages = [...new Set(referenceImages)];

  // All non-core frontmatter fields → payload.extra (inputs reads from here)
  const extra: Record<string, any> = {
    media_refs: [],
    ...paramOverrides,
  };
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key !== 'prompt' && key !== 'refs' && value !== undefined) {

      extra[key] = value;
    }
  }

  return {
    id: asset.id,
    type: 'produce' as const,
    prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: (frontmatter as any).aspect_ratio,
        quality: (frontmatter as any).quality || 'standard',
      },
      frame_ref: resolveFrameRef(filePath, frontmatter.frame_ref),
      extra: extra as PromptExtra,
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
    reference_videos: referenceVideos.length > 0 ? referenceVideos : undefined,
    reference_audios: referenceAudios.length > 0 ? referenceAudios : undefined,
    workflow: frontmatter.workflow,
    workflow_id: frontmatter.workflow_id,
    workflow_path: frontmatter.workflow_path,
  };
}

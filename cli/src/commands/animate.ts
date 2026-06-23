// ============================================================================
// OpsV opsv animate
// Reads from circle manifest, compiles to circle/{model}/
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
import { Job, FrameRef } from '../types/Job';
import { logger } from '../utils/logger';
import { InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';
import { parseStatusSkip, filterAssets, buildProduceContext, validateRefStatuses, resolveModelQueueDir, ImageProduceCommandOptions, resolvePromptText, resolveRefPaths } from './produceUtils';
import { ManifestReader } from '../core/ManifestReader';
import { resolveProjectRoot } from '../utils/projectResolver';

function resolveFrameRef(filePath: string, frameRef: string | undefined): string | null {
  if (!frameRef) return null;
  if (frameRef.startsWith('http') || frameRef.startsWith('data:')) return frameRef;
  return path.resolve(path.dirname(filePath), frameRef);
}

export function registerAnimateCommand(program: Command): void {
  program
    .command('animate')
    .description('Compile video generation tasks from circle manifest')
    .requiredOption('--model <model>', 'Provider model key (e.g. volcengine.seedance2)')
    .option('--manifest <path>', 'Path to _manifest.json (or directory containing it)')
    .option('--category <cat>', 'Filter assets by category (e.g. shot-production, shot-design)')
    .option('--status-skip <statuses>', 'Comma-separated statuses to skip (default: approved, use "none" to skip nothing)')
    .option('--file <id>', 'Run specific asset by id (from manifest)')
    .option('--prompt-mode <mode>', 'Prompt @-token compile mode: keep | index | name')
    .option('--dry-run', 'Show compiled tasks without writing files')
    .action(async (options: ImageProduceCommandOptions) => {
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
          console.log(chalk.yellow('No pending shot assets found.'));
          return;
        }

        console.log(chalk.cyan(`Compiling ${targetAssets.length} video tasks for ${modelKey}...`));
        console.log(chalk.gray(`Manifest: ${manifestPath}`));

        // Build manifest assets map for ref status validation
        const manifestAssets: Record<string, { status: string }> = {};
        for (const a of circleAssets.assets) {
          manifestAssets[a.id] = { status: a.status };
        }

        const jobs: Job[] = [];
        for (const asset of targetAssets) {
          // Validate ref statuses - all refs must be approved
          const refErrors = validateRefStatuses(asset, manifestAssets);
          if (refErrors.length > 0) {
            console.log(chalk.yellow(`  Skipping ${asset.id}: ${refErrors.join(', ')}`));
            continue;
          }

          const job = await buildVideoJob(asset, refResolver, designRefReader, projectRoot);
          jobs.push(job);
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs compiled after validation.'));
          return;
        }

        // Output to circleDir/{model}_NNN/
        const outputDir = resolveModelQueueDir(circleDir, modelKey);
        const ctx = OpsVContext.create(cwd);
        const builder = new TaskBuilder(ctx);

        const results = await builder.compileToDir(jobs, modelKey, outputDir, options.dryRun, undefined, undefined, options.promptMode);

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

async function buildVideoJob(
  asset: CircleAssetEntry,
  refResolver: RefResolver,
  designRefReader: DesignRefReader,
  projectRoot: string
): Promise<Job> {
  const filePath = asset.filePath;
  if (!filePath) {
    throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `File path not found for asset: ${asset.id}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = FrontmatterParser.parseRaw(content);

  const prompt = resolvePromptText(frontmatter, body, asset.id);

  let frameRef: FrameRef | undefined;
  if (frontmatter.frame_ref) {
    frameRef = {
      first: resolveFrameRef(filePath, frontmatter.frame_ref.first),
      last: resolveFrameRef(filePath, frontmatter.frame_ref.last),
    };
  } else if (frontmatter.first_frame || frontmatter.last_frame) {
    frameRef = {
      first: resolveFrameRef(filePath, frontmatter.first_frame),
      last: resolveFrameRef(filePath, frontmatter.last_frame),
    };
  }

  const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
  let referenceImages: string[] = await resolveRefPaths(refs, 'image', refResolver, projectRoot, filePath, asset.id);

  // Load design refs directly from file
  const designRefs = await designRefReader.getAll(filePath);
  if (designRefs.length > 0) {
    referenceImages = [
      ...referenceImages,
      ...designRefs.map((r) => r.filePath),
    ];
  }

  // v0.10.0: video and audio refs come from refs.video / refs.audio
  let referenceVideos: string[] = await resolveRefPaths(refs, 'video', refResolver, projectRoot, filePath, asset.id);
  let referenceAudios: string[] = await resolveRefPaths(refs, 'audio', refResolver, projectRoot, filePath, asset.id);

  return {
    id: asset.id,
    type: 'video',
    prompt: prompt,
    payload: {
      prompt,
      global_settings: {
        aspect_ratio: frontmatter.aspect_ratio,
        quality: 'standard',
      },
      duration: frontmatter.duration,
      frame_ref: frameRef,
    },
    reference_images: referenceImages.length > 0 ? referenceImages : undefined,
    reference_videos: referenceVideos.length > 0 ? referenceVideos : undefined,
    reference_audios: referenceAudios.length > 0 ? referenceAudios : undefined,
  };
}

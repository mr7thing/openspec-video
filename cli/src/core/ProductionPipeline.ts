// ============================================================================
// OpsV ProductionPipeline — Orchestrates manifest → jobs → compiled tasks
// ============================================================================
//
// Encapsulates the core production flow:
//   1. Load circle assets from manifest
//   2. Filter by category/file/status
//   3. Validate refs for each asset
//   4. Build Job objects from assets
//   5. Compile jobs to provider-specific TaskJson
//
// Usage:
//   const pipeline = new ProductionPipeline(projectRoot);
//   const result = await pipeline.run({ modelKey, circleDir, ... });
// ============================================================================

import fs from 'fs';
import path from 'path';
import { AssetManager, CircleAssetEntry } from './AssetManager';
import { ApprovedRefReader } from './ApprovedRefReader';
import { DesignRefReader } from './DesignRefReader';
import { RefResolver } from './RefEngine';
import { FrontmatterParser } from './FrontmatterParser';
import { ManifestReader } from './ManifestReader';
import { TaskBuilder } from './compiler/TaskBuilder';
import { Job, FrameRef, PromptExtra } from '../types/Job';
import { OpsVContext } from '../container/OpsVContext';
import { buildAssetDocIndex } from './AssetDocIndex';
import { getProjectDir } from '../utils/configLoader';
import { CompilationError, InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';
import { logger } from '../utils/logger';
import { loadProjectConfig } from './ProjectConfig';
import { missingRequiredRefCategories, resolveDocumentContract } from './PackContracts';

// ============================================================================
// Types
// ============================================================================

export interface PipelineOptions {
  modelKey: string;
  circleDir: string;
  category?: string;
  file?: string;
  skipStatuses?: string[];
  paramOverrides?: Record<string, any>;
  workflowPath?: string;
  promptMode?: 'keep' | 'index' | 'name';
  dryRun?: boolean;
}

export interface PipelineResult {
  compiled: number;
  skipped: number;
  errors: string[];
  outputDir: string;
}

// ============================================================================
// Pipeline
// ============================================================================

export class ProductionPipeline {
  private assetManager: AssetManager;
  private approvedRefReader: ApprovedRefReader;
  private designRefReader: DesignRefReader;
  private refResolver: RefResolver;

  constructor(private projectRoot: string) {
    this.assetManager = new AssetManager(projectRoot);
    this.approvedRefReader = new ApprovedRefReader(projectRoot);
    this.designRefReader = new DesignRefReader(projectRoot);
    this.refResolver = new RefResolver(projectRoot, this.approvedRefReader);

    // Build shared asset index
    const videospecDir = getProjectDir(projectRoot, 'videospec');
    const assetIndex = buildAssetDocIndex(videospecDir);
    this.approvedRefReader.setAssetIndex(assetIndex);
    this.refResolver.setAssetIndex(assetIndex);
  }

  async run(options: PipelineOptions): Promise<PipelineResult> {
    const {
      modelKey, circleDir, category, file,
      skipStatuses = ['approved'],
      paramOverrides = {},
      workflowPath,
      promptMode,
      dryRun,
    } = options;

    // 1. Load circle assets
    const circleAssets = await this.assetManager.loadCircleAssets(circleDir);

    // 2. Filter
    const targetAssets = this.filterAssets(circleAssets.assets, file, category, skipStatuses);

    if (targetAssets.length === 0) {
      return { compiled: 0, skipped: 0, errors: [], outputDir: '' };
    }

    // 3. Build manifest status map
    const manifestAssets: Record<string, { status: string }> = {};
    for (const a of circleAssets.assets) {
      manifestAssets[a.id] = { status: a.status };
    }

    // 4. Build jobs
    const jobs: Job[] = [];
    const errors: string[] = [];

    for (const asset of targetAssets) {
      const refErrors = await this.validateRefStatuses(asset, manifestAssets);
      if (refErrors.length > 0) {
        errors.push(`${asset.id}: ${refErrors.join(', ')}`);
        continue;
      }

      try {
        const job = await this.buildJob(asset, paramOverrides);
        jobs.push(job);
      } catch (err: any) {
        errors.push(`${asset.id}: ${err.message}`);
      }
    }

    if (jobs.length === 0) {
      return { compiled: 0, skipped: targetAssets.length, errors, outputDir: '' };
    }

    // 5. Compile
    const outputDir = this.resolveModelQueueDir(circleDir, modelKey);
    const ctx = OpsVContext.create(this.projectRoot);
    const builder = new TaskBuilder(ctx);
    const results = await builder.compileToDir(
      jobs, modelKey, outputDir, dryRun,
      workflowPath, undefined, promptMode,
    );

    return {
      compiled: results.length,
      skipped: targetAssets.length - results.length,
      errors,
      outputDir,
    };
  }

  // ==========================================================================
  // Internal methods
  // ==========================================================================

  private filterAssets(
    assets: CircleAssetEntry[],
    file?: string,
    category?: string,
    skipStatuses: string[] = [],
  ): CircleAssetEntry[] {
    let filtered = assets;

    if (file) {
      filtered = filtered.filter((a) => a.id === file);
      if (filtered.length === 0) {
        throw new CompilationError(
          OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
          `Asset "${file}" not found in manifest`,
        );
      }
    }

    return filtered.filter((a) => {
      if (skipStatuses.includes(a.status)) return false;
      if (category && a.category !== category) return false;
      return true;
    });
  }

  private async buildJob(
    asset: CircleAssetEntry,
    paramOverrides: Record<string, any>,
  ): Promise<Job> {
    const filePath = asset.filePath;
    if (!filePath) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `File path not found for asset: ${asset.id}`,
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = FrontmatterParser.parseRaw(content);

    const prompt = this.resolvePromptText(frontmatter, body, asset.id);
    this.validateFrameDirective(frontmatter, prompt, asset.id);
    if (frontmatter.category) {
      const contract = resolveDocumentContract(this.projectRoot, frontmatter.category, frontmatter.profile, loadProjectConfig(this.projectRoot));
      const missing = missingRequiredRefCategories(this.projectRoot, contract.profile, frontmatter.refs);
      if (missing.length) throw new CompilationError(OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND, `${asset.id}: Profile requires references to category: ${missing.join(', ')}`);
    }

    // Resolve refs
    const fmRefs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
    let referenceImages = await this.resolveRefPaths(fmRefs, 'image', filePath, asset.id);
    let referenceVideos = await this.resolveRefPaths(fmRefs, 'video', filePath, asset.id);
    let referenceAudios = await this.resolveRefPaths(fmRefs, 'audio', filePath, asset.id);

    // Design refs
    const designRefs = await this.designRefReader.getAll(filePath);
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

    // Extra fields
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
        frame_ref: this.resolveFrameRef(filePath, frontmatter.frame_ref),
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

  private resolvePromptText(
    frontmatter: Record<string, any>,
    body: string,
    assetId: string,
  ): string {
    if (frontmatter.prompt) return String(frontmatter.prompt);

    const fallback =
      frontmatter.visual_detailed ||
      frontmatter.visual_brief ||
      FrontmatterParser.extractFirstParagraph(body);

    if (fallback) {
      logger.warn(
        `${assetId}: frontmatter.prompt missing, falling back to visual_detailed/brief/body.`,
      );
    }
    return String(fallback || '');
  }

  private validateFrameDirective(frontmatter: Record<string, any>, prompt: string, assetId: string): void {
    if (!/@FRAME:[\p{L}\p{N}_-]+/u.test(prompt)) return;
    if (!frontmatter.category) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND, `${assetId}: @FRAME: requires a category and enabled Profile`);
    }
    const contract = resolveDocumentContract(this.projectRoot, frontmatter.category, frontmatter.profile, loadProjectConfig(this.projectRoot));
    if (!contract.profile.frame_directive) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND, `${assetId}: @FRAME: is only allowed by a Profile with frame_directive: true`);
    }
  }

  private resolveFrameRef(filePath: string, value: unknown): FrameRef | undefined {
    if (!value) return undefined;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      return {
        first: this.resolveFramePath(filePath, obj.first as string | undefined),
        last: this.resolveFramePath(filePath, obj.last as string | undefined),
      };
    }
    return undefined;
  }

  private resolveFramePath(filePath: string, ref: string | undefined): string | null {
    if (!ref) return null;
    if (ref.startsWith('http') || ref.startsWith('data:')) return ref;
    return path.resolve(path.dirname(filePath), ref);
  }

  private async resolveRefPaths(
    refs: Record<string, Record<string, string[]>>,
    refType: 'image' | 'video' | 'audio',
    assetFilePath: string,
    assetId: string,
  ): Promise<string[]> {
    const out: string[] = [];
    const typeRefs = refs[refType];
    if (!typeRefs) return out;

    for (const [key, paths] of Object.entries(typeRefs)) {
      if (key.startsWith('@') && !key.startsWith('@:')) {
        const identifier = key.slice(1);
        const resolved = await this.refResolver.resolve(identifier);
        if (resolved.resolvedImagePath && fs.existsSync(resolved.resolvedImagePath)) {
          out.push(resolved.resolvedImagePath);
        } else {
          throw new CompilationError(
            OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
            `${assetId}: ref ${key} (${refType}) has no approved output file.`,
          );
        }
        continue;
      }

      if (!Array.isArray(paths)) continue;
      for (const p of paths) {
        if (!p) continue;
        if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) {
          out.push(p);
          continue;
        }
        let abs: string;
        if (path.isAbsolute(p) && fs.existsSync(p)) {
          abs = p;
        } else if (p.startsWith('/')) {
          const stripped = p.replace(/^\/+/, '');
          const videospecPath = path.join(getProjectDir(this.projectRoot, 'videospec'), stripped);
          const rootPath = path.join(this.projectRoot, stripped);
          abs = fs.existsSync(videospecPath) ? videospecPath
              : fs.existsSync(rootPath) ? rootPath
              : videospecPath;
        } else {
          abs = path.resolve(path.dirname(assetFilePath), p);
        }
        if (!fs.existsSync(abs)) {
          throw new CompilationError(
            OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
            `${assetId}: ref path "${p}" (${refType}) not found on disk`,
          );
        }
        if (abs.endsWith('.md')) {
          throw new CompilationError(
            OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
            `${assetId}: ref "${p}" points to a markdown descriptor, not a media file.`,
          );
        }
        out.push(abs);
      }
    }

    return out;
  }

  private async validateRefStatuses(
    asset: CircleAssetEntry,
    manifestAssets: Record<string, { status: string }>,
  ): Promise<string[]> {
    const errors: string[] = [];
    const filePath = asset.filePath;

    if (!filePath || !fs.existsSync(filePath)) return errors;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = FrontmatterParser.parseRaw(content);
      const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
      const videospecDir = getProjectDir(this.projectRoot, 'videospec');

      for (const typeMap of Object.values(refs)) {
        if (!typeMap || typeof typeMap !== 'object') continue;
        for (const key of Object.keys(typeMap)) {
          if (key.startsWith('@:')) {
            const designId = key.slice(2);
            const designSection = body.match(
              /##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i,
            );
            if (!designSection) {
              errors.push(`${key} — ## Design References section not found`);
              continue;
            }
            const imgRe = new RegExp(`!\\[${escapeRegex(designId)}\\]\\(([^)]+)\\)`);
            const imgMatch = designSection[1].match(imgRe);
            if (!imgMatch) {
              errors.push(`${key} — ![${designId}](path) not found in ## Design References`);
              continue;
            }
            const resolvedPath = path.resolve(path.dirname(filePath), imgMatch[1]);
            if (!fs.existsSync(resolvedPath)) {
              errors.push(`${key} — file not found: ${imgMatch[1]}`);
            }
            continue;
          }

          if (!key.startsWith('@')) continue;
          let refId = key.slice(1);
          const colonIdx = refId.indexOf(':');
          const variant = colonIdx > 0 ? refId.slice(colonIdx + 1) : undefined;
          if (colonIdx > 0) refId = refId.slice(0, colonIdx);

          const descPath = AssetManager.findAssetFilePathUnder(videospecDir, refId);
          if (!descPath) {
            errors.push(`@${refId} — descriptor not found under videospec/`);
            continue;
          }

          const descContent = fs.readFileSync(descPath, 'utf-8');
          const descBody = FrontmatterParser.extractBody(descContent);
          const approvedSection = descBody.match(
            /##\s*Approved\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i,
          );
          if (!approvedSection) {
            errors.push(`@${refId} — ## Approved References section not found`);
            continue;
          }

          const approvedImgRe = variant
            ? new RegExp(`!\\[${escapeRegex(variant)}\\]\\(([^)]+)\\)`)
            : /!\[([^\]]*)\]\(([^)]+)\)/;
          const approvedMatch = approvedSection[1].match(approvedImgRe);
          if (!approvedMatch) {
            errors.push(`@${refId}${variant ? ':' + variant : ''} — no matching approved output`);
            continue;
          }
          const approvedPath = approvedMatch[variant ? 1 : 2];
          const resolvedApproved = path.resolve(path.dirname(descPath), approvedPath);
          if (!fs.existsSync(resolvedApproved)) {
            errors.push(`@${refId}${variant ? ':' + variant : ''} — approved file not found: ${approvedPath}`);
          }
        }
      }
    } catch (e: any) {
      errors.push(`Error validating refs: ${e.message}`);
    }

    return errors;
  }

  private resolveModelQueueDir(circleDir: string, modelKey: string): string {
    if (!fs.existsSync(circleDir)) {
      return path.join(circleDir, `${modelKey}_001`);
    }
    const entries = fs.readdirSync(circleDir);
    const pattern = new RegExp(`^${escapeRegex(modelKey)}_(\\d{3})$`);
    let maxN = 0;
    for (const e of entries) {
      const m = e.match(pattern);
      if (m) maxN = Math.max(maxN, parseInt(m[1]));
    }
    const nextN = maxN + 1;
    const suffix = nextN.toString().padStart(3, '0');
    return path.join(circleDir, `${modelKey}_${suffix}`);
  }
}

// Helper
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

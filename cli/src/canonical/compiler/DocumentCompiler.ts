import fs from 'fs';
import path from 'path';
import { AssetManager } from '../../core/AssetManager';
import { ApprovedRefReader } from '../../core/ApprovedRefReader';
import { buildAssetDocIndex } from '../../core/AssetDocIndex';
import { FrontmatterParser } from '../../core/FrontmatterParser';
import { missingRequiredRefCategories, resolveDocumentContract } from '../../core/PackContracts';
import { loadProjectConfig } from '../../core/ProjectConfig';
import { RefResolver } from '../../core/RefEngine';
import { CompilationError, InfrastructureError, OpsVErrorCode } from '../../errors/OpsVError';
import type { FrameRef, Job, PromptExtra, PromptPayload } from '../../types/Job';
import { getProjectDir } from '../../utils/configLoader';
import { logger } from '../../utils/logger';
import { resolveContainedReal } from '../../utils/pathSecurity';
import { parseAssetDocument } from '../parser/CanonicalNormalizer';
import { canonicalDigest } from './CanonicalDigest';
import { createCanonicalSnapshot, digestSource } from './CanonicalSnapshot';
import type {
  CanonicalProductionInput,
  CanonicalResolvedInput,
  CanonicalResolvedInputKind,
  CanonicalSnapshot,
  CanonicalSnapshotContract,
} from './CanonicalSnapshot';

export interface DocumentCompilerAsset {
  id: string;
  filePath?: string;
}

export interface DocumentCompileOptions {
  workflowPath?: string;
}

export type DocumentCompilationResult =
  | { kind: 'canonical'; snapshot: CanonicalSnapshot }
  | { kind: 'legacy'; job: Job };

/**
 * Single Asset Document compilation seam. The source document is read once;
 * every downstream production value is derived from that immutable content.
 */
export class DocumentCompiler {
  private approvedRefReader: ApprovedRefReader;
  private refResolver: RefResolver;

  constructor(private projectRoot: string) {
    this.approvedRefReader = new ApprovedRefReader(projectRoot);
    this.refResolver = new RefResolver(projectRoot, this.approvedRefReader);
    const assetIndex = buildAssetDocIndex(getProjectDir(projectRoot, 'videospec'));
    this.approvedRefReader.setAssetIndex(assetIndex);
    this.refResolver.setAssetIndex(assetIndex);
  }

  async compile(
    asset: DocumentCompilerAsset,
    paramOverrides: Record<string, unknown> = {},
    options: DocumentCompileOptions = {},
  ): Promise<DocumentCompilationResult> {
    const filePath = asset.filePath;
    if (!filePath) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `File path not found for asset: ${asset.id}`,
      );
    }

    const sourcePath = this.projectRelativePath(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = FrontmatterParser.parseRaw(content);
    if (frontmatter.category) this.assertNoSecretFields(frontmatter, asset.id);
    const job = await this.buildProductionInput(asset.id, filePath, frontmatter, body, paramOverrides);

    // Explicit compatibility window for pre-Pack documents.
    if (!frontmatter.category) return { kind: 'legacy', job };

    const config = loadProjectConfig(this.projectRoot);
    const resolved = resolveDocumentContract(
      this.projectRoot,
      String(frontmatter.category),
      frontmatter.profile ? String(frontmatter.profile) : undefined,
      config,
    );
    if (resolved.profile.kind !== 'production') {
      throw new CompilationError(
        OpsVErrorCode.COMPILATION_FAILED,
        `${asset.id}: Profile "${resolved.profileName}" is a workflow Profile and cannot compile a Production Task`,
      );
    }

    const missing = missingRequiredRefCategories(this.projectRoot, resolved.profile, frontmatter.refs);
    if (missing.length > 0) {
      throw new CompilationError(
        OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
        `${asset.id}: Profile requires references to category: ${missing.join(', ')}`,
      );
    }
    this.validateFrameDirective(frontmatter, job.prompt || '', asset.id, resolved.profile.frame_directive === true);

    const canonicalAsset = parseAssetDocument(content, { docPath: sourcePath });
    const contractBase = {
      schema: 'opsv.production-contract' as const,
      version: 1 as const,
      pack: {
        id: resolved.pack.manifest.id,
        version: resolved.pack.manifest.version,
        contentDigest: `sha256:${resolved.pack.contentDigest}`,
      },
      category: String(frontmatter.category),
      profile: {
        id: resolved.profileName,
        kind: resolved.profile.kind,
        capability: resolved.profile.capability,
        digest: canonicalDigest(resolved.profile, 'pack-profile', 1),
      },
      boundModel: resolved.boundModel,
      outputs: [...resolved.profile.outputs],
    };
    const contract: CanonicalSnapshotContract = {
      ...contractBase,
      digest: canonicalDigest(contractBase, 'production-contract', contractBase.version),
    };
    const resolvedInputs: CanonicalResolvedInput[] = [];
    const imageReferences = this.snapshotReferences('image', job.reference_images || [], resolvedInputs);
    const videoReferences = this.snapshotReferences('video', job.reference_videos || [], resolvedInputs);
    const audioReferences = this.snapshotReferences('audio', job.reference_audios || [], resolvedInputs);
    const canonicalPayload = structuredClone(job.payload);
    if (canonicalPayload.frame_ref) {
      canonicalPayload.frame_ref = {
        first: this.snapshotOptionalReference('frame:first', canonicalPayload.frame_ref.first, resolvedInputs),
        last: this.snapshotOptionalReference('frame:last', canonicalPayload.frame_ref.last, resolvedInputs),
      };
    }
    const workflowPath = this.snapshotOptionalReference(
      'workflow',
      options.workflowPath ?? job.workflow_path ?? null,
      resolvedInputs,
    ) || undefined;
    const production: CanonicalProductionInput = {
      type: job.type,
      prompt: job.prompt || job.payload.prompt || '',
      payload: canonicalPayload,
      references: {
        image: imageReferences,
        video: videoReferences,
        audio: audioReferences,
      },
      workflow: job.workflow,
      workflowId: job.workflow_id,
      workflowPath,
    };

    return {
      kind: 'canonical',
      snapshot: createCanonicalSnapshot({
        schema: 'opsv.canonical-snapshot',
        version: 1,
        source: { path: sourcePath, digest: digestSource(content) },
        asset: canonicalAsset,
        contract,
        references: resolvedInputs,
        production,
      }),
    };
  }

  private async buildProductionInput(
    assetId: string,
    filePath: string,
    frontmatter: Record<string, any>,
    body: string,
    paramOverrides: Record<string, unknown>,
  ): Promise<Job> {
    const prompt = this.resolvePromptText(frontmatter, body, assetId);
    if (!frontmatter.category) this.validateFrameDirective(frontmatter, prompt, assetId, false);

    await this.validateReferenceStatuses(frontmatter, body, filePath, assetId);

    const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
    let referenceImages = await this.resolveRefPaths(refs, 'image', filePath, assetId);
    let referenceVideos = await this.resolveRefPaths(refs, 'video', filePath, assetId);
    let referenceAudios = await this.resolveRefPaths(refs, 'audio', filePath, assetId);

    referenceImages = [...referenceImages, ...this.resolveDesignRefs(body, filePath)];
    if (Array.isArray(frontmatter.ref_videos)) referenceVideos.push(...frontmatter.ref_videos);
    if (Array.isArray(frontmatter.ref_audios)) referenceAudios.push(...frontmatter.ref_audios);

    referenceImages = [...new Set(referenceImages)];
    referenceVideos = [...new Set(referenceVideos)];
    referenceAudios = [...new Set(referenceAudios)];

    const extra: Record<string, unknown> = { media_refs: [], ...paramOverrides };
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key !== 'prompt' && key !== 'refs' && value !== undefined) extra[key] = value;
    }

    const payload: PromptPayload = {
      prompt,
      global_settings: {
        aspect_ratio: String(frontmatter.aspect_ratio || ''),
        quality: String(frontmatter.quality || 'standard'),
      },
      frame_ref: this.resolveFrameRef(filePath, frontmatter.frame_ref),
      extra: extra as PromptExtra,
    };

    return {
      id: assetId,
      type: 'produce',
      prompt,
      payload,
      reference_images: referenceImages.length > 0 ? referenceImages : undefined,
      reference_videos: referenceVideos.length > 0 ? referenceVideos : undefined,
      reference_audios: referenceAudios.length > 0 ? referenceAudios : undefined,
      workflow: frontmatter.workflow,
      workflow_id: frontmatter.workflow_id,
      workflow_path: frontmatter.workflow_path,
    };
  }

  private resolvePromptText(frontmatter: Record<string, any>, body: string, assetId: string): string {
    if (frontmatter.prompt) return String(frontmatter.prompt);
    const fallback = frontmatter.visual_detailed
      || frontmatter.visual_brief
      || FrontmatterParser.extractFirstParagraph(body);
    if (fallback) {
      logger.warn(`${assetId}: frontmatter.prompt missing, falling back to visual_detailed/brief/body.`);
    }
    return String(fallback || '');
  }

  private validateFrameDirective(
    frontmatter: Record<string, any>,
    prompt: string,
    assetId: string,
    enabled: boolean,
  ): void {
    if (!/@FRAME:[\p{L}\p{N}_-]+/u.test(prompt)) return;
    if (!frontmatter.category) {
      throw new CompilationError(
        OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
        `${assetId}: @FRAME: requires a category and enabled Profile`,
      );
    }
    if (!enabled) {
      throw new CompilationError(
        OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
        `${assetId}: @FRAME: is only allowed by a Profile with frame_directive: true`,
      );
    }
  }

  private resolveFrameRef(filePath: string, value: unknown): FrameRef | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    return {
      first: this.resolveFramePath(filePath, obj.first as string | undefined),
      last: this.resolveFramePath(filePath, obj.last as string | undefined),
    };
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
        const resolved = await this.refResolver.resolve(key.slice(1));
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
      for (const refPath of paths) {
        if (!refPath) continue;
        if (/^(https?:\/\/|data:)/.test(refPath)) {
          out.push(refPath);
          continue;
        }
        let absolute: string;
        if (path.isAbsolute(refPath) && fs.existsSync(refPath)) {
          absolute = refPath;
        } else if (refPath.startsWith('/')) {
          const stripped = refPath.replace(/^\/+/, '');
          const videospecPath = path.join(getProjectDir(this.projectRoot, 'videospec'), stripped);
          const rootPath = path.join(this.projectRoot, stripped);
          absolute = fs.existsSync(videospecPath)
            ? videospecPath
            : fs.existsSync(rootPath) ? rootPath : videospecPath;
        } else {
          absolute = path.resolve(path.dirname(assetFilePath), refPath);
        }
        if (!fs.existsSync(absolute)) {
          throw new CompilationError(
            OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
            `${assetId}: ref path "${refPath}" (${refType}) not found on disk`,
          );
        }
        if (absolute.endsWith('.md')) {
          throw new CompilationError(
            OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
            `${assetId}: ref "${refPath}" points to a markdown descriptor, not a media file.`,
          );
        }
        out.push(absolute);
      }
    }
    return out;
  }

  private resolveDesignRefs(body: string, filePath: string): string[] {
    const section = body.match(/##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (!section) return [];
    const paths: string[] = [];
    const image = /!\[[^\]]*\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = image.exec(section[1])) !== null) {
      const absolute = path.isAbsolute(match[1]) ? match[1] : path.resolve(path.dirname(filePath), match[1]);
      if (fs.existsSync(absolute)) paths.push(absolute);
    }
    return paths;
  }

  private async validateReferenceStatuses(
    frontmatter: Record<string, any>,
    body: string,
    filePath: string,
    assetId: string,
  ): Promise<void> {
    const errors: string[] = [];
    const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
    const videospecDir = getProjectDir(this.projectRoot, 'videospec');

    for (const typeMap of Object.values(refs)) {
      if (!typeMap || typeof typeMap !== 'object') continue;
      for (const key of Object.keys(typeMap)) {
        if (key.startsWith('@:')) {
          const designId = key.slice(2);
          const section = body.match(/##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i);
          if (!section) {
            errors.push(`${key} — ## Design References section not found`);
            continue;
          }
          const image = section[1].match(new RegExp(`!\\[${escapeRegex(designId)}\\]\\(([^)]+)\\)`));
          if (!image) {
            errors.push(`${key} — ![${designId}](path) not found in ## Design References`);
            continue;
          }
          const resolvedPath = path.resolve(path.dirname(filePath), image[1]);
          if (!fs.existsSync(resolvedPath)) errors.push(`${key} — file not found: ${image[1]}`);
          continue;
        }

        if (!key.startsWith('@')) continue;
        let refId = key.slice(1);
        const colon = refId.indexOf(':');
        const variant = colon > 0 ? refId.slice(colon + 1) : undefined;
        if (colon > 0) refId = refId.slice(0, colon);

        const descriptorPath = AssetManager.findAssetFilePathUnder(videospecDir, refId);
        if (!descriptorPath) {
          errors.push(`@${refId} — descriptor not found under videospec/`);
          continue;
        }
        const descriptor = FrontmatterParser.parseRaw(fs.readFileSync(descriptorPath, 'utf8')).frontmatter;
        if (descriptor.status === 'syncing') {
          errors.push(`@${refId} — referenced Asset is syncing and cannot be consumed`);
          continue;
        }
        const approved = await this.approvedRefReader.getAll(descriptorPath);
        if (approved.length === 0) {
          errors.push(`@${refId} — no approved output`);
          continue;
        }
        const duplicates = await this.approvedRefReader.getDuplicateVariants(descriptorPath);
        if (duplicates.length > 0) {
          errors.push(`@${refId} — duplicate approved variants: ${duplicates.join(', ')}`);
          continue;
        }
        if (!variant && approved.length > 1) {
          errors.push(`@${refId} — variant required because the asset has ${approved.length} approved references`);
          continue;
        }
        const selected = variant ? approved.find((item) => item.variant === variant) : approved[0];
        if (!selected || !fs.existsSync(selected.filePath)) {
          errors.push(`@${refId}${variant ? `:${variant}` : ''} — no matching approved output file`);
        }
      }
    }

    if (errors.length > 0) {
      throw new CompilationError(
        OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
        `${assetId}: ${errors.join(', ')}`,
      );
    }
  }


  private snapshotReferences(
    kind: CanonicalResolvedInputKind,
    references: string[],
    resolvedInputs: CanonicalResolvedInput[],
  ): string[] {
    return references.map((reference) => this.snapshotReference(kind, reference, resolvedInputs));
  }

  private snapshotOptionalReference(
    kind: CanonicalResolvedInputKind,
    reference: string | null,
    resolvedInputs: CanonicalResolvedInput[],
  ): string | null {
    if (!reference) return null;
    return this.snapshotReference(kind, reference, resolvedInputs);
  }

  private snapshotReference(
    kind: CanonicalResolvedInputKind,
    reference: string,
    resolvedInputs: CanonicalResolvedInput[],
  ): string {
    if (/^(https?:\/\/|data:)/.test(reference)) {
      resolvedInputs.push({
        kind,
        uri: reference,
        digest: canonicalDigest({ uri: reference }, 'external-input', 1),
      });
      return reference;
    }

    const absolute = kind === 'workflow' && !path.isAbsolute(reference)
      ? path.resolve(this.projectRoot, reference)
      : reference;
    const uri = this.projectRelativePath(absolute);
    resolvedInputs.push({ kind, uri, digest: digestSource(fs.readFileSync(absolute)) });
    return uri;
  }

  private projectRelativePath(filePath: string): string {
    const lexicalRelative = path.relative(path.resolve(this.projectRoot), path.resolve(filePath));
    const contained = resolveContainedReal(this.projectRoot, lexicalRelative);
    if (!contained || !fs.existsSync(contained)) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_PATH_FORBIDDEN,
        `Path resolves outside the project root: ${filePath}`,
      );
    }
    const rootReal = fs.realpathSync.native(this.projectRoot);
    return path.relative(rootReal, contained).split(path.sep).join('/');
  }

  private assertNoSecretFields(value: unknown, assetId: string, trail: string[] = []): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextTrail = [...trail, key];
      if (/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|secret|password|credential)$/i.test(key)) {
        throw new CompilationError(
          OpsVErrorCode.COMPILATION_FAILED,
          `${assetId}: secret-like field "${nextTrail.join('.')}" is not allowed in a Canonical Snapshot`,
        );
      }
      this.assertNoSecretFields(child, assetId, nextTrail);
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

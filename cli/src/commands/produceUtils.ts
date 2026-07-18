// ============================================================================
// OpsV Produce Command Utilities
// ============================================================================

import path from 'path';
import fs from 'fs';
import { AssetManager, CircleAssetEntry } from '../core/AssetManager';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DesignRefReader } from '../core/DesignRefReader';
import { RefResolver } from '../core/RefEngine';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { Job } from '../types/Job';
import { resolveProjectRoot } from '../utils/projectResolver';
import { getProjectDir } from '../utils/configLoader';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { logger } from '../utils/logger';

/**
 * Resolve the prompt to send to the model.
 *
 * Strict path: use `frontmatter.prompt` only. This is the only field whose
 * @-tokens are validated against `refs` (v0.10.0 semantic).
 *
 * Fallback path (when prompt is missing): visual_detailed → visual_brief →
 * first body paragraph. Logs a warning, since these fields are NOT scanned
 * by `opsv refs check` and may contain narrative @-tokens that won't have
 * matching refs entries.
 */
export function resolvePromptText(
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
      `${assetId}: frontmatter.prompt missing, falling back to visual_detailed/brief/body. ` +
      `These fields are not scanned by refs validation — @-tokens inside may not have matching refs entries.`
    );
  }
  return String(fallback || '');
}
import { CompilationError, OpsVErrorCode } from '../errors/OpsVError';
import { escapeRegex } from '../utils/string';

export interface ProduceCommandOptions {
  model: string;
  manifest?: string;
  category?: string;
  statusSkip?: string;
  file?: string;
  dryRun?: boolean;
  promptMode?: 'keep' | 'index' | 'name';
}

/** Shared by animate, imagen, webapp (same as ProduceCommandOptions + dryRun) */
export interface ImageProduceCommandOptions extends ProduceCommandOptions {
  dryRun?: boolean;
}

/** ComfyUI-specific (extends ImageProduceCommandOptions) */
export interface ComfyCommandOptions extends ImageProduceCommandOptions {
  workflow?: string;
  param?: string;
  forceApiMapping?: boolean;
}

/**
 * Resolve the next available model queue directory with a 3-digit sequence suffix.
 * E.g. given modelKey "volc.seadream", returns ".../volc.seadream_001" if none exists,
 * or ".../volc.seadream_003" if _001 and _002 already exist.
 */
export function resolveModelQueueDir(circleDir: string, modelKey: string): string {
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

export function parseStatusSkip(statusSkipOption?: string): string[] {
  const statusSkipStr = statusSkipOption || 'approved';
  return statusSkipStr === 'none'
    ? []
    : statusSkipStr.split(',').map((s: string) => s.trim());
}

export function filterAssets(
  assets: CircleAssetEntry[],
  file?: string,
  category?: string,
  skipStatuses: string[] = []
): CircleAssetEntry[] {
  let filtered = assets;

  if (file) {
    filtered = filtered.filter((a) => a.id === file);
    if (filtered.length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND, `Asset "${file}" not found in manifest`);
    }
  }

  return filtered.filter((a) => {
    if (skipStatuses.includes(a.status)) return false;
    if (category && a.category !== category) return false;
    return true;
  });
}

export async function buildProduceContext(projectRoot: string) {
  const assetManager = new AssetManager(projectRoot);
  const approvedRefReader = new ApprovedRefReader(projectRoot);
  const designRefReader = new DesignRefReader(projectRoot);
  const refResolver = new RefResolver(projectRoot, approvedRefReader);

  // Build shared asset index for ref resolution
  const videospecDir = getProjectDir(projectRoot, 'videospec');
  const assetIndex = buildAssetDocIndex(videospecDir);
  approvedRefReader.setAssetIndex(assetIndex);
  refResolver.setAssetIndex(assetIndex);

  return { assetManager, approvedRefReader, designRefReader, refResolver };
}

export interface AssetRefStatus {
  id: string;
  status: string;
}

export async function validateRefStatuses(
  asset: CircleAssetEntry,
  manifestAssets: Record<string, { status: string }>,
  projectRoot: string,
): Promise<string[]> {
  const errors: string[] = [];
  const filePath = asset.filePath;

  if (!filePath || !fs.existsSync(filePath)) {
    return errors;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = FrontmatterParser.parseRaw(content);

    const refs = (frontmatter.refs || {}) as Record<string, Record<string, string[]>>;
    const videospecDir = getProjectDir(projectRoot, 'videospec');
    const approvedRefReader = new ApprovedRefReader(projectRoot);

    for (const typeMap of Object.values(refs)) {
      if (!typeMap || typeof typeMap !== 'object') continue;
      for (const key of Object.keys(typeMap)) {
        // --- @:key — document-internal design reference ---
        if (key.startsWith('@:')) {
          const designId = key.slice(2);
          const designSection = body.match(
            /##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i,
          );
          if (!designSection) {
            errors.push(`${key} — ## Design References section not found in document`);
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

        // --- @id or @id:variant — external asset reference ---
        if (!key.startsWith('@')) continue;
        let refId = key.slice(1);
        let variant: string | undefined;
        const colonIdx = refId.indexOf(':');
        if (colonIdx > 0) {
          variant = refId.slice(colonIdx + 1);
          refId = refId.slice(0, colonIdx);
        }

        // Find the descriptor document
        const descPath = AssetManager.findAssetFilePathUnder(videospecDir, refId);
        if (!descPath) {
          errors.push(`@${refId} — descriptor not found under videospec/`);
          continue;
        }

        // Read ## Approved References from the descriptor
        const descContent = fs.readFileSync(descPath, 'utf-8');
        const approvedRefs = await approvedRefReader.getAll(descPath);
        if (approvedRefs.length === 0) {
          errors.push(`@${refId} — ## Approved References section not found in descriptor`);
          continue;
        }

        const duplicates = await approvedRefReader.getDuplicateVariants(descPath);
        if (duplicates.length > 0) {
          errors.push(`@${refId} — duplicate approved variants: ${duplicates.join(', ')}`);
          continue;
        }

        if (!variant && approvedRefs.length > 1) {
          errors.push(`@${refId} — variant required because the asset has ${approvedRefs.length} approved references`);
          continue;
        }

        const approvedRef = variant
          ? approvedRefs.find((ref) => ref.variant === variant)
          : approvedRefs[0];
        if (!approvedRef) {
          errors.push(`@${refId}${variant ? `:${variant}` : ''} — no matching approved output in ## Approved References`);
          continue;
        }

        const resolvedApproved = approvedRef.filePath;
        if (!fs.existsSync(resolvedApproved)) {
          errors.push(`@${refId}${variant ? ':' + variant : ''} — approved file not found: ${resolvedApproved}`);
        } else {
          // Warning: descriptor is not approved but already has approved outputs
          const { frontmatter: descFm } = FrontmatterParser.parseRaw(descContent);
          if (descFm.status && descFm.status !== 'approved') {
            errors.push(`@${refId} — descriptor status is "${descFm.status}" but has approved output files; consider updating to "approved"`);
          }
        }
      }
    }
  } catch (e: any) {
    errors.push(`Error validating refs: ${e.message}`);
  }

  return errors;
}

/**
 * Resolve frontmatter refs of a given type (`image` | `video` | `audio`) into
 * absolute output file paths suitable for sending to a generation API.
 *
 * Each ref key like `@marriage_stele` (optionally `@marriage_stele:variant`)
 * points to an asset descriptor markdown file. We resolve it through
 * RefResolver, which extracts the asset's approved output (e.g.
 * `marriage_stele_1.png`) from the `## Approved References` section of the
 * descriptor. Plain http(s) URLs and existing on-disk files pass through.
 *
 * Returns absolute paths. Errors when the asset has no approved output —
 * silently passing a `.md` path to a generation API guarantees a downstream
 * failure with a confusing error.
 */
export async function resolveRefPaths(
  refs: Record<string, Record<string, string[]>>,
  refType: 'image' | 'video' | 'audio',
  refResolver: RefResolver,
  projectRoot: string,
  assetFilePath: string,
  assetId: string
): Promise<string[]> {
  const out: string[] = [];
  const typeRefs = refs[refType];
  if (!typeRefs) return out;

  for (const [key, paths] of Object.entries(typeRefs)) {
    // Asset-doc reference: resolve through approved-refs index
    if (key.startsWith('@') && !key.startsWith('@:')) {
      const identifier = key.slice(1); // e.g. "marriage_stele" or "marriage_stele:variant"
      const resolved = await refResolver.resolve(identifier);
      if (resolved.resolvedImagePath && fs.existsSync(resolved.resolvedImagePath)) {
        out.push(resolved.resolvedImagePath);
      } else {
        throw new CompilationError(
          OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
          `${assetId}: ref ${key} (${refType}) has no approved output file. ` +
          `Asset descriptor must contain an "## Approved References" section listing a generated ${refType}, ` +
          `not just a .md path. Run \`opsv approve\` after generating an output.`
        );
      }
      continue;
    }

    // Non-@ key or @:docKey: treat path entries as literal locators
    if (!Array.isArray(paths)) continue;
    for (const p of paths) {
      if (!p) continue;
      if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) {
        out.push(p);
        continue;
      }
      // Normalize project-rooted paths (leading "/") and relative paths.
      // A leading "/" is interpreted as project-root-relative (under videospec/),
      // NOT filesystem-absolute — fs sees it as absolute and would ENOENT.
      let abs: string;
      if (path.isAbsolute(p) && fs.existsSync(p)) {
        abs = p;
      } else if (p.startsWith('/')) {
        // Try videospec/<path> first, then projectRoot/<path>
        const stripped = p.replace(/^\/+/, '');
        const videospecPath = path.join(getProjectDir(projectRoot, 'videospec'), stripped);
        const rootPath = path.join(projectRoot, stripped);
        abs = fs.existsSync(videospecPath) ? videospecPath
            : fs.existsSync(rootPath) ? rootPath
            : videospecPath;
      } else {
        abs = path.resolve(path.dirname(assetFilePath), p);
      }
      if (!fs.existsSync(abs)) {
        throw new CompilationError(
          OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
          `${assetId}: ref path "${p}" (${refType}) not found on disk (resolved to ${abs})`
        );
      }
      // Reject .md files — those are descriptors, not media. Use @assetId form instead.
      if (abs.endsWith('.md')) {
        throw new CompilationError(
          OpsVErrorCode.COMPILATION_ASSET_NOT_FOUND,
          `${assetId}: ref "${p}" points to a markdown descriptor, not a media file. ` +
          `Use "@<assetId>" key form so opsv resolves the asset's approved output.`
        );
      }
      out.push(abs);
    }
  }

  return out;
}

// ============================================================================
// OpsV Produce Command Utilities
// ============================================================================

import path from 'path';
import fs from 'fs';
import { AssetManager, CircleAssetEntry } from '../core/AssetManager';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { DesignRefReader } from '../core/DesignRefReader';
import { RefResolver } from '../core/RefResolver';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { Job } from '../types/Job';
import { resolveProjectRoot } from '../utils/projectResolver';
import { getProjectDir } from '../utils/configLoader';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { CompilationError, OpsVErrorCode } from '../errors/OpsVError';
import { escapeRegex } from '../utils/string';

export interface ProduceCommandOptions {
  model: string;
  manifest?: string;
  category?: string;
  statusSkip?: string;
  file?: string;
  dryRun?: boolean;
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

export function validateRefStatuses(
  asset: CircleAssetEntry,
  manifestAssets: Record<string, { status: string }>
): string[] {
  const errors: string[] = [];
  const filePath = asset.filePath;

  if (!filePath || !fs.existsSync(filePath)) {
    return errors;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = FrontmatterParser.parseRaw(content);

    if (frontmatter.refs && Array.isArray(frontmatter.refs)) {
      for (const ref of frontmatter.refs) {
        let refId = ref.startsWith('@') ? ref.slice(1) : ref;
        const colonIdx = refId.indexOf(':');
        if (colonIdx > 0) {
          refId = refId.slice(0, colonIdx);
        }

        const refAsset = manifestAssets[refId];
        if (refAsset && refAsset.status !== 'approved') {
          errors.push(`@${refId} is ${refAsset.status}, must be approved`);
        }
      }
    }
  } catch {
    // Skip validation errors, compilation will handle them
  }

  return errors;
}

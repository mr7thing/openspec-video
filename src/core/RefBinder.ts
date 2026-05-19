// ============================================================================
// OpsV RefBinder — Reference parsing & binding engine
// frontmatter refs → type classification → resolved file paths
// ============================================================================

import fs from 'fs';
import path from 'path';
import { RefEntry, ResolvedRef, TypedSectionRef } from '../types/FrontmatterSchema';
import { AssetDocIndex, buildAssetDocIndex } from './AssetDocIndex';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

export interface RefBinderContext {
  projectRoot: string;
  assetIndex?: AssetDocIndex;
}

// ============================================================================
// parseRefs: frontmatter refs → ResolvedRef[]
// ============================================================================

export function parseRefs(
  rawRefs: RefEntry[],
  ctx: RefBinderContext,
): ResolvedRef[] {
  const index = ctx.assetIndex || buildAssetDocIndex(getProjectDir(ctx.projectRoot, 'videospec'));
  const results: ResolvedRef[] = [];

  for (const entry of rawRefs) {
    const rawId = entry.id.startsWith('@') ? entry.id.slice(1) : entry.id;
    const colonIdx = rawId.indexOf(':');
    const id = colonIdx > 0 ? rawId.slice(0, colonIdx) : rawId;
    const variant = colonIdx > 0 ? rawId.slice(colonIdx + 1) : undefined;
    const type = entry.type || inferType(id);

    const docEntry = index.entries.get(id);
    const docPath = docEntry?.filePath || '';
    const outputs = docEntry ? findOutputs(id, ctx.projectRoot) : [];

    results.push({ id, variant, type, docPath, outputs });
  }

  return results;
}

// ============================================================================
// parseTypedSections: body → ### <type> sections → TypedSectionRef[]
// ============================================================================

export function parseTypedSections(body: string): TypedSectionRef[] {
  const refs: TypedSectionRef[] = [];
  const lines = body.split('\n');
  let currentType: string | null = null;

  for (const line of lines) {
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      currentType = h3Match[1].trim().toLowerCase();
      continue;
    }

    // Any ## heading (h1/h2) resets the current typed section context
    if (line.match(/^#{1,2}\s+/)) {
      currentType = null;
      continue;
    }

    if (!currentType) continue;

    // Match [text](#refid) or [text](#refid:variant)
    const linkRegex = /\[([^\]]+)\]\(#([a-zA-Z0-9_:.\-]+)\)/g;
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const label = match[1];
      const refId = match[2];
      const colonIdx = refId.indexOf(':');
      const baseId = colonIdx > 0 ? refId.slice(0, colonIdx) : refId;
      const variant = colonIdx > 0 ? refId.slice(colonIdx + 1) : undefined;

      refs.push({ type: currentType, refId: baseId, label, variant });
    }
  }

  return refs;
}

// ============================================================================
// resolveToInputs: group resolved refs by type → Record<string, string[]>
// ============================================================================

export function resolveToInputs(
  resolvedRefs: ResolvedRef[],
  typedRefs: TypedSectionRef[],
  ctx: RefBinderContext,
): Record<string, string[]> {
  const inputs: Record<string, string[]> = {};

  // From frontmatter refs: group outputs by type
  for (const ref of resolvedRefs) {
    if (!inputs[ref.type]) inputs[ref.type] = [];
    inputs[ref.type].push(...ref.outputs);
  }

  // From typed sections: resolve refId → outputs, grouped by section type
  const index = ctx.assetIndex || buildAssetDocIndex(getProjectDir(ctx.projectRoot, 'videospec'));

  for (const tref of typedRefs) {
    if (!inputs[tref.type]) inputs[tref.type] = [];
    const outputs = findOutputs(tref.refId, ctx.projectRoot);
    if (outputs.length > 0) {
      inputs[tref.type].push(...outputs);
    } else {
      // Fallback: try docPath as a file
      const entry = index.entries.get(tref.refId);
      if (entry?.filePath && fs.existsSync(entry.filePath)) {
        inputs[tref.type].push(entry.filePath);
      }
    }
  }

  // Deduplicate
  for (const key of Object.keys(inputs)) {
    inputs[key] = [...new Set(inputs[key])];
  }

  return inputs;
}

// ============================================================================
// Helpers
// ============================================================================

const TYPE_HINTS: Record<string, string> = {
  img: 'image', image: 'image', pic: 'image', photo: 'image',
  vid: 'video', video: 'video', anim: 'video',
  aud: 'audio', audio: 'audio', music: 'audio', bgm: 'audio', sfx: 'audio',
  bvh: 'bvh', motion: 'bvh',
  mask: 'mask', alpha: 'mask',
};

function inferType(id: string): string {
  const lower = id.toLowerCase();
  for (const [hint, type] of Object.entries(TYPE_HINTS)) {
    if (lower.includes(hint)) return type;
  }
  return 'image';
}

function findOutputs(assetId: string, projectRoot: string): string[] {
  const queueRoot = getProjectDir(projectRoot, 'queue');
  const outputs: string[] = [];
  if (!fs.existsSync(queueRoot)) return outputs;

  const circleDirs = fs.readdirSync(queueRoot)
    .filter(d => /_circle\d+$/.test(d))
    .sort((a, b) => {
      const numA = parseInt(a.match(/_circle(\d+)$/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/_circle(\d+)$/)?.[1] || '0', 10);
      return numB - numA; // latest circle first
    });

  for (const circleDir of circleDirs) {
    const circlePath = path.join(queueRoot, circleDir);
    if (!fs.statSync(circlePath).isDirectory()) continue;

    const providerDirs = fs.readdirSync(circlePath).filter(d => !d.startsWith('_'));
    for (const providerDir of providerDirs) {
      const providerPath = path.join(circlePath, providerDir);
      if (!fs.statSync(providerPath).isDirectory()) continue;
      collectAssetOutputs(providerPath, assetId, outputs);
    }
  }

  return outputs;
}

function collectAssetOutputs(dirPath: string, assetId: string, results: string[]): void {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectAssetOutputs(fullPath, assetId, results);
    } else if (entry.isFile() && entry.name.startsWith(assetId)) {
      if (entry.name.endsWith('.json') || entry.name.endsWith('.log')) continue;
      results.push(fullPath);
    }
  }
}

// ============================================================================
// PackDigest — canonical content digest over all behavior-relevant managed
// files of a Pack (F4). Single owner of tree hashing: pack lock, Work Packet
// provenance, and future Hook cache / Router fingerprints must all consume
// this module, never reimplement it.
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PackManifest } from '../types/PackSchemas';
import { resolveContainedReal } from '../utils/pathSecurity';

export const PACK_DIGEST_ALGORITHM = 'sha256';
export const PACK_DIGEST_VERSION = 1;

/** Conventional directories whose entire contents affect agent behavior. */
const BEHAVIOR_DIRS = ['scripts', 'templates', 'references', 'validation'];

/** Segments / names excluded from the conventional-dir walk. */
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', 'test', 'tests', '__tests__', 'tmp', 'dist']);
const EXCLUDED_FILES = new Set(['.DS_Store']);

export interface PackContentDigest {
  contentDigest: string;
  /** Pack-relative path (forward slashes) → file sha256. */
  files: Record<string, string>;
  /** Candidate files skipped because they escape the pack root (symlink). */
  skipped: string[];
  algorithm: typeof PACK_DIGEST_ALGORITHM;
  digestVersion: typeof PACK_DIGEST_VERSION;
}

function toRel(rel: string): string {
  return rel.split(path.sep).join('/');
}

function sha256File(filePath: string): string {
  return crypto.createHash(PACK_DIGEST_ALGORITHM).update(fs.readFileSync(filePath)).digest('hex');
}

function walkBehaviorDir(root: string, rel: string, out: string[]): void {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
    if (entry.name.endsWith('.log') || EXCLUDED_FILES.has(entry.name)) continue;
    const entryRel = toRel(path.join(rel, entry.name));
    if (entry.isDirectory()) walkBehaviorDir(root, entryRel, out);
    else out.push(entryRel);
  }
}

export function computePackContentDigest(packRoot: string, manifest: PackManifest): PackContentDigest {
  const candidates = new Set<string>(['pack.yaml']);
  for (const rel of Object.values(manifest.categories || {})) candidates.add(toRel(rel));
  for (const rel of Object.values(manifest.profiles || {})) candidates.add(toRel(rel));
  for (const skillRel of Object.values(manifest.skills || {})) {
    const rel = toRel(skillRel);
    candidates.add(rel);
    candidates.add(toRel(path.join(path.dirname(rel), 'SKILL.md')));
  }

  const behaviorFiles: string[] = [];
  for (const dir of BEHAVIOR_DIRS) walkBehaviorDir(packRoot, dir, behaviorFiles);
  for (const rel of behaviorFiles) candidates.add(rel);

  const files: Record<string, string> = {};
  const skipped: string[] = [];
  for (const rel of [...candidates].sort()) {
    const contained = resolveContainedReal(packRoot, rel);
    if (!contained) {
      skipped.push(rel);
      continue;
    }
    if (!fs.existsSync(contained) || !fs.statSync(contained).isFile()) continue;
    files[rel] = sha256File(contained);
  }

  const entries = Object.keys(files)
    .sort()
    .map(rel => `${rel}\0${files[rel]}\n`)
    .join('');
  const contentDigest = crypto.createHash(PACK_DIGEST_ALGORITHM).update(entries, 'utf8').digest('hex');

  return { contentDigest, files, skipped, algorithm: PACK_DIGEST_ALGORITHM, digestVersion: PACK_DIGEST_VERSION };
}

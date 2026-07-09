// ============================================================================
// OpsV Task/Output Naming Convention
// ============================================================================
//
// Task JSON naming:
//   id.json          → original task        → output: id_1.ext
//   id_m1.json       → 1st iteration        → output: id_m1_1.ext
//   id_m2.json       → 2nd iteration        → output: id_m2_1.ext
//
// Review detection from output filename:
//   id_1.ext         → base=id              → original task  → direct approved
//   id_m1_1.ext      → base=id_m1           → modified task  → syncing + record task path
// ============================================================================

import path from 'path';
import fs from 'fs';
import { escapeRegex } from '../utils/string';

// ============================================================================
// Per-task async mutex: serialises the resolveNextOutputIndex + write critical
// section for the same (taskPath, ext) pair under concurrency > 1.
// ============================================================================
const taskLocks = new Map<string, Promise<any>>();

/**
 * Serialize access to the output-index + write critical section for the same
 * task identity, so concurrent executions never compute the same nextIndex.
 *
 * Uses a promise-chain pattern: new callers wait for the previous lock holder
 * to finish before running `fn`. If the previous holder's fn rejected, the
 * rejection handler in `.then(fn, fn)` re-runs fn rather than propagate the
 * old error (a previous failure shouldn't block a new execution).
 */
export async function withTaskLock<T>(
  taskId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = taskLocks.get(taskId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  taskLocks.set(taskId, next);
  try {
    return await next;
  } finally {
    if (taskLocks.get(taskId) === next) {
      taskLocks.delete(taskId);
    }
  }
}

export function deriveOutputBase(taskPath: string): string {
  return path.basename(taskPath, '.json');
}

export function isModifiedTask(taskPath: string): boolean {
  return parseIterationSuffix(taskPath) !== null;
}

/**
 * Extracts the iteration suffix from a modified task path.
 * e.g. "/path/shot_01_m1.json" → { base: "shot_01", iteration: 1 }
 * Returns null if the path is not a modified task.
 */
export function parseIterationSuffix(taskPath: string): { base: string; iteration: number } | null {
  const filename = path.basename(taskPath, '.json');
  const match = filename.match(/^(.+)_m(\d+)$/);
  if (!match) return null;
  return { base: match[1], iteration: parseInt(match[2], 10) };
}

export function outputFilename(taskPath: string, index: number, ext: string): string {
  const base = deriveOutputBase(taskPath);
  return `${base}_${index}.${ext}`;
}

export function outputFilePath(taskPath: string, index: number, ext: string): string {
  const outputDir = path.dirname(taskPath);
  return path.join(outputDir, outputFilename(taskPath, index, ext));
}

/**
 * Scan a single directory for existing output files matching base_(\d+).ext.
 * Returns the maximum index found, or 0 if none exist.
 */
function scanDirMaxIndex(dir: string, base: string, ext: string): number {
  const pattern = new RegExp(`^${escapeRegex(base)}_(\\d+)\\.${escapeRegex(ext)}$`);
  let maxIndex = 0;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const m = entry.match(pattern);
      if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  return maxIndex;
}

/**
 * If currentDir matches a model-queue directory pattern (modelKey_NNN),
 * scan all sibling directories with the same modelKey prefix for existing
 * output files. Returns the maximum index found across all siblings.
 *
 * This ensures that when a produce run creates a new _NNN subdirectory
 * (e.g. volcengine.seedance_002), its task executions pick up where the
 * previous _001 directory left off, rather than resetting to 1.
 *
 * When the entire opsv-queue tree is cleared (parent dir ENOENT), silently
 * returns 0 so the caller starts from 1 — same as the local-only fallback.
 */
function scanSiblingQueueDirs(
  currentDir: string,
  base: string,
  ext: string,
): number {
  const dirName = path.basename(currentDir);
  const match = dirName.match(/^(.+)_(\d{3})$/);
  if (!match) return 0;

  const modelKey = match[1];
  const parentDir = path.dirname(currentDir);
  const siblingPattern = new RegExp(`^${escapeRegex(modelKey)}_\\d{3}$`);
  let maxIndex = 0;

  try {
    for (const entry of fs.readdirSync(parentDir)) {
      if (entry === dirName) continue;
      if (!siblingPattern.test(entry)) continue;
      const siblingPath = path.join(parentDir, entry);
      const st = fs.statSync(siblingPath);
      if (!st.isDirectory()) continue;
      maxIndex = Math.max(maxIndex, scanDirMaxIndex(siblingPath, base, ext));
    }
  } catch {
    // ENOENT on parentDir or permission errors → return 0
  }

  return maxIndex;
}

/**
 * Scan the output directory (and sibling model-queue directories) for existing
 * files matching base_*.<ext>, and return the next available index
 * (max existing index + 1).
 *
 * Cross-batch auto-increment behaviour:
 *   - Same directory: scans its own dir → increments within the same _NNN dir.
 *   - New _NNN dir: also scans sibling model-queue dirs → index continues
 *     across produce batches (unless the entire queue tree was cleared).
 *   - Non-queue path (no _NNN suffix): sibling scan is a no-op.
 */
export function resolveNextOutputIndex(taskPath: string, ext: string): number {
  const outputDir = path.dirname(taskPath);
  const base = deriveOutputBase(taskPath);

  const localMax = scanDirMaxIndex(outputDir, base, ext);
  const siblingMax = scanSiblingQueueDirs(outputDir, base, ext);

  return Math.max(localMax, siblingMax) + 1;
}

/**
 * From an output filename (e.g. "shot_01_1.png" or "shot_01_m1_1.png"),
 * determine the corresponding task JSON base name and whether it's a modified task.
 *
 * Original task: id.json → id_1.png → taskBase=id, isModified=false
 * Modified task: id_m1.json → id_m1_1.png → taskBase=id_m1, isModified=true
 */
export function parseOutputFilename(outputFile: string): {
  taskBase: string;
  isModified: boolean;
  taskJsonName: string;
} {
  const name = path.basename(outputFile);
  // Pattern: base_mN_N.ext (modified task output, e.g. shot_01_m1_1.png)
  // The base ends with _mN and the output index is the final _N
  const modifiedMatch = name.match(/^(.+)_m(\d+)_(\d+)\.\w+$/);
  if (modifiedMatch) {
    const base = modifiedMatch[1]; // e.g. "shot_01" from "shot_01_m1_1.png"
    return { taskBase: base, isModified: true, taskJsonName: `${base}_m${modifiedMatch[2]}.json` };
  }

  // Pattern: base_N.ext (original task output, e.g. shot_01_frame_04_1.png)
  // Only match if base does NOT end with _mN
  const originalMatch = name.match(/^(.+)_(\d+)\.\w+$/);
  if (originalMatch) {
    const base = originalMatch[1];
    // Check if base ends with _mN (if so, it's not an original task pattern)
    if (/_m\d+$/.test(base)) {
      return { taskBase: base, isModified: true, taskJsonName: `${base}.json` };
    }
    return { taskBase: base, isModified: false, taskJsonName: `${base}.json` };
  }

  // Fallback: no pattern matched
  return { taskBase: name.replace(/\.\w+$/, ''), isModified: false, taskJsonName: name.replace(/\.\w+$/, '') };
}

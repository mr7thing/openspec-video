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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Scan the output directory for existing files matching base_*.<ext>,
 * and return the next available index (max existing index + 1).
 */
export function resolveNextOutputIndex(taskPath: string, ext: string): number {
  const outputDir = path.dirname(taskPath);
  const base = deriveOutputBase(taskPath);
  const pattern = new RegExp(`^${escapeRegex(base)}_(\\d+)\\.${escapeRegex(ext)}$`);

  let maxIndex = 0;
  if (fs.existsSync(outputDir)) {
    const entries = fs.readdirSync(outputDir);
    for (const entry of entries) {
      const match = entry.match(pattern);
      if (match) {
        maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
      }
    }
  }
  return maxIndex + 1;
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
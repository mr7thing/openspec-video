// ============================================================================
// OpsV v0.8 Task/Output Naming Convention
// ============================================================================
//
// Task JSON naming:
//   id.json       → original task    → output: id_1.ext
//   id_2.json     → modified task    → output: id_2_1.ext
//   id_3.json     → further modified → output: id_3_1.ext
//
// Review detection from output filename:
//   id_1.ext      → base=id   → matches id.json (original)  → direct approved
//   id_2_1.ext    → base=id_2 → matches id_2.json (modified)→ syncing + record task path
// ============================================================================

import path from 'path';

export function deriveOutputBase(taskPath: string): string {
  return path.basename(taskPath, '.json');
}

export function isModifiedTask(taskPath: string): boolean {
  const filename = path.basename(taskPath, '.json');
  const match = filename.match(/_(\d+)$/);
  return match !== null && parseInt(match[1]) >= 2;
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
 * From an output filename (e.g. "@hero_1.png" or "@hero_2_1.png"),
 * determine the corresponding task JSON base name and whether it's a modified task.
 */
export function parseOutputFilename(outputFile: string): {
  taskBase: string;
  isModified: boolean;
  taskJsonName: string;
} {
  const name = path.basename(outputFile);
  // Pattern: base_N.ext or base_N_N.ext
  // The task JSON name = everything before the last _N.ext
  const match = name.match(/^(.+)_(\d+)\.\w+$/);
  if (!match) {
    return { taskBase: name.replace(/\.\w+$/, ''), isModified: false, taskJsonName: name.replace(/\.\w+$/, '') };
  }

  const base = match[1];
  const isModified = isModifiedTaskBase(base);
  return { taskBase: base, isModified, taskJsonName: `${base}.json` };
}

function isModifiedTaskBase(base: string): boolean {
  const match = base.match(/_(\d+)$/);
  return match !== null && parseInt(match[1]) >= 2;
}

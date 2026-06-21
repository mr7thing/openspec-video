/**
 * OPSV Webapp Pipeline
 *
 * Shared post-processing after a runner generates images:
 *   1. Watermark removal (per-site tool)
 *   2. Copy results to OPSV queue dir with standard naming (shot_N.png)
 *
 * Each site runner is responsible for upload → generate → download.
 * This module handles what happens *after* raw images are produced.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

// ── Watermark Tool Registry ────────────────────────────────────────────────

const WATERMARK_TOOLS: Record<string, string | null> = {
  gemini: 'gwr',
  jimeng: null,
  qianwen: null,
  wan: null,
  default: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] ${msg}`);
}

function which(cmd: string): boolean {
  // Check PATH first
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    // Fallback: check common npm global bin directories
    const homeDir = os.homedir();
    const candidates = [
      path.join(homeDir, '.npm-global', 'bin', cmd),
      path.join(homeDir, '.local', 'bin', cmd),
      path.join(homeDir, 'node_modules', '.bin', cmd),
      `/usr/local/bin/${cmd}`,
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return true;
    }
    return false;
  }
}

// ── Watermark Removal ──────────────────────────────────────────────────────

export function getWatermarkTool(site: string): string | null {
  return WATERMARK_TOOLS[site] ?? WATERMARK_TOOLS.default ?? null;
}

function resolveToolPath(tool: string): string | null {
  // Check PATH first
  try {
    const result = execSync(`which ${tool}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (result) return result;
  } catch {
    // not in PATH
  }
  // Fallback: check common npm global bin directories
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, '.npm-global', 'bin', tool),
    path.join(homeDir, '.local', 'bin', tool),
    `/usr/local/bin/${tool}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function removeWatermark(imagePath: string, site = 'gemini', toolOverride?: string): boolean {
  const toolName = toolOverride || getWatermarkTool(site);
  if (!toolName) {
    log(`No watermark tool for site '${site}', skipping`, 'INFO');
    return true;
  }

  const toolPath = resolveToolPath(toolName);
  if (!toolPath) {
    log(`Watermark tool '${toolName}' not found`, 'WARN');
    return false;
  }

  log(`Removing watermark (${toolPath}): ${path.basename(imagePath)}`);

  try {
    execSync(`"${toolPath}" remove "${imagePath}" --out-dir "${path.dirname(imagePath)}" --overwrite`, { stdio: 'pipe', timeout: 120_000 });
    log(`Watermark removed: ${path.basename(imagePath)}`);
    return true;
  } catch (e: any) {
    log(`Watermark removal failed: ${e.message?.slice(0, 200)}`, 'WARN');
    return false;
  }
}

// ── Output Naming ──────────────────────────────────────────────────────────

export function resolveOutputPath(queueDir: string, shotId: string, imageIndex = 1): string {
  const outDir = path.resolve(queueDir);
  fs.mkdirSync(outDir, { recursive: true });

  const pattern = new RegExp(`^${escapeRegex(shotId)}_(\\d+)\\.png$`);
  const existing = fs.readdirSync(outDir).filter(f => pattern.test(f));
  let maxIdx = imageIndex;

  for (const f of existing) {
    const m = f.match(pattern);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx >= maxIdx) maxIdx = idx + 1;
    }
  }

  return path.join(outDir, `${shotId}_${maxIdx}.png`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SaveResult {
  outputPaths: string[];
}

/**
 * Full post-processing pipeline: watermark removal → copy to queue dir.
 */
export function saveResults(
  imagePaths: string[],
  queueDir: string,
  shotId: string,
  options?: { removeWatermark?: boolean; site?: string; watermarkTool?: string },
): SaveResult {
  const removeWm = options?.removeWatermark ?? true;
  const site = options?.site ?? 'gemini';
  const outputPaths: string[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    let currentPath = imagePaths[i];

    // Step 1: Watermark removal
    if (removeWm) {
      removeWatermark(currentPath, site, options?.watermarkTool);
    }

    // Step 2: Copy to queue dir
    const outPath = resolveOutputPath(queueDir, shotId, i + 1);
    fs.copyFileSync(currentPath, outPath);
    outputPaths.push(outPath);
    log(`Saved: ${outPath}`);
  }

  return { outputPaths };
}

// ── Error Logging ──────────────────────────────────────────────────────────

export function writeErrorLog(queueDir: string, shotId: string, errorInfo: Record<string, any>): void {
  const errPath = path.join(queueDir, `${shotId}_error.log`);
  fs.writeFileSync(errPath, JSON.stringify(errorInfo, null, 2));
  log(`Error log written: ${errPath}`, 'WARN');
}

export function clearErrorLog(queueDir: string, shotId: string): void {
  const errPath = path.join(queueDir, `${shotId}_error.log`);
  if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
}

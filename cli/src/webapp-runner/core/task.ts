/**
 * OPSV Webapp Task Parser
 *
 * Parse OPSV-compiled task JSON files into a normalized, provider-agnostic format.
 *
 * Task JSON format (produced by WebappCompiler.ts):
 * ```json
 * {
 *   "payload": {
 *     "task_id": "shot_01",
 *     "target_url": "https://gemini.google.com",
 *     "prompt": "...",
 *     "typing_speed": "human",
 *     "watermark_removal": true,
 *     "reference_files": ["path1.png"],
 *     "frame_ref": { "first": "...", "last": null },
 *     "global_settings": { "aspect_ratio": "16:9" }
 *   },
 *   "_opsv": {
 *     "provider": "webapp",
 *     "modelKey": "webapp.gemini",
 *     "type": "webapp",
 *     "shotId": "shot_01",
 *     "api_url": "http://127.0.0.1:9700/generate",
 *     "api_status_url": "http://127.0.0.1:9700/status",
 *     "references": ["path1.png"],
 *     "compiledAt": "2026-06-08T00:00:00.000Z"
 *   }
 * }
 * ```
 */

import fs from 'fs';
import path from 'path';

export const DEFAULT_RATIO = '16:9';

export interface TaskInfo {
  shotId: string;
  prompt: string;
  referenceFiles: string[];
  aspectRatio: string;
  watermarkRemoval: boolean;
  modelKey: string;
  site: string;
  targetUrl: string;
  queueDir: string;
  taskPath: string;
  frameRef: { first?: string | null; last?: string | null } | null;
  raw: Record<string, unknown>;
}

export interface QueueStatus {
  directory: string;
  total: number;
  completed: number;
  pending: number;
  failed: number;
}

/**
 * Parse an OPSV task JSON file into a normalized TaskInfo.
 */
export function parseTask(taskPath: string): TaskInfo {
  const raw: Record<string, any> = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
  const payload = (raw.payload || {}) as Record<string, any>;
  const meta = (raw._opsv || {}) as Record<string, any>;

  const shotId = meta.shotId || payload.task_id || path.basename(taskPath, '.json');
  const prompt = (payload.prompt || '') as string;
  const referenceFiles: string[] = payload.reference_files || meta.references || [];
  const targetUrl = (payload.target_url || '') as string;
  const modelKey = (meta.modelKey || '') as string;
  const watermarkRemoval = payload.watermark_removal !== false;

  // Resolve aspect ratio: global_settings > prompt flag > default
  let aspectRatio = DEFAULT_RATIO;
  const gs = payload.global_settings;
  if (gs && typeof gs === 'object' && gs.aspect_ratio) {
    aspectRatio = gs.aspect_ratio;
  } else {
    const m = prompt.match(/--rt\s+(\S+)/);
    if (m) aspectRatio = m[1];
  }

  // Derive site name: "webapp.gemini" → "gemini"
  const site = modelKey.includes('.') ? modelKey.split('.').pop()! : modelKey;

  const absPath = path.resolve(taskPath);
  const queueDir = path.dirname(absPath);

  return {
    shotId,
    prompt,
    referenceFiles,
    aspectRatio,
    watermarkRemoval,
    modelKey,
    site,
    targetUrl,
    queueDir,
    taskPath: absPath,
    frameRef: payload.frame_ref || null,
    raw,
  };
}

/**
 * Check if a file looks like a task JSON (not a manifest or hidden file).
 */
export function isTaskJson(filePath: string): boolean {
  const name = path.basename(filePath);
  return (
    name.endsWith('.json') &&
    !name.startsWith('_') &&
    !name.startsWith('.') &&
    fs.statSync(filePath).size > 50
  );
}

/**
 * Find all pending task JSONs in a queue directory.
 *
 * "Pending" = task JSON exists but no output images (or has error log).
 * If retry=true, also include tasks with _error.log.
 */
export function findPendingTasks(queueDir: string, retry = false): string[] {
  const qp = path.resolve(queueDir);
  if (!fs.existsSync(qp)) return [];

  const files = fs.readdirSync(qp).filter(f => f.endsWith('.json')).sort();
  const pending: string[] = [];

  for (const f of files) {
    const fullPath = path.join(qp, f);
    if (!isTaskJson(fullPath)) continue;

    const shotId = path.basename(f, '.json');
    const hasOutput = fs.readdirSync(qp).some(e => e.startsWith(`${shotId}_`) && e.endsWith('.png'));
    const hasError = fs.existsSync(path.join(qp, `${shotId}_error.log`));

    if (hasOutput && !hasError) continue; // already completed
    if (hasError && !retry) continue;     // failed, skip unless retry

    pending.push(fullPath);
  }

  return pending;
}

/**
 * Scan a queue dir and count pending / completed / failed tasks.
 */
export function scanQueueStatus(queueDir: string): QueueStatus {
  const qp = path.resolve(queueDir);
  if (!fs.existsSync(qp)) {
    return { directory: queueDir, total: 0, completed: 0, pending: 0, failed: 0 };
  }

  const files = fs.readdirSync(qp).filter(f => f.endsWith('.json')).sort();
  let total = 0;
  let completed = 0;
  let pending = 0;
  let failed = 0;

  for (const f of files) {
    const fullPath = path.join(qp, f);
    if (!isTaskJson(fullPath)) continue;

    total++;
    const shotId = path.basename(f, '.json');
    const hasOutput = fs.readdirSync(qp).some(e => e.startsWith(`${shotId}_`) && e.endsWith('.png'));
    const hasError = fs.existsSync(path.join(qp, `${shotId}_error.log`));

    if (hasError) failed++;
    else if (hasOutput) completed++;
    else pending++;
  }

  return { directory: queueDir, total, completed, pending, failed };
}

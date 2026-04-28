// ============================================================================
// OpsV v0.8 Gradient Polling + JSONL Log Checkpoint
// ============================================================================
//
// Gradient intervals:
//   0-5min   → 10s  (30 polls)
//   5-10min  → 30s  (10 polls)
//   10-30min → 60s  (20 polls)
//   30min+   → 300s (ongoing)
//
// .log file = JSONL append-only, crash-safe checkpoint:
//   {"event":"submitted","task_id":"xxx","ts":"..."}
//   {"event":"polling","status":"running","ts":"..."}
//   {"event":"succeeded","output":"@hero_1.png","ts":"..."}
//
// Resume: if .log exists with submitted/polling but no succeeded/failed,
// next opsv run reads task_id from log and resumes polling.

import fs from 'fs';
import path from 'path';

export interface PollLogEntry {
  event: 'submitted' | 'polling' | 'succeeded' | 'failed';
  task_id?: string;
  status?: string;
  output?: string;
  error?: string;
  ts?: string; // auto-filled by appendLog
}

export function logPath(taskPath: string): string {
  return taskPath.replace(/\.json$/, '.log');
}

export function appendLog(taskPath: string, entry: PollLogEntry): void {
  const lp = logPath(taskPath);
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  fs.appendFileSync(lp, line);
}

export function readLastLogEntry(taskPath: string): PollLogEntry | null {
  const lp = logPath(taskPath);
  if (!fs.existsSync(lp)) return null;

  const content = fs.readFileSync(lp, 'utf-8').trim();
  if (!content) return null;

  const lines = content.split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

export function getResumeTaskId(taskPath: string): string | null {
  const last = readLastLogEntry(taskPath);
  if (!last) return null;
  if (last.event === 'submitted' || last.event === 'polling') {
    return last.task_id || null;
  }
  return null;
}

export function isTaskCompleted(taskPath: string): boolean {
  const last = readLastLogEntry(taskPath);
  return last?.event === 'succeeded' || last?.event === 'failed';
}

export function cleanupLog(taskPath: string): void {
  const lp = logPath(taskPath);
  if (fs.existsSync(lp)) {
    fs.unlinkSync(lp);
  }
}

// Gradient polling interval based on elapsed time since submission
export function getPollIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 5 * 60 * 1000) return 10_000;       // 0-5min: 10s
  if (elapsedMs < 10 * 60 * 1000) return 30_000;      // 5-10min: 30s
  if (elapsedMs < 30 * 60 * 1000) return 60_000;      // 10-30min: 60s
  return 300_000;                                       // 30min+: 300s
}

// Sleep helper
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Compute elapsed time from first log entry
export function getElapsedMs(taskPath: string): number {
  const lp = logPath(taskPath);
  if (!fs.existsSync(lp)) return 0;

  const content = fs.readFileSync(lp, 'utf-8').trim();
  if (!content) return 0;

  const firstLine = content.split('\n')[0];
  try {
    const first = JSON.parse(firstLine);
    return Date.now() - new Date(first.ts).getTime();
  } catch {
    return 0;
  }
}

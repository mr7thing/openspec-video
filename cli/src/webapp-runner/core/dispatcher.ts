/**
 * OPSV Webapp Runner Dispatcher
 *
 * Maps task model_key (e.g. "webapp.gemini") to the appropriate site runner.
 */

import { TaskInfo } from './task';
import { RunnerResult } from './types';

// Runner map: model_key prefix → runner module path (relative to webapp-runner/)
// Adding a new site = add an entry here + create runners/<site>.ts
const RUNNER_MAP: Record<string, string> = {
  'webapp.gemini': '../runners/gemini',
  'webapp.jimeng': '../runners/jimeng',
  'webapp.qianwen': '../runners/qianwen',
  'webapp.wan': '../runners/wan',
};

/**
 * Resolve a model_key to a runner module path.
 */
export function resolveRunner(modelKey: string): string | null {
  // Exact match
  if (RUNNER_MAP[modelKey]) return RUNNER_MAP[modelKey];

  // Longest prefix match
  const sorted = Object.keys(RUNNER_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (modelKey.startsWith(prefix)) return RUNNER_MAP[prefix];
  }

  // Fallback: derive from suffix (e.g. "webapp.xxx" → "../runners/xxx")
  const parts = modelKey.split('.');
  if (parts.length >= 2) return `../runners/${parts[parts.length - 1]}`;

  return null;
}

export interface RunnerModule {
  run(taskInfo: TaskInfo): RunnerResult | Promise<RunnerResult>;
}

/**
 * Execute a task by dispatching to the correct site runner.
 */
export async function dispatch(taskInfo: TaskInfo): Promise<RunnerResult> {
  const runnerPath = resolveRunner(taskInfo.modelKey);

  if (!runnerPath) {
    return {
      status: 'failed',
      images: [],
      error: `No runner configured for model_key '${taskInfo.modelKey}'`,
    };
  }

  try {
    const mod: RunnerModule = await import(runnerPath);
    const result = await mod.run(taskInfo);

    return {
      status: result.status || 'failed',
      images: result.images || [],
      error: result.error || null,
    };
  } catch (e: any) {
    return {
      status: 'failed',
      images: [],
      error: `Cannot load runner '${runnerPath}': ${e.message}`,
    };
  }
}

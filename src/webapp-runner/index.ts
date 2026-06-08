/**
 * OPSV Webapp Executor
 *
 * Multi-site webapp runner for OPSV.
 *
 * Routes compiled task JSONs (from `opsv webapp --model webapp.<site>`)
 * to the appropriate site runner, handles post-processing (watermark removal,
 * result saving), and manages the complete batch lifecycle.
 *
 * Can be used:
 *   - Programmatically (import and call executeTask / executeBatch)
 *   - Via CLI (opsv webapp-exec)
 */

import path from 'path';
import { parseTask, findPendingTasks, scanQueueStatus } from './core/task';
import { dispatch } from './core/dispatcher';
import { saveResults, writeErrorLog, clearErrorLog } from './core/pipeline';
import { RunnerResult } from './core/types';

export { parseTask, findPendingTasks, scanQueueStatus } from './core/task';
export { dispatch } from './core/dispatcher';
export { saveResults, removeWatermark, writeErrorLog, clearErrorLog } from './core/pipeline';
export type { TaskInfo, QueueStatus } from './core/task';
export type { RunnerResult } from './core/types';

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] ${msg}`);
}

// ── Single Task Execution ──────────────────────────────────────────────────

export interface TaskResult {
  shotId: string;
  site: string;
  status: 'completed' | 'failed';
  generatedImages: string[];
  outputPaths: string[];
  error: string | null;
}

/**
 * Execute one task end-to-end: dispatch → post-process → save.
 */
export function executeTask(taskPath: string, queueDir?: string, watermark = true): TaskResult {
  const taskInfo = parseTask(taskPath);
  const actualQueueDir = queueDir || path.dirname(taskPath);

  const result: TaskResult = {
    shotId: taskInfo.shotId,
    site: taskInfo.site,
    status: 'failed',
    generatedImages: [],
    outputPaths: [],
    error: null,
  };

  log(`Processing: ${taskInfo.shotId} (site=${taskInfo.site})`);

  // Step 1: Dispatch to site runner
  // Note: dispatch is async, but we need it sync here since TaskBuilder runs sync
  // We'll use an inline approach for the CLI context
  try {
    // For the CLI, we require() the runner synchronously
    const { resolveRunner } = require('./core/dispatcher');
    const runnerPath = resolveRunner(taskInfo.modelKey);
    if (!runnerPath) {
      result.error = `No runner for model_key '${taskInfo.modelKey}'`;
      writeErrorLog(actualQueueDir, taskInfo.shotId, result);
      return result;
    }

    // Resolve runner path relative to the dispatcher's location
    const resolvedPath = require.resolve('./core/' + runnerPath);
    const runnerMod = require(resolvedPath);
    const runnerResult: RunnerResult = runnerMod.run(taskInfo);

    if (runnerResult.status !== 'success' || !runnerResult.images?.length) {
      result.error = runnerResult.error || 'Runner returned no images';
      log(`Runner failed: ${result.error}`, 'ERROR');
      writeErrorLog(actualQueueDir, taskInfo.shotId, result);
      return result;
    }

    result.generatedImages = runnerResult.images;

    // Step 2: Post-processing (watermark + copy to queue dir)
    const removeWm = watermark && taskInfo.watermarkRemoval;
    const { outputPaths } = saveResults(runnerResult.images, actualQueueDir, taskInfo.shotId, {
      removeWatermark: removeWm,
      site: taskInfo.site,
    });

    result.outputPaths = outputPaths;
    result.status = 'completed';

    clearErrorLog(actualQueueDir, taskInfo.shotId);

    return result;
  } catch (e: any) {
    result.error = e.message;
    log(`Task failed with exception: ${e.message}`, 'ERROR');
    writeErrorLog(actualQueueDir, taskInfo.shotId, result);
    return result;
  }
}

// ── Batch Execution ────────────────────────────────────────────────────────

export interface BatchSummary {
  status: 'completed' | 'partial';
  total: number;
  success: number;
  failed: number;
  results: TaskResult[];
}

/**
 * Execute all pending tasks in a queue directory.
 */
export function executeBatch(queueDir: string, watermark = true, retry = false): BatchSummary {
  const pendingTasks = findPendingTasks(queueDir, retry);

  if (pendingTasks.length === 0) {
    log('No pending tasks found', 'INFO');
    return { status: 'completed', total: 0, success: 0, failed: 0, results: [] };
  }

  log(`Found ${pendingTasks.length} pending task(s) in ${queueDir}`);

  const summary: BatchSummary = { status: 'completed', total: pendingTasks.length, success: 0, failed: 0, results: [] };

  for (const taskJson of pendingTasks) {
    try {
      const result = executeTask(taskJson, queueDir, watermark);
      summary.results.push(result);
      if (result.status === 'completed') {
        summary.success++;
      } else {
        summary.failed++;
      }
    } catch (e: any) {
      const shotId = path.basename(taskJson, '.json');
      log(`Task ${shotId} exception: ${e.message}`, 'ERROR');
      summary.failed++;
      summary.results.push({ shotId, site: '?', status: 'failed', generatedImages: [], outputPaths: [], error: e.message });
    }
  }

  if (summary.failed > 0) summary.status = 'partial';
  log(`Batch complete: ${summary.success} OK, ${summary.failed} FAIL / ${summary.total} total`);
  return summary;
}

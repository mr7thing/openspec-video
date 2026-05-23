// ============================================================================
// OpsV Base API Provider
// Abstracts: submit → (sync output | poll → download) → result for all REST API providers.
//
// Two response modes:
//   - Async: submit returns task ID → poll status URL → extract output URLs → download
//   - Sync:  submit response itself contains output URLs or binary data → save directly
//
// Subclasses opt into sync mode by overriding extractSyncOutputUrls() and/or
// extractSyncOutputBuffers(). If neither yields data AND parseTaskId() returns
// nothing, the provider errors with "No task ID in submit response".
// ============================================================================

import fs from 'fs';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { HttpClient } from '../HttpClient';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import {
  appendLog,
  getResumeTaskId,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
} from '../polling';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';
import { OpsVContext } from '../../container/OpsVContext';
import { ModelConfig } from '../../utils/configLoader';
import { generateRandomSeed } from '../../utils/randomSeed';

// Recursively replace `seed: "random"` (or any *seed key) with a freshly
// generated random integer at execution time, so each invocation uses a
// new seed and the literal string never reaches the provider API.
function expandRandomSeeds(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    for (const item of payload) expandRandomSeeds(item);
    return;
  }
  const obj = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value === 'random' && /seed$/i.test(key)) {
      obj[key] = generateRandomSeed();
    } else if (value && typeof value === 'object') {
      expandRandomSeeds(value);
    }
  }
}

export abstract class BaseApiProvider<TPayload, TSubmitResponse, TStatusResponse> {
  abstract readonly name: string;

  protected abstract buildPayload(task: BaseTaskJson<TPayload>): unknown;
  protected abstract parseTaskId(res: TSubmitResponse): string | undefined;
  protected abstract buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string;
  protected abstract isComplete(statusRes: TStatusResponse): boolean;
  protected abstract isFailed(statusRes: TStatusResponse): boolean;
  protected abstract extractError(statusRes: TStatusResponse): string;
  protected abstract extractOutputUrls(statusRes: TStatusResponse): string[];
  protected abstract getOutputExtension(task?: BaseTaskJson<TPayload>): string;

  // Optional poll-mode hook: subclasses override to use POST or custom request shape.
  // Default: GET buildStatusUrl(meta, taskId).
  protected async pollStatus(
    client: HttpClient,
    meta: { api_url: string; api_status_url?: string },
    taskId: string,
    timeout: number
  ): Promise<TStatusResponse> {
    const statusUrl = this.buildStatusUrl(meta, taskId);
    return client.get<TStatusResponse>(statusUrl, { timeout });
  }

  // Optional sync-mode hooks: subclasses override to handle APIs that return
  // output directly in the submit response (no polling needed).
  protected extractSyncOutputUrls(_res: TSubmitResponse): string[] {
    return [];
  }
  protected extractSyncOutputBuffers(_res: TSubmitResponse): Buffer[] {
    return [];
  }
  protected extractSubmitError(_res: TSubmitResponse): string | undefined {
    return undefined;
  }

  // Optional: extract human-readable status label for progress logs (default: "running")
  protected extractStatus(_res: TStatusResponse): string {
    const r = _res as any;
    return r?.status || r?.data?.status || 'running';
  }

  protected buildHttpClient(ctx: OpsVContext, modelKey: string): HttpClient {
    const config = ctx.configLoader.getModelConfig(modelKey);
    const apiKey = ctx.configLoader.getResolvedApiKey(modelKey);
    return new HttpClient({
      apiKey,
      timeout: config?.timeout?.submit || 300000,
      maxRetries: config?.retry?.max_retries ?? 3,
      retryDelayCap: config?.retry?.delay_cap ?? 30000,
    });
  }

  protected getModelConfig(ctx: OpsVContext, modelKey: string): ModelConfig | undefined {
    return ctx.configLoader.getModelConfig(modelKey);
  }

  async execute(
    task: BaseTaskJson<TPayload>,
    taskPath: string,
    ctx: OpsVContext
  ): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;
    const modelConfig = this.getModelConfig(ctx, meta.modelKey);
    const maxDuration = modelConfig?.max_poll_duration || 4 * 60 * 60 * 1000;
    const ext = this.getOutputExtension(task);

    let taskId: string | null = getResumeTaskId(taskPath);
    const client = this.buildHttpClient(ctx, meta.modelKey);

    try {
      if (!taskId) {
        const payload = this.buildPayload(task);
        expandRandomSeeds(payload);
        const submitRes = await client.post<TSubmitResponse>(meta.api_url, payload);

        // Check for submit-level error first (some APIs return 200 with error body)
        const submitErr = this.extractSubmitError(submitRes);
        if (submitErr) {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_SUBMIT_FAILED,
            `${this.name} submit failed: ${submitErr}`
          );
        }

        // Sync mode: submit response itself carries the output
        const syncBuffers = this.extractSyncOutputBuffers(submitRes);
        if (syncBuffers.length > 0) {
          return this.saveBuffersAndFinish(syncBuffers, taskPath, ext, shotId, null);
        }
        const syncUrls = this.extractSyncOutputUrls(submitRes);
        if (syncUrls.length > 0) {
          return this.downloadUrlsAndFinish(syncUrls, taskPath, ext, shotId, null);
        }

        // Async mode: must have a task ID to poll
        taskId = this.parseTaskId(submitRes) || null;
        if (!taskId) {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_SUBMIT_FAILED,
            `No task ID in submit response: ${JSON.stringify(submitRes)}`
          );
        }

        appendLog(taskPath, { event: 'submitted', task_id: taskId });
        logger.info(`[${this.name}] Submitted ${shotId}, taskId=${taskId}`);
      } else {
        logger.info(`[${this.name}] Resuming ${shotId}, taskId=${taskId}`);
      }

      let pollAttempt = 0;
      while (true) {
        pollAttempt++;
        const elapsed = getElapsedMs(taskPath);
        if (elapsed > maxDuration) {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_TIMEOUT,
            `Polling timeout for ${taskId} (${maxDuration}ms exceeded)`
          );
        }

        const interval = getPollIntervalMs(
          elapsed,
          ctx.configLoader.getSettings()?.polling?.intervals
        );
        await sleep(interval);

        const statusRes = await this.pollStatus(
          client,
          meta,
          taskId,
          modelConfig?.timeout?.status || 120000
        );

        if (this.isFailed(statusRes)) {
          const reason = this.extractError(statusRes);
          appendLog(taskPath, { event: 'failed', task_id: taskId, error: reason });
          throw new ExecutionError(OpsVErrorCode.EXECUTION_TASK_FAILED, `${this.name} task failed: ${reason}`);
        }

        if (this.isComplete(statusRes)) {
          const urls = this.extractOutputUrls(statusRes);
          if (urls.length === 0) {
            throw new ExecutionError(OpsVErrorCode.EXECUTION_OUTPUT_NOT_FOUND, 'Completed but no output URLs found');
          }
          return this.downloadUrlsAndFinish(urls, taskPath, ext, shotId, taskId);
        }

        const statusLabel = this.extractStatus(statusRes);
        logger.info(`[${this.name}] ${shotId}: polling (attempt ${pollAttempt}, ${Math.round(elapsed / 1000)}s elapsed, status=${statusLabel})`);
        appendLog(taskPath, { event: 'polling', status: statusLabel, task_id: taskId });
      }
    } catch (err: any) {
      const message = err instanceof ExecutionError ? err.message : `${this.name} execution error: ${err.message}`;
      appendLog(taskPath, { event: 'failed', task_id: taskId || 'unknown', error: message });
      return {
        taskPath,
        shotId,
        provider: this.name,
        success: false,
        error: message,
      };
    }
  }

  private async downloadUrlsAndFinish(
    urls: string[],
    taskPath: string,
    ext: string,
    shotId: string,
    taskId: string | null
  ): Promise<ProviderResult> {
    const outputPaths: string[] = [];
    const nextIndex = resolveNextOutputIndex(taskPath, ext);
    for (let i = 0; i < urls.length; i++) {
      const outputPath = outputFilePath(taskPath, nextIndex + i, ext);
      await downloadFile(urls[i], outputPath);
      outputPaths.push(outputPath);
    }
    appendLog(taskPath, { event: 'succeeded', task_id: taskId || 'sync', output: outputPaths.join(', ') });
    return {
      taskPath,
      shotId,
      provider: this.name,
      success: true,
      outputPath: outputPaths[0],
      outputPaths,
    };
  }

  private async saveBuffersAndFinish(
    buffers: Buffer[],
    taskPath: string,
    ext: string,
    shotId: string,
    taskId: string | null
  ): Promise<ProviderResult> {
    const outputPaths: string[] = [];
    const nextIndex = resolveNextOutputIndex(taskPath, ext);
    for (let i = 0; i < buffers.length; i++) {
      const outputPath = outputFilePath(taskPath, nextIndex + i, ext);
      fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffers[i]);
      outputPaths.push(outputPath);
    }
    appendLog(taskPath, { event: 'succeeded', task_id: taskId || 'sync', output: outputPaths.join(', ') });
    return {
      taskPath,
      shotId,
      provider: this.name,
      success: true,
      outputPath: outputPaths[0],
      outputPaths,
    };
  }
}

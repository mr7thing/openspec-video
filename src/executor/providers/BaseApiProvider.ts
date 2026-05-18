// ============================================================================
// OpsV Base API Provider
// Abstracts: submit → poll → download → result for all REST API providers.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { BaseTaskJson, TaskMeta } from '../../types/Job';
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

export abstract class BaseApiProvider<TPayload, TSubmitResponse, TStatusResponse> {
  abstract readonly name: string;

  protected abstract buildPayload(task: BaseTaskJson<TPayload>): unknown;
  protected abstract parseTaskId(res: TSubmitResponse): string | undefined;
  protected abstract buildStatusUrl(apiUrl: string, taskId: string): string;
  protected abstract isComplete(statusRes: TStatusResponse): boolean;
  protected abstract isFailed(statusRes: TStatusResponse): boolean;
  protected abstract extractError(statusRes: TStatusResponse): string;
  protected abstract extractOutputUrls(statusRes: TStatusResponse): string[];
  protected abstract getOutputExtension(): string;

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

    let taskId: string | null = getResumeTaskId(taskPath);
    const client = this.buildHttpClient(ctx, meta.modelKey);

    try {
      if (!taskId) {
        const payload = this.buildPayload(task);
        const submitRes = await client.post<TSubmitResponse>(meta.api_url, payload);
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

      while (true) {
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

        const statusUrl = this.buildStatusUrl(meta.api_url, taskId);
        const statusRes = await client.get<TStatusResponse>(statusUrl, {
          timeout: modelConfig?.timeout?.status || 120000,
        });

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

          const outputPaths: string[] = [];
          let nextIndex = resolveNextOutputIndex(taskPath, this.getOutputExtension());
          for (let i = 0; i < urls.length; i++) {
            const outputPath = outputFilePath(taskPath, nextIndex + i, this.getOutputExtension());
            await downloadFile(urls[i], outputPath);
            outputPaths.push(outputPath);
          }

          appendLog(taskPath, { event: 'succeeded', task_id: taskId, output: outputPaths.join(', ') });
          return {
            taskPath,
            shotId,
            provider: this.name,
            success: true,
            outputPath: outputPaths[0],
            outputPaths,
          };
        }

        appendLog(taskPath, { event: 'polling', status: 'running', task_id: taskId });
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
}

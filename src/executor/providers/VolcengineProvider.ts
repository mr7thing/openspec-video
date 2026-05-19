// ============================================================================
// OpsV Volcengine Executor Provider
// Handles: seadream (image), seedance2 (video)
// ============================================================================

import { readFile } from 'fs/promises';
import path from 'path';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { BaseApiProvider } from './BaseApiProvider';
import { OpsVContext } from '../../container/OpsVContext';
import { HttpClient } from '../HttpClient';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import { appendLog, getResumeTaskId, sleep } from '../polling';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

interface VolcImagePayload {
  prompt?: string;
  reference_images?: string[];
  [key: string]: any;
}

interface VolcVideoPayload {
  content?: Array<{
    image_url?: { url: string };
    video_url?: { url: string };
    audio_url?: { url: string };
  }>;
  [key: string]: any;
}

interface VolcSubmitResponse {
  id?: string;
  data?: { id?: string };
  task_id?: string;
}

interface VolcImageSubmitResponse {
  id?: string;
  data?: { id?: string } | Array<{ url?: string }>;
  url?: string;
}

interface VolcStatusResponse {
  status?: string;
  data?: {
    status?: string;
    video_url?: string;
  };
  content?: { video_url?: string };
  error_message?: string;
}

export class VolcengineProvider extends BaseApiProvider<VolcImagePayload | VolcVideoPayload, VolcSubmitResponse, VolcStatusResponse> {
  readonly name = 'volcengine';

  private async resolveImageField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    const data = await readFile(value);
    const ext = path.extname(value).slice(1) || 'png';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
      png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif',
    };
    const mime = mimeMap[ext.toLowerCase()] || `image/${ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  private async resolveVideoField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `Local video paths not supported: ${value}`);
  }

  private async resolveAudioField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `Local audio paths not supported: ${value}`);
  }

  protected buildPayload(task: BaseTaskJson<VolcImagePayload | VolcVideoPayload>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: VolcSubmitResponse): string | undefined {
    return res.id || res.data?.id || res.task_id;
  }

  protected buildStatusUrl(apiUrl: string, taskId: string): string {
    return `${apiUrl}/${taskId}`;
  }

  protected isComplete(res: VolcStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'succeeded' || status === 'completed';
  }

  protected isFailed(res: VolcStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'failed';
  }

  protected extractError(res: VolcStatusResponse): string {
    return res.error_message || 'Unknown error';
  }

  protected extractOutputUrls(res: VolcStatusResponse): string[] {
    const url = res.content?.video_url || res.data?.video_url;
    return url ? [url] : [];
  }

  protected getOutputExtension(task?: BaseTaskJson<VolcImagePayload | VolcVideoPayload>): string {
    if (task?._opsv?.type === 'imagen') return 'png';
    return 'mp4';
  }

  // Image tasks use submit→poll→download via BaseApiProvider
  async execute(task: BaseTaskJson<VolcImagePayload | VolcVideoPayload>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;
    const client = this.buildHttpClient(ctx, meta.modelKey);
    const modelConfig = this.getModelConfig(ctx, meta.modelKey);

    try {
      // Resolve local image paths for imagen tasks
      if (meta.type === 'imagen') {
        const payload = { ...task.payload } as VolcImagePayload;
        if (Array.isArray(payload.reference_images)) {
          payload.reference_images = await Promise.all(
            payload.reference_images.map((url: string) => this.resolveImageField(url))
          );
        }
        // Replace task payload with resolved version
        (task as any).payload = payload;
      }

      // Check if the image API returns results synchronously (no task ID)
      if (meta.type === 'imagen') {
        const payload = this.buildPayload(task);
        const data = await client.post<VolcImageSubmitResponse>(meta.api_url, payload, {
          timeout: modelConfig?.timeout?.submit || 300000,
        });

        const taskId = this.parseTaskId(data as VolcSubmitResponse);

        // Synchronous response: image URLs returned directly in submit response
        if (!taskId) {
          const imgResult = this.extractImageUrls(data);
          if (imgResult.length === 0) {
            throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `No image URL in response: ${JSON.stringify(data)}`);
          }

          const outputPaths: string[] = [];
          let nextIndex = resolveNextOutputIndex(taskPath, 'png');
          for (let i = 0; i < imgResult.length; i++) {
            const outputPath = outputFilePath(taskPath, nextIndex + i, 'png');
            await downloadFile(imgResult[i], outputPath);
            outputPaths.push(outputPath);
          }

          return { taskPath, shotId, provider: this.name, success: true, outputPath: outputPaths[0], outputPaths };
        }

        // Async response: has task ID, fall through to polling
        appendLog(taskPath, { event: 'submitted', task_id: taskId });
        logger.info(`[${this.name}] Submitted ${shotId}, taskId=${taskId}`);

        const maxDuration = modelConfig?.max_poll_duration || 4 * 60 * 60 * 1000;
        const startTime = Date.now();

        while (true) {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxDuration) {
            throw new ExecutionError(OpsVErrorCode.EXECUTION_TIMEOUT, `Polling timeout for ${taskId}`);
          }
          await sleep(Math.min(2000 + elapsed * 0.5, 15000));

          const statusUrl = this.buildStatusUrl(meta.api_url, taskId);
          const statusRes = await client.get<VolcStatusResponse>(statusUrl, {
            timeout: modelConfig?.timeout?.status || 120000,
          });

          if (this.isFailed(statusRes)) {
            throw new ExecutionError(OpsVErrorCode.EXECUTION_TASK_FAILED, `${this.name} task failed: ${this.extractError(statusRes)}`);
          }
          if (this.isComplete(statusRes)) {
            const urls = this.extractOutputUrls(statusRes);
            if (urls.length === 0) {
              throw new ExecutionError(OpsVErrorCode.EXECUTION_OUTPUT_NOT_FOUND, 'Completed but no output URLs found');
            }
            const outputPaths: string[] = [];
            let nextIndex = resolveNextOutputIndex(taskPath, 'png');
            for (let i = 0; i < urls.length; i++) {
              const outputPath = outputFilePath(taskPath, nextIndex + i, 'png');
              await downloadFile(urls[i], outputPath);
              outputPaths.push(outputPath);
            }
            appendLog(taskPath, { event: 'succeeded', task_id: taskId, output: outputPaths.join(', ') });
            return { taskPath, shotId, provider: this.name, success: true, outputPath: outputPaths[0], outputPaths };
          }
          appendLog(taskPath, { event: 'polling', status: 'running', task_id: taskId });
        }
      }

      // Video: use standard submit-poll-download
      return super.execute(task, taskPath, ctx);
    } catch (err: any) {
      const message = err instanceof ExecutionError ? err.message : `${this.name} execution error: ${err.message}`;
      return { taskPath, shotId, provider: this.name, success: false, error: message };
    }
  }

  private extractImageUrls(data: VolcImageSubmitResponse): string[] {
    const dataItems = data?.data;
    let imageUrls: string[] = [];

    if (Array.isArray(dataItems)) {
      imageUrls = dataItems.map((item: any) => item.url).filter(Boolean);
    } else {
      const url = (dataItems as any)?.url || data?.url;
      if (url) imageUrls = [url];
    }

    return imageUrls;
  }
}

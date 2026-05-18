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
import { appendLog, getResumeTaskId, getElapsedMs, getPollIntervalMs, sleep } from '../polling';
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
    const payload = { ...task.payload };
    const meta = task._opsv;

    if (meta.type === 'imagen' && Array.isArray((payload as VolcImagePayload).reference_images)) {
      (payload as VolcImagePayload).reference_images = (payload as VolcImagePayload).reference_images!;
    }

    if (meta.type === 'video' && Array.isArray((payload as VolcVideoPayload).content)) {
      // resolution handled at compile time; executor receives pre-resolved URLs
    }

    return payload;
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

  protected getOutputExtension(): string {
    return 'mp4';
  }

  // Override for image direct download (no polling)
  async execute(task: BaseTaskJson<VolcImagePayload | VolcVideoPayload>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    if (task._opsv.type === 'imagen') {
      return this.executeImage(task, taskPath, ctx);
    }
    return super.execute(task, taskPath, ctx);
  }

  private async executeImage(task: BaseTaskJson<VolcImagePayload>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;
    const client = this.buildHttpClient(ctx, meta.modelKey);
    const modelConfig = this.getModelConfig(ctx, meta.modelKey);

    try {
      const payload = { ...task.payload };

      if (Array.isArray(payload.reference_images)) {
        payload.reference_images = await Promise.all(
          payload.reference_images.map((url: string) => this.resolveImageField(url))
        );
      }

      const data = await client.post<any>(meta.api_url, payload, {
        timeout: modelConfig?.timeout?.submit || 300000,
      });

      const dataItems = data?.data;
      let imageUrls: string[] = [];

      if (Array.isArray(dataItems)) {
        imageUrls = dataItems.map((item: any) => item.url).filter(Boolean);
      } else {
        const url = dataItems?.[0]?.url || dataItems?.url || data?.url;
        if (url) imageUrls = [url];
      }

      if (imageUrls.length === 0) {
        throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `No image URL in response: ${JSON.stringify(data)}`);
      }

      const outputPaths: string[] = [];
      let nextIndex = resolveNextOutputIndex(taskPath, 'png');
      for (let i = 0; i < imageUrls.length; i++) {
        const outputPath = outputFilePath(taskPath, nextIndex + i, 'png');
        await downloadFile(imageUrls[i], outputPath);
        outputPaths.push(outputPath);
      }

      return {
        taskPath,
        shotId,
        provider: this.name,
        success: true,
        outputPath: outputPaths[0],
        outputPaths,
      };
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: this.name,
        success: false,
        error: err.message,
      };
    }
  }
}

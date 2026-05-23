// ============================================================================
// OpsV Volcengine Executor Provider
// Handles: seadream5 (imagen, sync URL response), seedance2 (video, async)
// ============================================================================

import { readFile } from 'fs/promises';
import path from 'path';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { BaseApiProvider } from './BaseApiProvider';
import { OpsVContext } from '../../container/OpsVContext';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

interface VolcSubmitResponse {
  id?: string;
  task_id?: string;
  data?: { id?: string } | Array<{ url?: string }>;
  url?: string;
}

interface VolcStatusResponse {
  status?: string;
  data?: { status?: string; video_url?: string };
  content?: { video_url?: string };
  error_message?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif',
};

export class VolcengineProvider extends BaseApiProvider<Record<string, any>, VolcSubmitResponse, VolcStatusResponse> {
  readonly name = 'volcengine';

  private async resolveImageField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    const data = await readFile(value);
    const ext = path.extname(value).slice(1).toLowerCase() || 'png';
    const mime = MIME_BY_EXT[ext] || `image/${ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  private async resolveMediaField(value: string, kind: 'video' | 'audio'): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `Local ${kind} paths not supported: ${value}`);
  }

  protected buildPayload(task: BaseTaskJson<Record<string, any>>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: VolcSubmitResponse): string | undefined {
    if (res.id) return res.id;
    if (res.task_id) return res.task_id;
    if (res.data && !Array.isArray(res.data)) return res.data.id;
    return undefined;
  }

  protected extractSyncOutputUrls(res: VolcSubmitResponse): string[] {
    // Image-only sync mode: data is an array of {url} or {url} object, or top-level url
    if (Array.isArray(res.data)) {
      return res.data.map((i) => i?.url).filter((u): u is string => !!u);
    }
    if (res.data && !Array.isArray(res.data) && (res.data as any).url) {
      return [(res.data as any).url];
    }
    if (res.url) return [res.url];
    return [];
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    const base = meta.api_status_url || meta.api_url;
    return `${base}/${taskId}`;
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

  protected getOutputExtension(task?: BaseTaskJson<Record<string, any>>): string {
    return task?._opsv?.type === 'imagen' ? 'png' : 'mp4';
  }

  async execute(task: BaseTaskJson<Record<string, any>>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    const payload = { ...task.payload } as Record<string, any>;

    // Imagen: resolve reference_images
    if (task._opsv.type === 'imagen' && Array.isArray(payload.reference_images)) {
      payload.reference_images = await Promise.all(payload.reference_images.map((v: string) => this.resolveImageField(v)));
    }

    // Video: resolve image/video/audio URLs inside content[]
    if (task._opsv.type === 'video' && Array.isArray(payload.content)) {
      for (const item of payload.content) {
        if (item.image_url?.url) item.image_url.url = await this.resolveImageField(item.image_url.url);
        if (item.video_url?.url) item.video_url.url = await this.resolveMediaField(item.video_url.url, 'video');
        if (item.audio_url?.url) item.audio_url.url = await this.resolveMediaField(item.audio_url.url, 'audio');
      }
    }

    const patched: BaseTaskJson<Record<string, any>> = { ...task, payload };
    return super.execute(patched, taskPath, ctx);
  }
}

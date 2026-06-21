// ============================================================================
// OpsV SiliconFlow Executor Provider
// Handles: qimg/edit2509 (imagen, sync), wan2v/i2v (video, async with POST status)
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';

interface SfSubmitResponse {
  // Sync image response
  images?: Array<{ url?: string }>;
  data?: Array<{ url?: string }> | { url?: string; requestId?: string };
  url?: string;
  // Async video response
  requestId?: string;
  id?: string;
  task_id?: string;
}

interface SfStatusResponse {
  status?: string;
  results?: { videos?: Array<{ url?: string }> };
  data?: { status?: string; video_url?: string; image_url?: string; url?: string };
  error?: { message?: string };
  message?: string;
}

export class SiliconFlowProvider extends BaseApiProvider<Record<string, any>, SfSubmitResponse, SfStatusResponse> {
  readonly name = 'siliconflow';

  protected buildPayload(task: BaseTaskJson<Record<string, any>>, _ctx?: any): unknown {
    // Note: local-file → data URI conversion happens lazily in execute() via async resolveImageField.
    // buildPayload is sync, so we return the raw payload; execute() pre-processes it.
    return { ...task.payload };
  }

  protected parseTaskId(res: SfSubmitResponse): string | undefined {
    return res.requestId
      || (res.data && !Array.isArray(res.data) ? res.data.requestId : undefined)
      || res.id
      || res.task_id;
  }

  protected extractSyncOutputUrls(res: SfSubmitResponse): string[] {
    if (Array.isArray(res.images)) {
      return res.images.map(i => i?.url).filter((u): u is string => !!u);
    }
    if (Array.isArray(res.data)) {
      return res.data.map(i => i?.url).filter((u): u is string => !!u);
    }
    if (res.url) return [res.url];
    return [];
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    // Video: api_status_url is provided (POST endpoint). Image never reaches here (sync path).
    return meta.api_status_url || `${meta.api_url}/${taskId}`;
  }

  // SiliconFlow video status uses POST with { requestId } body, not GET.
  protected async pollStatus(client: HttpClient, meta: { api_url: string; api_status_url?: string }, taskId: string, timeout: number, ctx?: any): Promise<SfStatusResponse> {
    if (meta.api_status_url) {
      return client.post<SfStatusResponse>(meta.api_status_url, { requestId: taskId }, { timeout });
    }
    return super.pollStatus(client, meta, taskId, timeout, ctx);
  }

  protected isComplete(res: SfStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'Succeed' || status === 'succeeded' || status === 'completed' || status === 'success';
  }

  protected isFailed(res: SfStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'Failed' || status === 'failed' || status === 'error';
  }

  protected extractError(res: SfStatusResponse): string {
    return res.error?.message || res.message || res.data?.status || 'Unknown error';
  }

  protected extractOutputUrls(res: SfStatusResponse): string[] {
    const videoUrl = res.results?.videos?.[0]?.url || res.data?.video_url;
    if (videoUrl) return [videoUrl];
    const d = res.data;
    const url = d?.image_url || d?.url;
    return url ? [url] : [];
  }

  protected getOutputExtension(task?: BaseTaskJson<Record<string, any>>): string {
    return task?._opsv?.type === 'imagen' ? 'png' : 'mp4';
  }

  // Override execute to pre-resolve local image paths to data URIs before submit.
  async execute(task: BaseTaskJson<Record<string, any>>, taskPath: string, ctx: any) {
    const payload = { ...task.payload } as Record<string, any>;

    if (Array.isArray(payload.reference_images)) {
      payload.reference_images = await Promise.all(payload.reference_images.map((v: string) => this.resolveImageToBase64(v)));
    }
    if (payload.image) payload.image = await this.resolveImageToBase64(payload.image);
    if (payload.tail_image) payload.tail_image = await this.resolveImageToBase64(payload.tail_image);

    const patched: BaseTaskJson<Record<string, any>> = { ...task, payload };
    return super.execute(patched, taskPath, ctx);
  }
}

// ============================================================================
// OpsV RunningHub Executor Provider
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';
import { OpsVContext } from '../../container/OpsVContext';

interface RhSubmitResponse {
  id?: string;
  data?: { id?: string; task_id?: string };
  task_id?: string;
}

interface RhStatusResponse {
  status?: string;
  data?: { status?: string; url?: string; video_url?: string; image_url?: string };
  error?: { message?: string };
}

export class RunningHubProvider extends BaseApiProvider<Record<string, unknown>, RhSubmitResponse, RhStatusResponse> {
  readonly name = 'runninghub';

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>, ctx?: OpsVContext): unknown {
    const payload = { ...task.payload };
    if (ctx) {
      const apiKey = ctx.configLoader.getResolvedApiKey(task._opsv.modelKey);
      if (apiKey) {
        (payload as any).apiKey = apiKey;
      }
    }
    return payload;
  }

  protected parseTaskId(res: RhSubmitResponse): string | undefined {
    return res.id || res.data?.id || res.data?.task_id || res.task_id;
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    const base = meta.api_status_url || meta.api_url;
    return `${base}/${taskId}`;
  }

  // RunningHub status endpoint requires POST with { apiKey, taskId } body
  protected async pollStatus(
    client: HttpClient,
    meta: { api_url: string; api_status_url?: string },
    taskId: string,
    timeout: number,
    ctx?: OpsVContext
  ): Promise<RhStatusResponse> {
    const base = meta.api_status_url || meta.api_url;
    const apiKey = ctx ? ctx.configLoader.getResolvedApiKey((meta as any).modelKey || '') : undefined;
    return client.post<RhStatusResponse>(base, { apiKey, taskId }, { timeout });
  }

  protected isComplete(res: RhStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'succeeded' || status === 'completed' || status === 'success';
  }

  protected isFailed(res: RhStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'failed' || status === 'error';
  }

  protected extractError(res: RhStatusResponse): string {
    return res.error?.message || res.data?.status || 'Unknown error';
  }

  protected extractOutputUrls(res: RhStatusResponse): string[] {
    const d = res.data;
    const url = d?.video_url || d?.image_url || d?.url;
    return url ? [url] : [];
  }

  protected getOutputExtension(): string {
    return 'mp4';
  }
}

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

interface RhOutputsItem {
  fileUrl?: string;
  fileType?: string;
}

interface RhStatusResponse {
  code?: number;
  msg?: string;
  data?: string | { netWssUrl?: string } | RhOutputsItem[];
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
    return (res.data as any)?.taskId || res.id || res.data?.id || res.data?.task_id || res.task_id;
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    const base = meta.api_status_url || meta.api_url;
    return `${base}/${taskId}`;
  }

  // RunningHub status endpoint requires POST with { apiKey, taskId } body.
  // We poll the /outputs endpoint (auto-derived from /status url) because it
  // returns the result URLs when complete, while /status only returns a string.
  protected async pollStatus(
    client: HttpClient,
    meta: { api_url: string; api_status_url?: string },
    taskId: string,
    timeout: number,
    ctx?: OpsVContext
  ): Promise<RhStatusResponse> {
    const base = meta.api_status_url || meta.api_url;
    // Auto-switch from /status to /outputs if the config still points at the legacy status URL
    const outputsUrl = base.replace(/\/status$/, '/outputs');
    const apiKey = ctx ? ctx.configLoader.getResolvedApiKey((meta as any).modelKey || '') : undefined;
    return client.post<RhStatusResponse>(outputsUrl, { apiKey, taskId }, { timeout });
  }

  // outputs endpoint: code=0 + data array = success
  protected isComplete(res: RhStatusResponse): boolean {
    return res.code === 0 && Array.isArray(res.data);
  }

  // outputs endpoint: non-zero code that is not "still running" (804)
  protected isFailed(res: RhStatusResponse): boolean {
    return res.code !== undefined && res.code !== 0 && res.code !== 804;
  }

  protected extractError(res: RhStatusResponse): string {
    return res.msg || res.error?.message || 'Unknown error';
  }

  protected extractOutputUrls(res: RhStatusResponse): string[] {
    if (!Array.isArray(res.data)) return [];
    return res.data
      .map((item: any) => item?.fileUrl)
      .filter((u): u is string => !!u);
  }

  protected getOutputExtension(task?: BaseTaskJson<Record<string, unknown>>): string {
    return task?._opsv?.type === 'imagen' ? 'png' : 'mp4';
  }
}

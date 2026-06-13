// ============================================================================
// OpsV RHapi Executor Provider
// RunningHub Standard Model API v2 — async submit + query via /openapi/v2/query
// Covers: imagen (全能图片, GPT Image 2), video (Seedance 2.0, Vidu)
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';
import { OpsVContext } from '../../container/OpsVContext';
import { ProviderResult } from '../QueueRunner';

interface RhApiSubmitResponse {
  taskId?: string;
  code?: number;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface RhApiResult {
  url?: string;
  outputType?: string;
  nodeId?: string;
  text?: string;
}

interface RhApiStatusResponse {
  taskId?: string;
  status?: string;           // "RUNNING" | "SUCCESS" | "FAILED" | "QUEUED"
  errorCode?: string;
  errorMessage?: string;
  failedReason?: object;
  results?: RhApiResult[];
  usage?: {
    consumeMoney?: string | null;
    consumeCoins?: string | null;
    taskCostTime?: string;
    thirdPartyConsumeMoney?: string | null;
  };
}

export class RHapiProvider extends BaseApiProvider<Record<string, unknown>, RhApiSubmitResponse, RhApiStatusResponse> {
  readonly name = 'rhapi';

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>, _ctx?: OpsVContext): unknown {
    // Strip internal metadata from payload before sending
    const { apiKey, ...cleanPayload } = task.payload as Record<string, any>;
    return cleanPayload;
  }

  protected parseTaskId(res: RhApiSubmitResponse): string | undefined {
    return res.taskId;
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, _taskId: string): string {
    // RHapi uses a fixed query endpoint for all models
    return meta.api_status_url || 'https://www.runninghub.cn/openapi/v2/query';
  }

  /**
   * RHapi status query is POST to /openapi/v2/query with {taskId} body.
   * Override the default GET behavior from BaseApiProvider.
   */
  protected async pollStatus(
    client: HttpClient,
    meta: { api_url: string; api_status_url?: string },
    taskId: string,
    timeout: number,
    _ctx?: OpsVContext
  ): Promise<RhApiStatusResponse> {
    const statusUrl = this.buildStatusUrl(meta, taskId);
    return client.post<RhApiStatusResponse>(statusUrl, { taskId }, { timeout });
  }

  // Completion: status === "SUCCESS"
  protected isComplete(res: RhApiStatusResponse): boolean {
    return res.status === 'SUCCESS';
  }

  // Failure: status === "FAILED"
  protected isFailed(res: RhApiStatusResponse): boolean {
    return res.status === 'FAILED';
  }

  protected extractError(res: RhApiStatusResponse): string {
    return res.errorMessage || res.errorCode || 'Unknown error';
  }

  // Extract output URLs from results array
  protected extractOutputUrls(res: RhApiStatusResponse): string[] {
    if (!Array.isArray(res.results)) return [];
    return res.results
      .map((item) => item.url)
      .filter((u): u is string => !!u);
  }

  protected getOutputExtension(task?: BaseTaskJson<Record<string, unknown>>): string {
    return task?._opsv?.type === 'imagen' ? 'png' : 'mp4';
  }
}

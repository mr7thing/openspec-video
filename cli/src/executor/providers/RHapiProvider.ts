// ============================================================================
// OpsV RHapi Executor Provider
// RunningHub Standard Model API v2 — async submit + query via /openapi/v2/query
// Covers: imagen (GPT Image 2, 全能图片 X, Nana Banana V2), video (Seedance 2.0, Vidu)
//
// File reference handling (using BaseApiProvider helpers):
//   1. HTTP/HTTPS URLs → passed through as-is
//   2. Local file paths → auto-uploaded via RH media upload API
//   3. Base64 data URIs → passed through as-is
// ============================================================================

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';
import { OpsVContext } from '../../container/OpsVContext';
import { ProviderResult } from '../QueueRunner';
import { logger } from '../../utils/logger';
import { appendLog } from '../polling';

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

interface RhUploadResponse {
  code: number;
  message: string;
  data?: {
    type: string;
    download_url: string;
    fileName: string;
    size: string;
  };
}

const RH_UPLOAD_URL = 'https://www.runninghub.cn/openapi/v2/media/upload/binary';

export class RHapiProvider extends BaseApiProvider<Record<string, unknown>, RhApiSubmitResponse, RhApiStatusResponse> {
  readonly name = 'rhapi';

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>, _ctx?: OpsVContext): unknown {
    const { apiKey, ...cleanPayload } = task.payload as Record<string, any>;
    return cleanPayload;
  }

  /**
   * Override execute to upload local file references before submission.
   * Delegates file scanning and resolution to BaseApiProvider.resolveLocalFileFields().
   */
  async execute(
    task: BaseTaskJson<Record<string, unknown>>,
    taskPath: string,
    ctx: OpsVContext
  ): Promise<ProviderResult> {
    const payload = { ...task.payload } as Record<string, any>;
    const apiKey = ctx.configLoader.getResolvedApiKey(task._opsv.modelKey);

    if (apiKey) {
      try {
        await this.resolveLocalFileFields(payload, (fp) => this.uploadFile(fp, apiKey));
      } catch (err: any) {
        // Ensure .log is written even when upload fails before super.execute(),
        // otherwise the .log stays stale and getResumeTaskId() returns wrong state.
        appendLog(taskPath, { event: 'failed', task_id: 'unknown', error: err.message });
        return {
          taskPath,
          shotId: task._opsv.shotId,
          provider: this.name,
          success: false,
          error: `File upload failed: ${err.message}`,
        };
      }
    }

    const patched: BaseTaskJson<Record<string, unknown>> = { ...task, payload };
    return super.execute(patched, taskPath, ctx);
  }

  /**
   * Upload a local file to RunningHub's media API.
   * POST multipart/form-data to /openapi/v2/media/upload/binary
   */
  private async uploadFile(filePath: string, apiKey: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      logger.warn(`[rhapi] Local file not found, sending as-is: ${filePath}`);
      throw new Error(`File not found: ${filePath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await axios.post<RhUploadResponse>(RH_UPLOAD_URL, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 300000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });

    if (res.data.code !== 0 || !res.data.data?.download_url) {
      throw new Error(`RH upload failed: code=${res.data.code} msg=${res.data.message}`);
    }

    return res.data.data.download_url;
  }

  protected parseTaskId(res: RhApiSubmitResponse): string | undefined {
    return res.taskId;
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, _taskId: string): string {
    return meta.api_status_url || 'https://www.runninghub.cn/openapi/v2/query';
  }

  /**
   * RHapi status query is POST to /openapi/v2/query with {taskId} body.
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

  protected isComplete(res: RhApiStatusResponse): boolean {
    return res.status === 'SUCCESS';
  }

  protected isFailed(res: RhApiStatusResponse): boolean {
    return res.status === 'FAILED';
  }

  protected extractError(res: RhApiStatusResponse): string {
    return res.errorMessage || res.errorCode || 'Unknown error';
  }

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

// ============================================================================
// OpsV RunningHub Executor Provider
// Supports:
//   - upload_method: "base64" → encodes local images to base64 data URIs
//   - timeline_data auto-upload → uploads local imageFile paths to RH media API
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

  async execute(
    task: BaseTaskJson<Record<string, unknown>>,
    taskPath: string,
    ctx: OpsVContext
  ): Promise<ProviderResult> {
    const payload = { ...task.payload } as Record<string, any>;
    const apiKey = ctx ? ctx.configLoader.getResolvedApiKey(task._opsv.modelKey) : undefined;

    // Auto-upload local image paths embedded in nodeInfoList string fields.
    // Handles: timeline_data (JSON with segments[].imageFile), or any field
    // whose string value is JSON containing file paths. Non-JSON direct paths
    // are handled by the upload_method: "base64" branch below.
    if (apiKey && Array.isArray(payload.nodeInfoList)) {
      payload.nodeInfoList = await Promise.all(
        payload.nodeInfoList.map(async (item: any) => {
          if (typeof item.fieldValue !== 'string') return item;

          // Try parsing as JSON — may contain embedded file paths
          let parsed: any;
          try {
            parsed = JSON.parse(item.fieldValue);
          } catch {
            return item; // plain string, not JSON — skip
          }
          if (typeof parsed !== 'object' || parsed === null) return item;

          // Recursively scan for local file paths, upload them
          const changed = await this.resolveLocalPaths(parsed, apiKey, taskPath, task._opsv?.shotId);
          if (changed) {
            return { ...item, fieldValue: JSON.stringify(parsed) };
          }
          return item;
        })
      );
    }

    // Support upload_method: "base64" — legacy base64 encoding for flat nodeInfoList fields
    if (payload.upload_method === 'base64' && Array.isArray(payload.nodeInfoList)) {
      payload.nodeInfoList = await Promise.all(
        payload.nodeInfoList.map(async (item: any) => {
          if (item.fieldValue && typeof item.fieldValue === 'string') {
            return { ...item, fieldValue: await this.resolveImageToBase64(item.fieldValue) };
          }
          return item;
        })
      );
    }

    const patched: BaseTaskJson<Record<string, unknown>> = { ...task, payload };
    return super.execute(patched, taskPath, ctx);
  }

  /**
   * Recursively walk a parsed JSON object and upload any local file paths found.
   * Handles nested structures like timeline_data.segments[].imageFile.
   * Returns true if any path was uploaded.
   */
  private async resolveLocalPaths(obj: any, apiKey: string, taskPath: string, shotId?: string): Promise<boolean> {
    let changed = false;

    async function walk(this: RunningHubProvider, val: any): Promise<any> {
      if (typeof val === 'string') {
        // Check if it looks like a local file path (not already uploaded or URL)
        if (val.startsWith('openapi/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:')) {
          return val;
        }
        if (fs.existsSync(val)) {
          const fileName = await this.uploadFile(val, apiKey);
          appendLog(taskPath, { event: 'upload', task_id: shotId, file: val, fileName });
          changed = true;
          return fileName;
        }
        return val;
      }
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          val[i] = await walk.call(this, val[i]);
        }
        return val;
      }
      if (val && typeof val === 'object') {
        for (const key of Object.keys(val)) {
          val[key] = await walk.call(this, val[key]);
        }
        return val;
      }
      return val;
    }

    await walk.call(this, obj);
    return changed;
  }

  /**
   * Upload a local file to RunningHub's media API.
   * POST multipart/form-data to /openapi/v2/media/upload/binary
   * Returns the fileName for use in timeline_data or nodeInfoList.
   */
  private async uploadFile(filePath: string, apiKey: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      logger.warn(`[runninghub] Local file not found, sending as-is: ${filePath}`);
      throw new Error(`File not found: ${filePath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await axios.post<{ code: number; data?: { fileName: string; download_url?: string } }>(
      'https://www.runninghub.cn/openapi/v2/media/upload/binary',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 300000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      }
    );

    if (res.data.code !== 0 || !res.data.data?.fileName) {
      throw new Error(`RH upload failed: code=${res.data.code}`);
    }

    const { fileName, download_url } = res.data.data;
    logger.info(`[runninghub] Uploaded ${path.basename(filePath)} → fileName=${fileName}`);
    return fileName;
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

// ============================================================================
// OpsV RhWorkflow Executor Provider
// RunningHub Workflow Run API — 同步/异步双模式
// POST https://api.runninghub.cn/run/workflow/{apiId}
//
// 两种上传模式:
//   - upload_method=base64  (或 run --base64): 本地文件 → data URI
//   - upload_method=rh_upload (默认): 本地文件 → RH media API → URL
//
// 两种响应模式:
//   - 同步: 响应直接包含 results[].url
//   - 异步: 响应包含 taskId, 通过 /openapi/v2/query 轮询
// ============================================================================

import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';
import { OpsVContext } from '../../container/OpsVContext';
import { logger } from '../../utils/logger';
import { appendLog } from '../polling';

interface RhWorkflowSubmitResponse {
  taskId?: string;
  status?: string;          // "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"
  errorCode?: string;
  errorMessage?: string;
  results?: Array<{
    url?: string;
    nodeId?: string;
    outputType?: string;
    text?: string | null;
  }>;
}

interface RhWorkflowStatusResponse {
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  failedReason?: object;
  results?: Array<{ url?: string; outputType?: string }>;
}

export class RhWorkflowProvider extends BaseApiProvider<Record<string, unknown>, RhWorkflowSubmitResponse, RhWorkflowStatusResponse> {
  readonly name = 'rhworkflow-v2';

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>, _ctx?: OpsVContext): unknown {
    const { apiKey, ...cleanPayload } = task.payload as Record<string, any>;
    return cleanPayload;
  }

  async execute(
    task: BaseTaskJson<Record<string, unknown>>,
    taskPath: string,
    ctx: OpsVContext
  ): Promise<import('../QueueRunner').ProviderResult> {
    const payload = { ...task.payload } as Record<string, any>;
    const apiKey = ctx.configLoader.getResolvedApiKey(task._opsv.modelKey);

    if (apiKey) {
      // Determine upload mode
      const useBase64 = payload.upload_method === 'base64';

      // Check if workflow mode
      if (payload._workflow_mode === 'workflow' && payload._workflow_json) {
        // Workflow mode: process the workflow JSON directly
        const workflowJson = { ...payload._workflow_json };

        // Scan workflow for media files and upload them
        const mediaExtensions = [
          '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff',
          '.mp4', '.mov', '.webm', '.avi', '.mkv',
          '.mp3', '.wav', '.m4a', '.flac', '.ogg',
        ];

        const uploadFn = useBase64
          ? async (fp: string) => (await this.resolveImageToBase64(fp)) || fp
          : async (fp: string) => {
              try {
                const url = await this.uploadFile(fp, apiKey);
                appendLog(taskPath, { event: 'upload', task_id: task._opsv.shotId, file: fp });
                return url;
              } catch (err: any) {
                logger.warn(`[rhworkflow] Upload failed for ${fp}: ${err.message}`);
                return fp;
              }
            };

        // Deep scan and resolve media files in workflow JSON
        const extSet = new Set(mediaExtensions.map(e => e.toLowerCase()));
        const resolved = await this.deepResolveWorkflowMedia(workflowJson, uploadFn, extSet);

        // Update payload with resolved workflow
        payload.workflow = JSON.stringify(resolved);
        delete payload._workflow_json;
      } else {
        // NodeInfoList mode: process nodeInfoList
        if (Array.isArray(payload.nodeInfoList)) {
          payload.nodeInfoList = await Promise.all(
            payload.nodeInfoList.map(async (item: any) => {
              if (typeof item.fieldValue !== 'string') return item;

              // HTTP/HTTPS/data URLs: pass through
              if (item.fieldValue.startsWith('http://') ||
                  item.fieldValue.startsWith('https://') ||
                  item.fieldValue.startsWith('data:')) {
                return item;
              }

              // Local file path: resolve by upload mode
              if (fs.existsSync(item.fieldValue)) {
                if (useBase64) {
                  const b64 = await this.resolveImageToBase64(item.fieldValue);
                  if (b64) {
                    appendLog(taskPath, { event: 'upload', task_id: task._opsv.shotId, file: item.fieldValue });
                    return { ...item, fieldValue: b64 };
                  }
                } else {
                  try {
                    const uploadedUrl = await this.uploadFile(item.fieldValue, apiKey);
                    appendLog(taskPath, { event: 'upload', task_id: task._opsv.shotId, file: item.fieldValue });
                    return { ...item, fieldValue: uploadedUrl };
                  } catch (err: any) {
                    logger.warn(`[rhworkflow] Upload failed for ${item.fieldValue}, sending raw: ${err.message}`);
                  }
                }
              }
              return item;
            })
          );
        }

        // Scan entire payload for media files
        const mediaExtensions = [
          '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff',
          '.mp4', '.mov', '.webm', '.avi', '.mkv',
          '.mp3', '.wav', '.m4a', '.flac', '.ogg',
        ];

        const uploadFn = useBase64
          ? async (fp: string) => (await this.resolveImageToBase64(fp)) || fp
          : async (fp: string) => {
              try {
                const url = await this.uploadFile(fp, apiKey);
                appendLog(taskPath, { event: 'upload', task_id: task._opsv.shotId, file: fp });
                return url;
              } catch (err: any) {
                logger.warn(`[rhworkflow] Upload failed for ${fp}: ${err.message}`);
                return fp;
              }
            };

        await this.resolveAllMediaFiles(payload, uploadFn, mediaExtensions);
      }
    }

    // Store resolved payload for base class execute()
    (payload as any)._apiKey = apiKey;
    const patched: BaseTaskJson<Record<string, unknown>> = { ...task, payload };
    return super.execute(patched, taskPath, ctx);
  }

  protected parseTaskId(res: RhWorkflowSubmitResponse): string | undefined {
    return res.taskId;
  }

  protected extractSyncOutputUrls(res: RhWorkflowSubmitResponse): string[] {
    if (res.status === 'SUCCESS' && Array.isArray(res.results) && res.results.length > 0) {
      const urls = res.results
        .map((r) => r.url)
        .filter((u): u is string => !!u);
      if (urls.length > 0) return urls;
    }
    return [];
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, _taskId: string): string {
    return meta.api_status_url || 'https://www.runninghub.cn/openapi/v2/query';
  }

  protected async pollStatus(
    client: HttpClient,
    meta: { api_url: string; api_status_url?: string },
    taskId: string,
    timeout: number,
    _ctx?: OpsVContext
  ): Promise<RhWorkflowStatusResponse> {
    const statusUrl = this.buildStatusUrl(meta, taskId);
    return client.post<RhWorkflowStatusResponse>(statusUrl, { taskId }, { timeout });
  }

  protected isComplete(res: RhWorkflowStatusResponse): boolean {
    return res.status === 'SUCCESS';
  }

  protected isFailed(res: RhWorkflowStatusResponse): boolean {
    return res.status === 'FAILED';
  }

  protected extractError(res: RhWorkflowStatusResponse): string {
    return res.errorMessage || res.errorCode || 'Unknown error';
  }

  protected extractOutputUrls(res: RhWorkflowStatusResponse): string[] {
    if (!Array.isArray(res.results)) return [];
    return res.results
      .map((item) => item.url)
      .filter((u): u is string => !!u);
  }

  protected getOutputExtension(task?: BaseTaskJson<Record<string, unknown>>): string {
    return task?._opsv?.type === 'video' ? 'mp4' : 'png';
  }

  /**
   * Upload a local file to RunningHub's media API.
   * POST multipart/form-data to /openapi/v2/media/upload/binary
   * Returns the fileName for use in ComfyUI nodes (not the download_url).
   * fileName is the path in ComfyUI's input directory (e.g., "openapi/xxx.png").
   */
  private async uploadFile(filePath: string, apiKey: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await axios.post<{ code: number; data?: { download_url: string; fileName: string } }>(
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

    // Return fileName (path in ComfyUI input directory), not download_url
    // This is what ComfyUI nodes expect for file references
    logger.info(`[rhworkflow] Uploaded ${filePath} → ${res.data.data.fileName}`);
    return res.data.data.fileName;
  }

  /**
   * Recursively scan workflow JSON for media files and upload them.
   * Handles ComfyUI workflow structure with nodes.inputs pattern.
   */
  private async deepResolveWorkflowMedia(
    obj: any,
    uploadFn: (filePath: string) => Promise<string>,
    extSet: Set<string>
  ): Promise<any> {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      // Skip URLs
      if (obj.startsWith('http://') || obj.startsWith('https://') || obj.startsWith('data:')) {
        return obj;
      }

      // Check if it matches a known media extension
      const lowerObj = obj.toLowerCase();
      const isMediaFile = [...extSet].some(ext => lowerObj.endsWith(ext));

      // Also check if it's an existing local file
      const isLocalFile = !isMediaFile && (
        obj.startsWith('/') || obj.startsWith('./') || obj.startsWith('../')
      ) && fs.existsSync(obj);

      if (isMediaFile || isLocalFile) {
        try {
          return await uploadFn(obj);
        } catch {
          return obj;
        }
      }

      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this.deepResolveWorkflowMedia(item, uploadFn, extSet)));
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = await this.deepResolveWorkflowMedia(value, uploadFn, extSet);
      }
      return result;
    }

    return obj;
  }
}

// ============================================================================
// OpsV MiniMax Executor Provider
// Handles: img01 (imagen, sync base64), vid01 (video, async with file_id resolution)
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';
import { HttpClient } from '../HttpClient';

interface MxSubmitResponse {
  // Common
  id?: string;
  task_id?: string;
  base_resp?: { status_code?: number; status_msg?: string };
  metadata?: { failed_count?: string | number; success_count?: string | number };
  // Sync image-01 response: data.image_urls is the primary path
  data?: {
    image_urls?: string[];
    image_base64?: string | string[];
    image_url?: string | string[];
  };
}

interface MxStatusResponse {
  status?: string;
  file_id?: string;
  // Populated by our pollStatus after resolving file_id
  _resolved_download_url?: string;
  base_resp?: { status_code?: number; status_msg?: string };
}

export class MinimaxProvider extends BaseApiProvider<Record<string, any>, MxSubmitResponse, MxStatusResponse> {
  readonly name = 'minimax';

  protected buildPayload(task: BaseTaskJson<Record<string, any>>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: MxSubmitResponse): string | undefined {
    return res.task_id || res.id;
  }

  protected extractSubmitError(res: MxSubmitResponse): string | undefined {
    const code = res.base_resp?.status_code;
    if (code && code !== 0) {
      return `MiniMax error ${code}: ${res.base_resp?.status_msg || 'unknown'}`;
    }
    // image-01: even with status_code=0, metadata.failed_count >= 1 means the
    // image was silently rejected (typically by content moderation).
    const failed = Number(res.metadata?.failed_count || 0);
    const succeeded = Number(res.metadata?.success_count || 0);
    if (failed > 0 && succeeded === 0) {
      const hasOutput = !!(res.data?.image_urls?.length || res.data?.image_base64);
      if (!hasOutput) {
        return `MiniMax produced no image (failed_count=${failed}, success_count=${succeeded}) — likely content moderation. Try rewording the prompt to avoid sensitive terms (e.g. blood, weapon, minor + danger).`;
      }
    }
    return undefined;
  }

  protected extractSyncOutputBuffers(res: MxSubmitResponse): Buffer[] {
    const b64 = res.data?.image_base64;
    if (!b64) return [];
    const arr = Array.isArray(b64) ? b64 : [b64];
    return arr.filter((s): s is string => !!s).map((s) => Buffer.from(s, 'base64'));
  }

  protected extractSyncOutputUrls(res: MxSubmitResponse): string[] {
    // image-01 returns data.image_urls (array of presigned OSS URLs)
    if (Array.isArray(res.data?.image_urls) && res.data.image_urls.length > 0) {
      return res.data.image_urls.filter((u): u is string => !!u);
    }
    // Fallback: some endpoints may use singular image_url (string or array)
    const u = res.data?.image_url;
    if (!u) return [];
    return Array.isArray(u) ? u.filter((x): x is string => !!x) : [u];
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    const base = meta.api_status_url || meta.api_url;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}task_id=${encodeURIComponent(taskId)}`;
  }

  protected async pollStatus(client: HttpClient, meta: { api_url: string; api_status_url?: string }, taskId: string, timeout: number): Promise<MxStatusResponse> {
    const res = await super.pollStatus(client, meta, taskId, timeout);
    // When status=Success, fetch download URL via files API
    if (res.status === 'Success' && res.file_id) {
      try {
        const fileRes = await client.get<{ file?: { download_url?: string }; download_url?: string }>(
          `https://api.minimaxi.com/v1/files/${res.file_id}`,
          { timeout }
        );
        res._resolved_download_url = fileRes.file?.download_url || fileRes.download_url || undefined;
      } catch (err: any) {
        // Surface as task failure on next isFailed check
        (res as any).status = 'Failed';
        (res as any).base_resp = { status_code: -1, status_msg: `file download URL fetch failed: ${err.message}` };
      }
    }
    return res;
  }

  protected isComplete(res: MxStatusResponse): boolean {
    return res.status === 'Success' || res.status === 'succeeded' || res.status === 'completed';
  }

  protected isFailed(res: MxStatusResponse): boolean {
    return res.status === 'Failed' || res.status === 'Fail' || res.status === 'failed';
  }

  protected extractError(res: MxStatusResponse): string {
    return res.base_resp?.status_msg || res.status || 'Unknown error';
  }

  protected extractOutputUrls(res: MxStatusResponse): string[] {
    return res._resolved_download_url ? [res._resolved_download_url] : [];
  }

  protected getOutputExtension(task?: BaseTaskJson<Record<string, any>>): string {
    return task?._opsv?.type === 'imagen' ? 'png' : 'mp4';
  }
}

// ============================================================================
// OpsV MiniMax Executor Provider
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';

interface MxSubmitResponse {
  id?: string;
  data?: { id?: string; task_id?: string };
  task_id?: string;
}

interface MxStatusResponse {
  status?: string;
  data?: { status?: string; file_id?: string; url?: string; video_url?: string };
  error?: { message?: string };
}

export class MinimaxProvider extends BaseApiProvider<Record<string, unknown>, MxSubmitResponse, MxStatusResponse> {
  readonly name = 'minimax';

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: MxSubmitResponse): string | undefined {
    return res.id || res.data?.id || res.data?.task_id || res.task_id;
  }

  protected buildStatusUrl(apiUrl: string, taskId: string): string {
    return `${apiUrl}/${taskId}`;
  }

  protected isComplete(res: MxStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'succeeded' || status === 'completed' || status === 'success';
  }

  protected isFailed(res: MxStatusResponse): boolean {
    const status = res.status || res.data?.status;
    return status === 'failed' || status === 'error';
  }

  protected extractError(res: MxStatusResponse): string {
    return res.error?.message || res.data?.status || 'Unknown error';
  }

  protected extractOutputUrls(res: MxStatusResponse): string[] {
    const d = res.data;
    const url = d?.video_url || d?.url || d?.file_id;
    return url ? [url] : [];
  }

  protected getOutputExtension(): string {
    return 'mp4';
  }
}

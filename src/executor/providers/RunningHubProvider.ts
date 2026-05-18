// ============================================================================
// OpsV RunningHub Executor Provider
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { BaseApiProvider } from './BaseApiProvider';

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

  protected buildPayload(task: BaseTaskJson<Record<string, unknown>>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: RhSubmitResponse): string | undefined {
    return res.id || res.data?.id || res.data?.task_id || res.task_id;
  }

  protected buildStatusUrl(apiUrl: string, taskId: string): string {
    return `${apiUrl}/${taskId}`;
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

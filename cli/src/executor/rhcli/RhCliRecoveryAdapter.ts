import path from 'path';
import { HttpClient } from '../HttpClient';
import { RhCliError } from '../rh-runner/index';
import { downloadFile } from '../../utils/download';

export type RhRecoveryState = 'pending' | 'completed' | 'failed';

export interface RhRecoveryStatus {
  state: RhRecoveryState;
  taskId: string;
  resultUrls: string[];
  error?: string;
  cost?: string;
  duration?: number;
}

export interface RhCliRecoveryAdapter {
  query(input: { taskId: string; apiKey: string; timeoutMs?: number }): Promise<RhRecoveryStatus>;
  download(input: { resultUrls: readonly string[]; outputDir: string; timeoutMs?: number }): Promise<string[]>;
}

interface RhStatusResponse {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  results?: Array<{ url?: string }>;
  usage?: { consumeMoney?: string | null; taskCostTime?: string };
}

/**
 * Read-only recovery seam. It deliberately has no submit/upload/payload API:
 * normal generation remains `opsv -> rh CLI -> RunningHub`.
 */
export class RunningHubReadOnlyRecoveryAdapter implements RhCliRecoveryAdapter {
  constructor(private readonly statusUrl = 'https://www.runninghub.cn/openapi/v2/query') {}

  async query(input: { taskId: string; apiKey: string; timeoutMs?: number }): Promise<RhRecoveryStatus> {
    const client = new HttpClient({ apiKey: input.apiKey, timeout: input.timeoutMs ?? 30_000, maxRetries: 1 });
    const response = await client.post<RhStatusResponse>(this.statusUrl, { taskId: input.taskId });
    const status = response.status?.toUpperCase();
    const resultUrls = (response.results || []).map((result) => result.url).filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url));
    if (status === 'SUCCESS') {
      return { state: 'completed', taskId: input.taskId, resultUrls, cost: response.usage?.consumeMoney || undefined,
        duration: numericDuration(response.usage?.taskCostTime) };
    }
    if (status === 'FAILED') {
      return { state: 'failed', taskId: input.taskId, resultUrls: [], error: response.errorMessage || response.errorCode || 'RunningHub task failed.' };
    }
    return { state: 'pending', taskId: input.taskId, resultUrls: [] };
  }

  async download(input: { resultUrls: readonly string[]; outputDir: string; timeoutMs?: number }): Promise<string[]> {
    if (input.resultUrls.length === 0) throw new RhCliError('output-missing', 'RunningHub recovery reported SUCCESS but no downloadable result URLs.');
    const outputs: string[] = [];
    for (let i = 0; i < input.resultUrls.length; i++) {
      const ext = extensionFromUrl(input.resultUrls[i]);
      outputs.push(await downloadFile(input.resultUrls[i], path.join(input.outputDir, `recovered_${i + 1}.${ext}`), { timeout: input.timeoutMs }));
    }
    return outputs;
  }
}

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase();
    return ext || 'bin';
  } catch { return 'bin'; }
}
function numericDuration(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

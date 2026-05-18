// ============================================================================
// OpsV ComfyUI Local Executor Provider
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { BaseApiProvider } from './BaseApiProvider';
import { OpsVContext } from '../../container/OpsVContext';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import { appendLog, getResumeTaskId, getElapsedMs, getPollIntervalMs, sleep } from '../polling';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

interface ComfyPayload extends Record<string, unknown> {
  _opsv_workflow?: unknown;
}

interface ComfySubmitResponse {
  prompt_id?: string;
}

interface ComfyStatusEntry {
  status?: { status_str?: string; messages?: any[][] };
  outputs?: Record<string, Record<string, Array<{ filename: string; subfolder?: string; type?: string }>>>;
}

interface ComfyStatusResponse {
  [promptId: string]: ComfyStatusEntry;
}

export class ComfyLocalProvider extends BaseApiProvider<ComfyPayload, ComfySubmitResponse, ComfyStatusResponse> {
  readonly name = 'comfylocal';

  protected buildPayload(task: BaseTaskJson<ComfyPayload>): unknown {
    const payload = { ...task.payload };
    delete (payload as any)._opsv_workflow;
    this.resolveRandomInWorkflow(payload);
    return payload;
  }

  protected parseTaskId(res: ComfySubmitResponse): string | undefined {
    return res.prompt_id;
  }

  protected buildStatusUrl(apiUrl: string, taskId: string): string {
    const base = apiUrl.replace(/\/$/, '');
    return `${base}/history/${taskId}`;
  }

  protected isComplete(res: ComfyStatusResponse): boolean {
    const entry = Object.values(res)[0];
    return !!entry?.outputs;
  }

  protected isFailed(res: ComfyStatusResponse): boolean {
    const entry = Object.values(res)[0];
    return entry?.status?.status_str === 'error';
  }

  protected extractError(res: ComfyStatusResponse): string {
    const entry = Object.values(res)[0];
    return entry?.status?.messages?.map((m: any) => m?.[1]).join('; ') || 'ComfyUI execution error';
  }

  protected extractOutputUrls(res: ComfyStatusResponse): string[] {
    return []; // ComfyLocal uses custom download logic
  }

  protected getOutputExtension(): string {
    return 'png';
  }

  async execute(task: BaseTaskJson<ComfyPayload>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;
    const modelConfig = this.getModelConfig(ctx, meta.modelKey);
    const maxDuration = modelConfig?.max_poll_duration || 4 * 60 * 60 * 1000;
    let apiUrl = meta.api_url || '';
    apiUrl = apiUrl.replace(/\/$/, '');

    let promptId: string | null = getResumeTaskId(taskPath);
    const client = this.buildHttpClient(ctx, meta.modelKey);

    try {
      if (!promptId) {
        const payload = this.buildPayload(task);
        const res = await client.post<ComfySubmitResponse>(`${apiUrl}/prompt`, { prompt: payload }, {
          timeout: modelConfig?.timeout?.submit || 30000,
        });
        promptId = this.parseTaskId(res) || null;
        if (!promptId) {
          throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `No prompt_id in response: ${JSON.stringify(res)}`);
        }
        appendLog(taskPath, { event: 'submitted', task_id: promptId });
        logger.info(`[ComfyUI] Submitted ${shotId}, promptId=${promptId}`);
      } else {
        logger.info(`[ComfyUI] Resuming ${shotId}, promptId=${promptId}`);
      }

      while (true) {
        const elapsed = getElapsedMs(taskPath);
        if (elapsed > maxDuration) {
          throw new ExecutionError(OpsVErrorCode.EXECUTION_TIMEOUT, `Polling timeout for ${promptId}`);
        }

        const interval = getPollIntervalMs(elapsed, ctx.configLoader.getSettings()?.polling?.intervals);
        await sleep(interval);

        const statusRes = await client.get<ComfyStatusResponse>(`${apiUrl}/history/${promptId}`, {
          timeout: modelConfig?.timeout?.status || 30000,
        });

        if (this.isFailed(statusRes)) {
          const reason = this.extractError(statusRes);
          appendLog(taskPath, { event: 'failed', task_id: promptId, error: reason });
          throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `ComfyUI execution failed: ${reason}`);
        }

        const entry = Object.values(statusRes)[0];
        const outputs = entry?.outputs;
        if (outputs) {
          const outputPaths: string[] = [];
          const extIndices: Record<string, number> = {};

          for (const nodeId in outputs) {
            const nodeOutput = outputs[nodeId];
            if (!nodeOutput || typeof nodeOutput !== 'object') continue;

            for (const mediaKey of Object.keys(nodeOutput)) {
              const mediaList = nodeOutput[mediaKey];
              if (!Array.isArray(mediaList)) continue;

              for (const media of mediaList) {
                if (!media?.filename) continue;
                const fileUrl = `${apiUrl}/view?filename=${encodeURIComponent(media.filename)}&subfolder=${encodeURIComponent(media.subfolder || '')}&type=${encodeURIComponent(media.type || 'output')}`;
                const extMatch = media.filename.match(/\.([^.]+)$/);
                const ext = extMatch ? extMatch[1] : 'png';
                if (!(ext in extIndices)) {
                  extIndices[ext] = resolveNextOutputIndex(taskPath, ext);
                }
                const outputPath = outputFilePath(taskPath, extIndices[ext]++, ext);
                await downloadFile(fileUrl, outputPath);
                outputPaths.push(outputPath);
              }
            }
          }

          if (outputPaths.length > 0) {
            appendLog(taskPath, { event: 'succeeded', task_id: promptId, output: outputPaths.join(', ') });
            return { taskPath, shotId, provider: this.name, success: true, outputPath: outputPaths[0], outputPaths };
          }
          throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, 'ComfyUI completed but no output files found');
        }

        appendLog(taskPath, { event: 'polling', status: 'waiting', task_id: promptId });
      }
    } catch (err: any) {
      appendLog(taskPath, { event: 'failed', task_id: promptId || 'unknown', error: err.message });
      return { taskPath, shotId, provider: this.name, success: false, error: err.message };
    }
  }

  private resolveRandomInWorkflow(workflow: Record<string, any>): void {
    const { generateRandomSeed } = require('../../utils/randomSeed');
    for (const nodeId in workflow) {
      if (nodeId === '_opsv_workflow') continue;
      const node = workflow[nodeId];
      if (!node || typeof node !== 'object') continue;
      if (node.inputs && typeof node.inputs === 'object') {
        for (const inputKey of Object.keys(node.inputs)) {
          if (node.inputs[inputKey] === 'random') {
            node.inputs[inputKey] = generateRandomSeed();
            logger.info(`[ComfyUI] Resolved random seed for node ${nodeId}.${inputKey}`);
          }
        }
      }
    }
  }
}

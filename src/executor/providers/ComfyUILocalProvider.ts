// ============================================================================
// OpsV v0.8 ComfyUI Local Executor Provider
// ============================================================================

import axios from 'axios';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import { generateRandomSeed } from '../../utils/randomSeed';
import {
  appendLog,
  getResumeTaskId,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
} from '../polling';

export class ComfyUILocalProvider {
  name = 'comfyuilocal';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    let apiUrl = task._opsv.api_url;
    if (!apiUrl) throw new Error('ComfyUILocalProvider: api_url is required in task._opsv');
    // Normalize: strip trailing slash to avoid double slashes in URL construction
    apiUrl = apiUrl.replace(/\/$/, '');
    const shotId = task._opsv.shotId;

    let promptId = getResumeTaskId(taskPath);

    try {
      if (!promptId) {
        const payload = { ...task };
        delete (payload as any)._opsv;

        // Resolve 'random' placeholders in workflow node inputs
        this.resolveRandomInWorkflow(payload);

        const response = await axios.post(`${apiUrl}/prompt`, { prompt: payload }, {
          timeout: 30000,
        });

        promptId = response.data?.prompt_id;
        if (!promptId) {
          throw new Error(`No prompt_id in response: ${JSON.stringify(response.data)}`);
        }

        appendLog(taskPath, { event: 'submitted', task_id: promptId });
        logger.info(`[ComfyUI] Submitted ${shotId}, promptId=${promptId}`);
      } else {
        logger.info(`[ComfyUI] Resuming ${shotId}, promptId=${promptId}`);
      }

      // Gradient polling
      const maxDuration = 4 * 60 * 60 * 1000;
      while (true) {
        const elapsed = getElapsedMs(taskPath);
        if (elapsed > maxDuration) {
          throw new Error(`Polling timeout for promptId=${promptId} (4h exceeded)`);
        }

        const interval = getPollIntervalMs(elapsed);
        await sleep(interval);

        const statusRes = await this.withRetry(
          () => axios.get(`${apiUrl}/history/${promptId}`, { timeout: 30000 }),
          `history query for ${promptId}`
        );

        const entry = statusRes.data?.[promptId];

        // Check for ComfyUI execution errors
        const statusStr = entry?.status?.status_str;
        if (statusStr === 'error') {
          const errorInfo = entry?.status?.messages?.map((m: any) => m?.[1]).join('; ') || 'ComfyUI execution error';
          appendLog(taskPath, { event: 'failed', task_id: promptId, error: errorInfo });
          throw new Error(`ComfyUI execution failed: ${errorInfo}`);
        }

        const outputs = entry?.outputs;
        if (outputs) {
          const outputPaths: string[] = [];
          const extIndices: Record<string, number> = {};

          for (const nodeId in outputs) {
            const nodeOutput = outputs[nodeId];
            if (!nodeOutput || typeof nodeOutput !== 'object') continue;

            // ComfyUI history outputs may contain images, gifs, audio, videos, etc.
            // Each media type is an array of { filename, subfolder, type } objects.
            for (const mediaKey of Object.keys(nodeOutput)) {
              const mediaList = nodeOutput[mediaKey];
              if (!Array.isArray(mediaList)) continue;

              for (const media of mediaList) {
                if (!media || !media.filename) continue;
                const fileUrl = `${apiUrl}/view?filename=${encodeURIComponent(media.filename)}&subfolder=${encodeURIComponent(media.subfolder || '')}&type=${encodeURIComponent(media.type || 'output')}`;

                // Use the original file extension from ComfyUI output
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
            return {
              taskPath,
              shotId,
              provider: task._opsv.provider || 'comfyui',
              success: true,
              outputPath: outputPaths[0],
              outputPaths,
            };
          }

          // outputs exists but no valid files — likely a node error or empty workflow
          throw new Error('ComfyUI completed but no output files found in history');
        }

        appendLog(taskPath, { event: 'polling', status: statusStr || 'waiting', task_id: promptId });
      }
    } catch (err: any) {
      appendLog(taskPath, { event: 'failed', task_id: promptId || 'unknown', error: err.message });
      return {
        taskPath,
        shotId,
        provider: task._opsv.provider || 'comfyui',
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Retry an async operation with exponential backoff.
   */
  private async withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 30000);
          logger.warn(`[ComfyUI] ${label} failed (attempt ${i + 1}/${maxRetries}): ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  /**
   * Recursively resolve 'random' placeholders in workflow node inputs.
   * Only touches node.inputs fields to avoid mutating prompt text.
   */
  private resolveRandomInWorkflow(workflow: Record<string, any>): void {
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

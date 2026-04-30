// ============================================================================
// OpsV v0.8 ComfyUI Local Executor Provider
// ============================================================================

import axios from 'axios';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath } from '../naming';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import {
  appendLog,
  getResumeTaskId,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
} from '../polling';

export class ComfyUILocalProvider {
  name = 'comfyui';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const apiUrl = task._opsv.api_url;
    if (!apiUrl) throw new Error('ComfyUILocalProvider: api_url is required in task._opsv');
    const shotId = task._opsv.shotId;

    try {
      let promptId = getResumeTaskId(taskPath);

      if (!promptId) {
        const payload = { ...task };
        delete (payload as any)._opsv;

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

        const statusRes = await axios.get(`${apiUrl}/history/${promptId}`, {
          timeout: 10000,
        });

        const outputs = statusRes.data?.[promptId]?.outputs;
        if (outputs) {
          for (const nodeId in outputs) {
            const images = outputs[nodeId]?.images;
            if (images && images.length > 0) {
              const img = images[0];
              const imageUrl = `${apiUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;

              const ext = task._opsv.type === 'video' ? 'mp4' : 'png';
              const outputPath = outputFilePath(taskPath, 1, ext);
              await downloadFile(imageUrl, outputPath);

              appendLog(taskPath, { event: 'succeeded', task_id: promptId });
              return { taskPath, shotId, provider: 'comfyui', success: true, outputPath };
            }
          }
        }

        appendLog(taskPath, { event: 'polling', status: 'waiting', task_id: promptId });
      }
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: 'comfyui',
        success: false,
        error: err.message,
      };
    }
  }
}

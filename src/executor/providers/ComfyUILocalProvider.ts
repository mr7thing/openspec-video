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
  name = 'comfyuilocal';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    let apiUrl = task._opsv.api_url;
    if (!apiUrl) throw new Error('ComfyUILocalProvider: api_url is required in task._opsv');
    // Normalize: strip trailing slash to avoid double slashes in URL construction
    apiUrl = apiUrl.replace(/\/$/, '');
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
          const outputPaths: string[] = [];

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

                const outputPath = outputFilePath(taskPath, outputPaths.length + 1, ext);
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
        }

        appendLog(taskPath, { event: 'polling', status: 'waiting', task_id: promptId });
      }
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: task._opsv.provider || 'comfyui',
        success: false,
        error: err.message,
      };
    }
  }
}

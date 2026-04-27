// ============================================================================
// OpsV v0.8 ComfyUI Local Executor Provider
// ============================================================================

import axios from 'axios';
import path from 'path';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';

export class ComfyUILocalProvider {
  name = 'comfyui';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const apiUrl = task._opsv.api_url || 'http://127.0.0.1:8188';
    const outputDir = path.dirname(taskPath);
    const shotId = task._opsv.shotId;

    try {
      const payload = { ...task };
      delete (payload as any)._opsv;

      const response = await axios.post(`${apiUrl}/prompt`, { prompt: payload }, {
        timeout: 30000,
      });

      const promptId = response.data?.prompt_id;
      if (!promptId) {
        throw new Error(`No prompt_id in response: ${JSON.stringify(response.data)}`);
      }

      logger.info(`[ComfyUI] Submitted ${shotId}, promptId=${promptId}`);

      // Poll for completion
      const maxRetries = 300;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((r) => setTimeout(r, 5000));

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
              const outputPath = path.join(outputDir, `${shotId}_1.${ext}`);
              await downloadFile(imageUrl, outputPath);

              return { taskPath, shotId, provider: 'comfyui', success: true, outputPath };
            }
          }
        }
      }

      throw new Error(`Polling timeout for promptId=${promptId}`);
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

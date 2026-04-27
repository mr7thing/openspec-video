// ============================================================================
// OpsV v0.8 Minimax Executor Provider
// ============================================================================

import axios from 'axios';
import path from 'path';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ConfigLoader } from '../../utils/configLoader';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';

export class MinimaxProvider {
  name = 'minimax';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(process.cwd());

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(`minimax.${task._opsv.modelKey}`);
    } catch {
      apiKey = process.env.MINIMAX_API_KEY || '';
    }

    const isImage = task._opsv.type === 'imagen';

    try {
      if (isImage) {
        return await this.executeImage(task, taskPath, apiKey);
      }
      return await this.executeVideo(task, taskPath, apiKey);
    } catch (err: any) {
      return {
        taskPath,
        shotId: task._opsv.shotId,
        provider: 'minimax',
        success: false,
        error: err.message,
      };
    }
  }

  private async executeImage(task: TaskJson, taskPath: string, apiKey: string): Promise<ProviderResult> {
    const apiUrl = task._opsv.api_url;
    const outputDir = path.dirname(taskPath);
    const shotId = task._opsv.shotId;

    const payload = { ...task };
    delete (payload as any)._opsv;

    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    const imageUrl =
      response.data?.data?.image_url ||
      response.data?.data?.url ||
      response.data?.url;

    if (!imageUrl) {
      throw new Error(`No image URL in response: ${JSON.stringify(response.data)}`);
    }

    const outputPath = path.join(outputDir, `${shotId}_1.png`);
    await downloadFile(imageUrl, outputPath);

    return { taskPath, shotId, provider: 'minimax', success: true, outputPath };
  }

  private async executeVideo(task: TaskJson, taskPath: string, apiKey: string): Promise<ProviderResult> {
    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url;
    const outputDir = path.dirname(taskPath);
    const shotId = task._opsv.shotId;

    const payload = { ...task };
    delete (payload as any)._opsv;

    const submitRes = await axios.post(submitUrl, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    const taskId = submitRes.data?.task_id || submitRes.data?.data?.task_id;
    if (!taskId) {
      throw new Error(`No task_id in submit response: ${JSON.stringify(submitRes.data)}`);
    }

    logger.info(`[Minimax] Submitted ${shotId}, taskId=${taskId}`);

    const maxRetries = 150;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 10000));

      const statusRes = await axios.get(`${statusUrl}?task_id=${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const status = statusRes.data?.status || statusRes.data?.data?.status;

      if (status === 'Success' || status === 'succeeded') {
        const videoUrl = statusRes.data?.data?.video_url || statusRes.data?.file_url;
        if (!videoUrl) throw new Error('Completed but no video_url found');

        const outputPath = path.join(outputDir, `${shotId}_1.mp4`);
        await downloadFile(videoUrl, outputPath);

        return { taskPath, shotId, provider: 'minimax', success: true, outputPath };
      }

      if (status === 'Fail' || status === 'failed') {
        throw new Error(`Video generation failed: ${JSON.stringify(statusRes.data)}`);
      }
    }

    throw new Error(`Polling timeout for ${taskId}`);
  }
}

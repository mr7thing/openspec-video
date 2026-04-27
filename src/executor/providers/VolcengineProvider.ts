// ============================================================================
// OpsV v0.8 Volcengine Executor Provider
// Handles: seadream (image), seedance2 (video)
// ============================================================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ConfigLoader } from '../../utils/configLoader';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';

export class VolcengineProvider {
  name = 'volcengine';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const modelKey = task._opsv.modelKey;
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(process.cwd());

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(`volcengine.${modelKey}`);
    } catch {
      apiKey = process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY || '';
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
        provider: 'volcengine',
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
      response.data?.data?.[0]?.url ||
      response.data?.data?.url ||
      response.data?.url;

    if (!imageUrl) {
      throw new Error(`No image URL in response: ${JSON.stringify(response.data)}`);
    }

    const outputPath = path.join(outputDir, `${shotId}_1.png`);
    await downloadFile(imageUrl, outputPath);

    return {
      taskPath,
      shotId,
      provider: 'volcengine',
      success: true,
      outputPath,
    };
  }

  private async executeVideo(task: TaskJson, taskPath: string, apiKey: string): Promise<ProviderResult> {
    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url || submitUrl.replace('/generations', '');
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

    const requestId =
      submitRes.data?.id ||
      submitRes.data?.data?.id ||
      submitRes.data?.task_id;

    if (!requestId) {
      throw new Error(`No request ID in submit response: ${JSON.stringify(submitRes.data)}`);
    }

    logger.info(`[Volcengine] Submitted ${shotId}, requestId=${requestId}`);

    // Poll for completion
    const maxRetries = 150;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 10000));

      const statusRes = await axios.get(`${statusUrl}?id=${requestId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const status = statusRes.data?.status || statusRes.data?.data?.status;

      if (status === 'succeeded' || status === 'completed') {
        const videoUrl = statusRes.data?.video_url || statusRes.data?.data?.video_url;
        if (!videoUrl) throw new Error('Completed but no video_url found');

        const outputPath = path.join(outputDir, `${shotId}_1.mp4`);
        await downloadFile(videoUrl, outputPath);

        return { taskPath, shotId, provider: 'volcengine', success: true, outputPath };
      }

      if (status === 'failed') {
        const reason = statusRes.data?.error_message || 'Unknown error';
        throw new Error(`Video generation failed: ${reason}`);
      }
    }

    throw new Error(`Polling timeout for ${requestId}`);
  }
}

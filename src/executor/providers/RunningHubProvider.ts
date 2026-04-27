// ============================================================================
// OpsV v0.8 RunningHub Executor Provider
// ============================================================================

import axios from 'axios';
import path from 'path';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ConfigLoader } from '../../utils/configLoader';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';

export class RunningHubProvider {
  name = 'runninghub';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(process.cwd());

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(`runninghub.${task._opsv.modelKey}`);
    } catch {
      apiKey = process.env.RUNNINGHUB_API_KEY || '';
    }

    try {
      const submitUrl = task._opsv.api_url;
      const statusUrl = task._opsv.api_status_url || submitUrl.replace('/post', '/status');
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

      const taskId = submitRes.data?.data?.taskId || submitRes.data?.taskId;
      if (!taskId) {
        throw new Error(`No taskId in submit response: ${JSON.stringify(submitRes.data)}`);
      }

      logger.info(`[RunningHub] Submitted ${shotId}, taskId=${taskId}`);

      const maxRetries = 150;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((r) => setTimeout(r, 10000));

        const statusRes = await axios.get(`${statusUrl}?taskId=${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        const status = statusRes.data?.data?.status || statusRes.data?.status;

        if (status === 'SUCCESS' || status === 'completed') {
          const outputUrl = statusRes.data?.data?.output?.[0]?.url || statusRes.data?.data?.url;
          if (!outputUrl) throw new Error('Completed but no output URL found');

          const ext = task._opsv.type === 'video_generation' ? 'mp4' : 'png';
          const outputPath = path.join(outputDir, `${shotId}_1.${ext}`);
          await downloadFile(outputUrl, outputPath);

          return { taskPath, shotId, provider: 'runninghub', success: true, outputPath };
        }

        if (status === 'FAIL' || status === 'failed') {
          throw new Error(`Task failed: ${JSON.stringify(statusRes.data)}`);
        }
      }

      throw new Error(`Polling timeout for ${taskId}`);
    } catch (err: any) {
      return {
        taskPath,
        shotId: task._opsv.shotId,
        provider: 'runninghub',
        success: false,
        error: err.message,
      };
    }
  }
}

// ============================================================================
// OpsV v0.8 RunningHub Executor Provider
// ============================================================================

import axios from 'axios';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath } from '../naming';
import { ConfigLoader } from '../../utils/configLoader';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import {
  appendLog,
  getResumeTaskId,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
} from '../polling';

export class RunningHubProvider {
  name = 'runninghub';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(process.cwd());

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(task._opsv.modelKey);
    } catch {
      apiKey = process.env.RUNNINGHUB_API_KEY || '';
    }

    try {
      const submitUrl = task._opsv.api_url;
      const statusUrl = task._opsv.api_status_url || submitUrl.replace('/post', '/status');
      const shotId = task._opsv.shotId;

      let taskId = getResumeTaskId(taskPath);

      if (!taskId) {
        const payload = { ...task };
        delete (payload as any)._opsv;

        const submitRes = await axios.post(submitUrl, payload, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        });

        taskId = submitRes.data?.data?.taskId || submitRes.data?.taskId;
        if (!taskId) {
          throw new Error(`No taskId in submit response: ${JSON.stringify(submitRes.data)}`);
        }

        appendLog(taskPath, { event: 'submitted', task_id: taskId });
        logger.info(`[RunningHub] Submitted ${shotId}, taskId=${taskId}`);
      } else {
        logger.info(`[RunningHub] Resuming ${shotId}, taskId=${taskId}`);
      }

      // Gradient polling
      const maxDuration = 4 * 60 * 60 * 1000;
      while (true) {
        const elapsed = getElapsedMs(taskPath);
        if (elapsed > maxDuration) {
          throw new Error(`Polling timeout for ${taskId} (4h exceeded)`);
        }

        const interval = getPollIntervalMs(elapsed);
        await sleep(interval);

        const statusRes = await axios.get(`${statusUrl}?taskId=${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        const status = statusRes.data?.data?.status || statusRes.data?.status;

        if (status === 'SUCCESS' || status === 'completed') {
          const outputUrl = statusRes.data?.data?.output?.[0]?.url || statusRes.data?.data?.url;
          if (!outputUrl) throw new Error('Completed but no output URL found');

          const ext = task._opsv.type === 'video' ? 'mp4' : 'png';
          const outputPath = outputFilePath(taskPath, 1, ext);
          await downloadFile(outputUrl, outputPath);

          appendLog(taskPath, { event: 'succeeded', task_id: taskId });
          return { taskPath, shotId, provider: 'runninghub', success: true, outputPath };
        }

        if (status === 'FAIL' || status === 'failed') {
          const reason = JSON.stringify(statusRes.data);
          appendLog(taskPath, { event: 'failed', task_id: taskId, error: reason });
          throw new Error(`Task failed: ${reason}`);
        }

        appendLog(taskPath, { event: 'polling', status: status || 'unknown', task_id: taskId });
      }
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

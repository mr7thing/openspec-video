// ============================================================================
// OpsV Webapp Executor Provider
// HTTP submit-poll for browser automation via Chrome extension
// ============================================================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';
import { resolveProjectRoot } from '../../utils/projectResolver';
import {
  appendLog,
  getResumeTaskId,
  getPollIntervalMs,
  getElapsedMs,
  sleep,
  PollLogEntry,
} from '../polling';

import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

export class WebappProvider {
  name = 'webapp';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url;
    const shotId = task._opsv.shotId;

    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(resolveProjectRoot(process.cwd()));
    const modelConfig = configLoader.getModelConfig(task._opsv.modelKey);

    try {
      // 1. Health check
      try {
        const baseUrl = submitUrl.replace(/\/generate$/, '');
        await axios.get(`${baseUrl}/health`, { timeout: modelConfig?.timeout?.health || 5000 });
      } catch {
        throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `Webapp extension not running on ${submitUrl.replace(/\/generate$/, '')}. Start the Chrome extension and its native messaging host.`);
      }

      // 2. Check for resume from .log
      let taskId = getResumeTaskId(taskPath);
      const ext = task._opsv.type === 'video' ? 'mp4' : 'png';
      let outputPath = outputFilePath(taskPath, resolveNextOutputIndex(taskPath, ext), ext);

      if (!taskId) {
        // 3. Submit new task
        const payload = { ...task };
        delete (payload as any)._opsv;

        // Add output_path so extension knows where to save
        payload.output_path = outputPath;

        const submitRes = await axios.post(submitUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: modelConfig?.timeout?.submit || 30000,
        });

        taskId = submitRes.data?.task_id;
        if (!taskId) {
          throw new ExecutionError(OpsVErrorCode.EXECUTION_SUBMIT_FAILED, `No task_id in submit response: ${JSON.stringify(submitRes.data)}`);
        }

        appendLog(taskPath, { event: 'submitted', task_id: taskId });
        logger.info(`[Webapp] Submitted ${shotId}, task_id=${taskId}`);
      } else {
        logger.info(`[Webapp] Resuming ${shotId}, task_id=${taskId}`);
      }

      // 4. Gradient polling
      const maxDuration = modelConfig?.max_poll_duration || 8 * 60 * 60 * 1000; // 8h default
      while (true) {
        const elapsed = getElapsedMs(taskPath);
        if (elapsed > maxDuration) {
          throw new ExecutionError(OpsVErrorCode.EXECUTION_TIMEOUT, `Polling timeout for ${taskId} (8h exceeded)`);
        }

        const interval = getPollIntervalMs(elapsed, configLoader.getSettings()?.polling?.intervals);
        await sleep(interval);

        const statusRes = await axios.get(`${statusUrl}`, {
          params: { task_id: taskId },
          timeout: modelConfig?.timeout?.status || 10000,
        });

        const status = statusRes.data?.status;

        if (status === 'succeeded' || status === 'completed') {
          appendLog(taskPath, { event: 'polling', status, task_id: taskId });

          // Prefer base64 output_data, fallback to output_url
          const outputData = statusRes.data?.output_data;
          const outputUrl = statusRes.data?.output_url;

          if (outputData) {
            // Decode base64 data URI or raw base64
            const raw = outputData.startsWith('data:')
              ? outputData.split(',')[1]
              : outputData;
            fs.writeFileSync(outputPath, Buffer.from(raw, 'base64'));
          } else if (outputUrl) {
            if (outputUrl.startsWith('file://')) {
              const src = outputUrl.replace('file://', '');
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, outputPath);
              }
            } else {
              await downloadFile(outputUrl, outputPath);
            }
          } else {
            // Check if extension already wrote to output_path
            const expectedPath = statusRes.data?.output_path || task.output_path;
            if (expectedPath && fs.existsSync(expectedPath)) {
              if (expectedPath !== outputPath) {
                fs.copyFileSync(expectedPath, outputPath);
              }
            } else {
              throw new ExecutionError(OpsVErrorCode.EXECUTION_OUTPUT_NOT_FOUND, 'Succeeded but no output data found');
            }
          }

          appendLog(taskPath, { event: 'succeeded', task_id: taskId, output: path.basename(outputPath) });
          return { taskPath, shotId, provider: 'webapp', success: true, outputPath };
        }

        if (status === 'failed') {
          const reason = statusRes.data?.error || 'Unknown error';
          appendLog(taskPath, { event: 'failed', task_id: taskId, error: reason });
          throw new ExecutionError(OpsVErrorCode.EXECUTION_TASK_FAILED, `Webapp generation failed: ${reason}`);
        }

        appendLog(taskPath, { event: 'polling', status: status || 'unknown', task_id: taskId });
      }
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: 'webapp',
        success: false,
        error: err.message,
      };
    }
  }
}

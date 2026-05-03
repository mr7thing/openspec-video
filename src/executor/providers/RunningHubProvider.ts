// ============================================================================
// OpsV v0.9 RunningHub Executor Provider
// Handles: workflowId + nodeInfoList mode with file upload + workflow download
// ============================================================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { outputFilePath, resolveNextOutputIndex } from '../naming';
import { ConfigLoader } from '../../utils/configLoader';
import { downloadFile } from '../../utils/download';
import { logger } from '../../utils/logger';
import { resolveProjectRoot } from '../../utils/projectResolver';
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
    configLoader.loadConfig(resolveProjectRoot(process.cwd()));

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(task._opsv.modelKey);
    } catch {
      apiKey = process.env.RUNNINGHUB_API_KEY || '';
    }

    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url;
    const shotId = task._opsv.shotId;
    const workflowId = task._opsv.workflowId;

    // Derive base URL for upload & workflow fetch
    const baseUrl = this.deriveBaseUrl(submitUrl);

    try {
      let taskId = getResumeTaskId(taskPath);

      if (!taskId) {
        const payload = { ...task };
        delete (payload as any)._opsv;

        // Upload local files referenced in nodeInfoList and replace with server fileName
        if (Array.isArray(payload.nodeInfoList)) {
          for (const item of payload.nodeInfoList) {
            if (item.fieldValue && typeof item.fieldValue === 'string') {
              const val = item.fieldValue;
              if (!val.startsWith('http') && !val.startsWith('data:') && fs.existsSync(val)) {
                const fileName = await this.uploadFile(val, apiKey, baseUrl);
                item.fieldValue = fileName;
              }
            }
          }
        }

        // RunningHub create task API requires apiKey in the body
        payload.apiKey = apiKey;

        const submitRes = await axios.post(submitUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        });

        // Response: { code: 0, msg: 'success', data: { taskId, taskStatus, clientId, promptTips } }
        if (submitRes.data?.code !== 0) {
          const msg = submitRes.data?.msg || JSON.stringify(submitRes.data);
          throw new Error(`RunningHub task creation failed: ${msg}`);
        }

        taskId = submitRes.data?.data?.taskId;
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
          timeout: 30000,
        });

        const status = statusRes.data?.data?.status || statusRes.data?.status;

        if (status === 'SUCCESS' || status === 'completed' || status === 'succeeded') {
          const outputPaths: string[] = [];

          // 1. Download result file(s)
          const outputs = statusRes.data?.data?.output || [];
          if (Array.isArray(outputs) && outputs.length > 0) {
            for (let i = 0; i < outputs.length; i++) {
              const url = outputs[i]?.url || outputs[i];
              if (!url) continue;
              const ext = task._opsv.type === 'video' ? 'mp4' : 'png';
              const idx = resolveNextOutputIndex(taskPath, ext) + i;
              const outputPath = outputFilePath(taskPath, idx, ext);
              await downloadFile(url, outputPath);
              outputPaths.push(outputPath);
            }
          } else {
            const singleUrl = statusRes.data?.data?.url || statusRes.data?.data?.output;
            if (singleUrl) {
              const ext = task._opsv.type === 'video' ? 'mp4' : 'png';
              const outputPath = outputFilePath(taskPath, resolveNextOutputIndex(taskPath, ext), ext);
              await downloadFile(singleUrl, outputPath);
              outputPaths.push(outputPath);
            }
          }

          if (outputPaths.length === 0) {
            throw new Error('Completed but no output URL found');
          }

          // 2. Download original ComfyUI workflow JSON
          if (workflowId) {
            try {
              const workflowPath = await this.fetchWorkflowJson(workflowId, apiKey, baseUrl, taskPath);
              if (workflowPath) {
                outputPaths.push(workflowPath);
              }
            } catch (wfErr: any) {
              logger.warn(`[RunningHub] Workflow JSON download failed: ${wfErr.message}`);
            }
          }

          appendLog(taskPath, { event: 'succeeded', task_id: taskId });
          return {
            taskPath,
            shotId,
            provider: 'runninghub',
            success: true,
            outputPaths: outputPaths.length > 1 ? outputPaths : undefined,
            outputPath: outputPaths.length === 1 ? outputPaths[0] : undefined,
          };
        }

        if (status === 'FAIL' || status === 'failed' || status === 'FAILED') {
          const reason = statusRes.data?.data?.error || statusRes.data?.msg || JSON.stringify(statusRes.data);
          appendLog(taskPath, { event: 'failed', task_id: taskId, error: reason });
          throw new Error(`Task failed: ${reason}`);
        }

        appendLog(taskPath, { event: 'polling', status: status || 'unknown', task_id: taskId });
      }
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: 'runninghub',
        success: false,
        error: err.message,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Upload a local file to RunningHub and return the server fileName
  // --------------------------------------------------------------------------
  private async uploadFile(filePath: string, apiKey: string, baseUrl: string): Promise<string> {
    const uploadUrl = `${baseUrl}/openapi/v2/media/upload/binary`;

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const response = await axios.post(uploadUrl, form, {
      headers: {
        ...form.getHeaders(),
        'apiKey': apiKey,
      },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (response.data?.code !== 0) {
      throw new Error(
        `RunningHub file upload failed for ${filePath}: ${response.data?.message || JSON.stringify(response.data)}`
      );
    }

    const fileName = response.data?.data?.fileName;
    if (!fileName) {
      throw new Error(`No fileName in upload response for ${filePath}: ${JSON.stringify(response.data)}`);
    }

    logger.info(`[RunningHub] Uploaded ${path.basename(filePath)} → ${fileName}`);
    return fileName;
  }

  // --------------------------------------------------------------------------
  // Fetch original ComfyUI workflow JSON from RH API and save it
  // --------------------------------------------------------------------------
  private async fetchWorkflowJson(
    workflowId: string,
    apiKey: string,
    baseUrl: string,
    taskPath: string
  ): Promise<string | null> {
    const url = `${baseUrl}/api/openapi/getJsonApiFormat`;

    const res = await axios.post(
      url,
      { apiKey, workflowId },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    if (res.data?.code !== 0) {
      throw new Error(`getJsonApiFormat failed: ${res.data?.msg || JSON.stringify(res.data)}`);
    }

    const promptStr = res.data?.data?.prompt;
    if (!promptStr) {
      throw new Error('No prompt field in getJsonApiFormat response');
    }

    // prompt is a JSON string inside the response
    let workflowJson: any;
    try {
      workflowJson = JSON.parse(promptStr);
    } catch {
      // If it's not valid JSON, save as raw string
      workflowJson = promptStr;
    }

    const dir = path.dirname(taskPath);
    const base = path.basename(taskPath, '.json');
    const workflowPath = path.join(dir, `${base}_workflow.json`);
    fs.writeFileSync(workflowPath, JSON.stringify(workflowJson, null, 2));

    logger.info(`[RunningHub] Saved workflow JSON → ${path.basename(workflowPath)}`);
    return workflowPath;
  }

  // --------------------------------------------------------------------------
  // Derive base URL (scheme + host) from a full URL
  // --------------------------------------------------------------------------
  private deriveBaseUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return 'https://www.runninghub.cn';
    }
  }
}

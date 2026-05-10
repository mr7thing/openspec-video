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
import { generateRandomSeed } from '../../utils/randomSeed';

export class RunningHubProvider {
  name = 'runninghub';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(resolveProjectRoot(path.dirname(taskPath)));

    let apiKey: string;
    try {
      apiKey = configLoader.getResolvedApiKey(task._opsv.modelKey);
    } catch (err: any) {
      // Only fall back to env for missing-key errors; rethrow config problems
      const envKey = process.env.RUNNINGHUB_API_KEY || '';
      if (!envKey) {
        throw new Error(`RunningHub API key not found: ${err.message}`);
      }
      apiKey = envKey;
    }

    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url;
    if (!statusUrl) throw new Error('RunningHubProvider: api_status_url is required in task._opsv');
    const shotId = task._opsv.shotId;
    const workflowId = task._opsv.workflowId;

    // Derive base URL for upload & workflow fetch
    const baseUrl = this.deriveBaseUrl(submitUrl);

    try {
      let taskId = getResumeTaskId(taskPath);

      if (!taskId) {
        const payload = { ...task };
        delete (payload as any)._opsv;

        // Resolve 'random' placeholders and upload local files in nodeInfoList
        if (Array.isArray(payload.nodeInfoList)) {
          for (const item of payload.nodeInfoList) {
            if (item.fieldValue === 'random') {
              item.fieldValue = generateRandomSeed();
              logger.info(`[RunningHub] Resolved random seed for node ${item.nodeId}.${item.fieldName}`);
            }
            if (item.fieldValue && typeof item.fieldValue === 'string') {
              const val = item.fieldValue;
              if (!val.startsWith('http') && !val.startsWith('data:')) {
                // Skip strings that are clearly not file paths (long text, multiline)
                if (val.length > 4096 || val.includes('\n')) {
                  continue;
                }
                if (fs.existsSync(val)) {
                  const fileName = await this.uploadFile(val, apiKey, baseUrl);
                  item.fieldValue = fileName;
                } else if (
                  val.includes('/') || val.includes('\\') ||
                  /\.(png|jpg|jpeg|webp|gif|bmp|mp4|mov|avi|mkv|wav|mp3|ogg|flac)$/i.test(val)
                ) {
                  // Looks like a file path but doesn't exist
                  throw new Error(`Reference file not found: ${val} (node ${item.nodeId}.${item.fieldName})`);
                }
                // Otherwise silently skip (likely a text value like prompt)
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
          transformResponse: [(data) => this.parseBigIntResponse(data)],
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

        // Query task status (POST /task/openapi/status)
        // Response: { code: 0, msg: "", data: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" }
        const statusRes = await this.withRetry(
          () => axios.post(
            statusUrl,
            { apiKey, taskId },
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeout: 30000,
              transformResponse: [(data) => this.parseBigIntResponse(data)],
            }
          ),
          `status query for ${taskId}`
        );

        if (statusRes.data?.code !== 0) {
          const msg = statusRes.data?.msg || JSON.stringify(statusRes.data);
          throw new Error(`RunningHub status query failed: ${msg}`);
        }

        const status = statusRes.data?.data;

        if (status === 'SUCCESS') {
          // Query task outputs (POST /task/openapi/outputs)
          // Response: { code: 0, msg: "success", data: [{ fileUrl, fileType, ... }] }
          const resultRes = await this.withRetry(
            () => axios.post(
              `${baseUrl}/task/openapi/outputs`,
              { apiKey, taskId },
              {
                headers: { Authorization: `Bearer ${apiKey}` },
                timeout: 30000,
                transformResponse: [(data) => this.parseBigIntResponse(data)],
              }
            ),
            `result query for ${taskId}`
          );

          if (resultRes.data?.code !== 0) {
            const msg = resultRes.data?.msg || JSON.stringify(resultRes.data);
            throw new Error(`RunningHub result query failed: ${msg}`);
          }

          const outputPaths: string[] = [];
          const outputs = resultRes.data?.data || [];

          const extIndices: Record<string, number> = {};
          if (Array.isArray(outputs) && outputs.length > 0) {
            for (let i = 0; i < outputs.length; i++) {
              const url = outputs[i]?.fileUrl;
              if (!url) continue;
              const rawType = outputs[i]?.fileType;
              const ext = rawType ? this.mapFileTypeToExt(rawType) : (task._opsv.type === 'video' ? 'mp4' : 'png');
              if (!(ext in extIndices)) {
                extIndices[ext] = resolveNextOutputIndex(taskPath, ext);
              }
              const outputPath = outputFilePath(taskPath, extIndices[ext]++, ext);
              await downloadFile(url, outputPath);
              outputPaths.push(outputPath);
            }
          }

          if (outputPaths.length === 0) {
            throw new Error('Completed but no output URL found');
          }

          // Download original ComfyUI workflow JSON
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
            outputPath: outputPaths[0],
            outputPaths,
          };
        }

        if (status === 'FAILED') {
          const reason = statusRes.data?.msg || JSON.stringify(statusRes.data);
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
      transformResponse: [(data) => this.parseBigIntResponse(data)],
    });

    if (response.data?.code !== 0) {
      throw new Error(
        `RunningHub file upload failed for ${filePath}: ${response.data?.msg || JSON.stringify(response.data)}`
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
        transformResponse: [(data) => this.parseBigIntResponse(data)],
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
  // Map RunningHub fileType / MIME type to file extension
  // --------------------------------------------------------------------------
  private mapFileTypeToExt(fileType: string): string {
    if (fileType.includes('/')) {
      const mimeExt = fileType.split('/').pop();
      if (mimeExt) return mimeExt;
    }
    return fileType;
  }

  // --------------------------------------------------------------------------
  // Parse JSON response while preserving big integers as strings
  // --------------------------------------------------------------------------
  private parseBigIntResponse(data: string): any {
    if (!data || typeof data !== 'string') return data;
    return JSON.parse(data, (key, value) => {
      if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        return String(value);
      }
      return value;
    });
  }

  // --------------------------------------------------------------------------
  // Retry an async operation with exponential backoff
  // --------------------------------------------------------------------------
  private async withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        if (i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 30000);
          logger.warn(`[RunningHub] ${label} failed (attempt ${i + 1}/${maxRetries}): ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }
    throw lastErr;
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

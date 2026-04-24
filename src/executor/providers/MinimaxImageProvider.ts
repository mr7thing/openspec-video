import axios from 'axios';
import fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { downloadFile } from '../../utils/download';
import { ConfigLoader } from '../../utils/configLoader';

export class MinimaxImageProvider {
  constructor(private readonly providerName: string = 'minimax') {}
  async processTask(input: { taskJson: any; outputPath: string; logPath: string }): Promise<void> {
    const { taskJson, outputPath, logPath } = input;
    const meta = taskJson._opsv;
    const requestBody = { ...taskJson };
    delete requestBody._opsv;

    const apiKey = await this.resolveApiKey();    const logLines: any[] = [];

    logLines.push({ t: new Date().toISOString(), type: 'request', method: 'POST', url: meta.api_url, body: requestBody });

    try {
      const response = await axios.post(meta.api_url, requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 120000
      });

      logLines.push({ t: new Date().toISOString(), type: 'response', status: response.status, body: response.data });

      if (meta.type === 'image_generation') {
        await this.handleImageResponse(response.data, outputPath, logLines);
      } else if (meta.type === 'video_generation') {
        if (!meta.api_status_url) throw new Error('Video task missing api_status_url in _opsv');
        await this.handleVideoResponse(response.data, apiKey, meta.api_status_url, outputPath, logLines);
      } else {
        throw new Error(`Unknown task type: ${meta.type}`);
      }

      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    } catch (err: any) {
      logLines.push({ t: new Date().toISOString(), type: 'error', message: err.message, code: err.code || err.response?.status });
      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
      throw err;
    }
  }

  private async handleImageResponse(data: any, outputPath: string, logLines: any[]) {
    if (!data || !data.data || !data.data.image_base64) {
      if (data.base_resp?.status_code === 1033) {
        const terms = this.detectSensitiveTerms(data.base_resp.status_msg || '');
        throw new Error(`Minimax content moderation (1033): ${terms.join(', ')}`);
      }
      throw new Error(`Invalid response format: ${JSON.stringify(data.base_resp || data)}`);
    }

    const images = data.data.image_base64;
    const imageBase64 = Array.isArray(images) ? images[0] : images;
    const buffer = Buffer.from(imageBase64, 'base64');

    await fs.writeFile(outputPath, buffer);
    logLines.push({ t: new Date().toISOString(), type: 'save_complete', path: outputPath, size_bytes: buffer.length });
  }

  private async handleVideoResponse(data: any, apiKey: string, apiStatusUrl: string, outputPath: string, logLines: any[]) {
    const taskId = data.task_id || data.id;
    if (!taskId) throw new Error(`No task_id in submission response: ${JSON.stringify(data)}`);

    logLines.push({ t: new Date().toISOString(), type: 'video_submitted', taskId });

    let retries = 0;
    let pollIntervalMs = 5000;
    while (retries < 120) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      retries++;
      pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

      try {
        const statusRes = await axios.get(`${apiStatusUrl}?task_id=${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });

        const statusData = statusRes.data;
        const status = statusData?.status;
        logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status });

        if (status === 'Success') {
          const fileId = statusData?.file_id;
          if (!fileId) throw new Error('Status Success but no file_id found');

          const videoUrl = await this.getVideoDownloadUrl(fileId, apiKey);
          if (!videoUrl) throw new Error('Failed to get video download URL');

          logLines.push({ t: new Date().toISOString(), type: 'download_start', url: videoUrl });
          await downloadFile(videoUrl, outputPath);
          logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
          return;
        } else if (status === 'Failed' || status === 'Fail') {
          throw new Error(`Video generation failed: ${JSON.stringify(statusData)}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Video generation failed')) throw err;
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
          logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
          continue;
        }
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Video polling timeout for task ${taskId}`);
  }

  private async getVideoDownloadUrl(fileId: string, apiKey: string): Promise<string | null> {
    try {
      const response = await axios.get(`https://api.minimaxi.com/v1/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      return response.data?.file?.download_url || response.data?.download_url || null;
    } catch (err: any) {
      logger.error(`Failed to get video download URL for file ${fileId}: ${err.message}`);
      return null;
    }
  }

  private detectSensitiveTerms(prompt: string): string[] {
    const sensitivePatterns = [
      /\b总裁\b|\b政治\b|\b色情\b|\b暴力\b|\b赌博\b/i,
      /\bpolitics\b|\bsexy\b|\bmurder\b|\bgambling\b/i
    ];
    return sensitivePatterns.filter(p => prompt.match(p)).map(p => p.source);
  }

  private async resolveApiKey(): Promise<string> {
    const configLoader = ConfigLoader.getInstance();
    await configLoader.loadConfig();
    return configLoader.getResolvedApiKey(this.providerName);
  }
}

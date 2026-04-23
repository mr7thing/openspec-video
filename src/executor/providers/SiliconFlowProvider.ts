import axios from 'axios';
import fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { downloadFile } from '../../utils/download';
import { isLocalFilePath, inlineLocalFile } from '../../utils/fileToBase64';

/**
 * SiliconFlow Provider (v0.6.4 简化版)
 *
 * 职责：读取 .json 任务文件 → 发送请求 → 下载结果 → 写 JSONL log。
 */

export class SiliconFlowProvider {
  async processTask(input: { taskJson: any; outputPath: string; logPath: string }): Promise<void> {
    const { taskJson, outputPath, logPath } = input;
    const meta = taskJson._opsv;
    const requestBody = { ...taskJson };
    delete requestBody._opsv;

    // 将本地图片路径转为 base64 Data URI
    const batchDir = logPath.substring(0, logPath.lastIndexOf('/'));
    if (requestBody.image && isLocalFilePath(requestBody.image)) {
      requestBody.image = await inlineLocalFile(requestBody.image, batchDir);
    }
    if (requestBody.edit_image && isLocalFilePath(requestBody.edit_image)) {
      requestBody.edit_image = await inlineLocalFile(requestBody.edit_image, batchDir);
    }

    const apiKey = this.resolveApiKey();
    const logLines: any[] = [];

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
    // SiliconFlow 响应格式: { images: [{url: "..."}], data: [{url: "..."}] }
    const imageUrl = data.images?.[0]?.url || data.data?.[0]?.url || data.data?.url || data.data?.image_url || data.url;
    if (!imageUrl) throw new Error('Image URL not found in response');

    logLines.push({ t: new Date().toISOString(), type: 'download_start', url: imageUrl });
    await downloadFile(imageUrl, outputPath);
    logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
  }

  private async handleVideoResponse(data: any, apiKey: string, apiStatusUrl: string, outputPath: string, logLines: any[]) {
    const requestId = data.requestId || data.request_id || data.id;
    if (!requestId) throw new Error(`No requestId in submission response: ${JSON.stringify(data)}`);

    logLines.push({ t: new Date().toISOString(), type: 'video_submitted', requestId });

    let retries = 0;
    let pollIntervalMs = 5000;
    while (retries < 120) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      retries++;
      pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

      try {
        const statusRes = await axios.post(apiStatusUrl, { requestId }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });

        const statusData = statusRes.data;
        logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status: statusData.status });

        if (statusData.status === 'Succeed' || statusData.status === 'success') {
          const videoUrl = statusData.results?.videos?.[0]?.url || statusData.video_url;
          if (!videoUrl) throw new Error('Status Succeed but no video URL found');

          logLines.push({ t: new Date().toISOString(), type: 'download_start', url: videoUrl });
          await downloadFile(videoUrl, outputPath);
          logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
          return;
        } else if (statusData.status === 'Failed' || statusData.status === 'failed') {
          throw new Error(`Video generation failed: ${statusData.reason || JSON.stringify(statusData)}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Video generation failed')) throw err;
        if (err.response && err.response.status >= 400 && err.response.status < 500) throw err;
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Video polling timeout for request ${requestId}`);
  }

  private resolveApiKey(): string {
    const key = process.env.SILICONFLOW_API_KEY;
    if (!key) throw new Error('Missing SILICONFLOW_API_KEY environment variable');
    return key;
  }
}

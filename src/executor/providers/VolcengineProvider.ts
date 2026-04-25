import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { downloadFile } from '../../utils/download';
import { inlineLocalFiles, inlineLocalFile, isLocalFilePath } from '../../utils/fileToBase64';
import { ConfigLoader } from '../../utils/configLoader';

export class VolcengineProvider {
  constructor(private readonly providerName: string = 'volcengine') {}
  async processTask(input: { taskJson: any; outputPath: string; logPath: string }): Promise<void> {
    const { taskJson, outputPath, logPath } = input;
    const meta = taskJson._opsv;
    const requestBody = { ...taskJson };
    delete requestBody._opsv;

    const batchDir = path.dirname(outputPath);
    const isContentGeneration = meta.api_url?.includes('content_generation');

    // Seedance 2.0: 将 content 数组中的本地图片/音频转为 Base64 Data URI
    if (isContentGeneration && Array.isArray(requestBody.content)) {
      await inlineLocalFiles(requestBody.content, batchDir);
      // 请求 API 直接返回尾帧图像
      requestBody.return_last_frame = true;
    }

    // 旧版 API：如果 image_url 是本地路径，也尝试转为 Base64
    if (!isContentGeneration && requestBody.image_url && isLocalFilePath(requestBody.image_url)) {
      requestBody.image_url = await inlineLocalFile(requestBody.image_url, batchDir);
    }

    const apiKey = await this.resolveApiKey();    const logLines: any[] = [];

    logLines.push({
      t: new Date().toISOString(),
      type: 'request',
      method: 'POST',
      url: meta.api_url,
      body: requestBody
    });

    try {
      const response = await axios.post(meta.api_url, requestBody, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 120000
      });

      logLines.push({
        t: new Date().toISOString(),
        type: 'response',
        status: response.status,
        body: response.data
      });

      if (meta.type === 'image_generation') {
        await this.handleImageResponse(response.data, outputPath, logLines);
      } else if (meta.type === 'video_generation') {
        if (!meta.api_status_url) throw new Error('Video task missing api_status_url in _opsv');
        if (isContentGeneration) {
          await this.handleContentGenerationVideoResponse(response.data, apiKey, meta.api_status_url, outputPath, logLines);
        } else {
          await this.handleVideoResponse(response.data, apiKey, meta.api_status_url, outputPath, logLines);
        }
      } else {
        throw new Error(`Unknown task type: ${meta.type}`);
      }

      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
    } catch (err: any) {
      logLines.push({
        t: new Date().toISOString(),
        type: 'error',
        message: err.message,
        code: err.code || err.response?.status
      });
      await fs.appendFile(logPath, logLines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
      throw err;
    }
  }

  private async handleImageResponse(data: any, outputPath: string, logLines: any[]) {
    let imageUrl = '';
    const dataLayer = data.data?.data || data.data || data;
    if (Array.isArray(dataLayer) && dataLayer.length > 0) {
      imageUrl = dataLayer[0].image_url || dataLayer[0].url;
    } else if (dataLayer && typeof dataLayer === 'object') {
      imageUrl = dataLayer.image_url || dataLayer.url;
    }

    if (!imageUrl) throw new Error('Image URL not found in response');

    logLines.push({ t: new Date().toISOString(), type: 'download_start', url: imageUrl });
    await downloadFile(imageUrl, outputPath);
    logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
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
        const statusRes = await axios.get(`${apiStatusUrl}?id=${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const statusData = statusRes.data;
        logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status: statusData.status });

        if (statusData.status === 'Success' || statusData.status === 'success' || statusData.status === 'Succeed') {
          const videoUrl = statusData.video_url || statusData.url || statusData.file_url;
          if (!videoUrl) throw new Error('Video generation succeeded but no URL found');

          logLines.push({ t: new Date().toISOString(), type: 'download_start', url: videoUrl });
          await downloadFile(videoUrl, outputPath);
          logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });
          return;
        } else if (statusData.status === 'Failed' || statusData.status === 'failed' || statusData.status === 'Fail') {
          throw new Error(`Video generation failed: ${JSON.stringify(statusData)}`);
        }
      } catch (err: any) {
        if (err.message?.includes('Video generation failed')) throw err;
        if (err.response && err.response.status >= 400 && err.response.status < 500) throw err;
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Video polling timeout for task ${taskId}`);
  }

  /**
   * Seedance 2.0 Content Generation API 视频轮询。
   *
   * 状态查询: GET /api/v3/content_generation/tasks/{task_id}
   * 状态值: queued | running | succeeded | failed
   * 结果提取: response.content.video_url.url
   *
   * 若请求时 return_last_frame=true，成功响应还可能包含尾帧图像 URL。
   */
  private async handleContentGenerationVideoResponse(data: any, apiKey: string, apiStatusUrl: string, outputPath: string, logLines: any[]) {
    const taskId = data.id;
    if (!taskId) throw new Error(`No id in submission response: ${JSON.stringify(data)}`);

    logLines.push({ t: new Date().toISOString(), type: 'video_submitted', taskId });

    let retries = 0;
    let pollIntervalMs = 5000;
    while (retries < 120) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      retries++;
      pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

      try {
        // Content Generation API: GET {apiStatusUrl}/{taskId}
        const statusRes = await axios.get(`${apiStatusUrl}/${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const statusData = statusRes.data;
        logLines.push({ t: new Date().toISOString(), type: 'poll', attempt: retries, status: statusData.status });

        if (statusData.status === 'succeeded') {
          const content = statusData.content || {};
          const batchDir = path.dirname(outputPath);

          // 1. 视频主文件
          const videoUrl = content.video_url?.url;
          if (!videoUrl) throw new Error('Video generation succeeded but no URL found in content.video_url');
          logLines.push({ t: new Date().toISOString(), type: 'asset_url', asset: 'video', url: videoUrl });
          logLines.push({ t: new Date().toISOString(), type: 'download_start', url: videoUrl });
          await downloadFile(videoUrl, outputPath);
          logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: outputPath });

          // 2. 首帧 / 封面图
          const coverUrl = content.cover_image_url?.url;
          if (coverUrl) {
            const baseName = path.basename(outputPath, path.extname(outputPath));
            const firstFramePath = path.join(batchDir, `${baseName}_first.png`);
            logLines.push({ t: new Date().toISOString(), type: 'asset_url', asset: 'first_frame', url: coverUrl });
            logLines.push({ t: new Date().toISOString(), type: 'download_start', url: coverUrl });
            await downloadFile(coverUrl, firstFramePath);
            logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: firstFramePath });
          }

          // 3. 尾帧（return_last_frame=true 时 API 返回）
          const lastFrameUrl = content.last_frame_url?.url
            || content.last_frame_image_url?.url
            || content.last_frame?.url;
          if (lastFrameUrl) {
            const baseName = path.basename(outputPath, path.extname(outputPath));
            const lastFramePath = path.join(batchDir, `${baseName}_last.png`);
            logLines.push({ t: new Date().toISOString(), type: 'asset_url', asset: 'last_frame', url: lastFrameUrl });
            logLines.push({ t: new Date().toISOString(), type: 'download_start', url: lastFrameUrl });
            await downloadFile(lastFrameUrl, lastFramePath);
            logLines.push({ t: new Date().toISOString(), type: 'download_complete', path: lastFramePath });
          }

          // 记录完整 content 对象（便于调试未知字段）
          logLines.push({ t: new Date().toISOString(), type: 'response_content', content });
          return;
        } else if (statusData.status === 'failed') {
          throw new Error(`Video generation failed: ${JSON.stringify(statusData.error || statusData)}`);
        }
        // queued / running: continue polling
      } catch (err: any) {
        if (err.message?.includes('Video generation failed')) throw err;
        if (err.response && err.response.status >= 400 && err.response.status < 500) throw err;
        logLines.push({ t: new Date().toISOString(), type: 'poll_error', attempt: retries, message: err.message });
      }
    }
    throw new Error(`Video polling timeout for task ${taskId}`);
  }

  private async resolveApiKey(): Promise<string> {
    const configLoader = ConfigLoader.getInstance();
    await configLoader.loadConfig();
    return configLoader.getResolvedApiKey(this.providerName);
  }
}

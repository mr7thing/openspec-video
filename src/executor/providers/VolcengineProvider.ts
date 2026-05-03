// ============================================================================
// OpsV v0.8 Volcengine Executor Provider
// Handles: seadream (image), seedance2 (video)
// ============================================================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';
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

export class VolcengineProvider {
  name = 'volcengine';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    const modelKey = task._opsv.modelKey;
    const configLoader = ConfigLoader.getInstance();
    configLoader.loadConfig(resolveProjectRoot(process.cwd()));

    // modelKey is the api_config key (e.g. volc.seadream5), use it directly
    const apiKey = configLoader.getResolvedApiKey(modelKey);

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

  private async resolveImageField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    // Local file path — convert to base64 data URI
    const data = fs.readFileSync(value);
    const ext = path.extname(value).slice(1) || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  private async resolveVideoField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    // Video files are typically too large for base64; require HTTP URL
    throw new Error(
      `Local video paths are not supported for API submission. ` +
      `Please upload the video to a URL or use a TOS/S3 link: ${value}`
    );
  }

  private async resolveAudioField(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('http') || value.startsWith('data:')) return value;
    // Audio files are typically too large for base64; require HTTP URL
    throw new Error(
      `Local audio paths are not supported for API submission. ` +
      `Please upload the audio to a URL or use a TOS/S3 link: ${value}`
    );
  }

  private async executeImage(task: TaskJson, taskPath: string, apiKey: string): Promise<ProviderResult> {
    const apiUrl = task._opsv.api_url;
    const shotId = task._opsv.shotId;

    const payload = { ...task };
    delete (payload as any)._opsv;

    // Convert local reference image paths to base64 data URIs
    if (Array.isArray(payload.reference_images)) {
      payload.reference_images = await Promise.all(
        payload.reference_images.map((url: string) => this.resolveImageField(url))
      );
    }

    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000,
    });

    // Handle multi-image response (sequential_image_generation)
    const dataItems = response.data?.data;
    let imageUrls: string[] = [];

    if (Array.isArray(dataItems)) {
      // Multi-image response: extract all URLs
      imageUrls = dataItems.map((item: any) => item.url).filter(Boolean);
    } else {
      // Single image response
      const imageUrl =
        dataItems?.[0]?.url ||
        dataItems?.url ||
        response.data?.url;
      if (imageUrl) imageUrls = [imageUrl];
    }

    if (imageUrls.length === 0) {
      throw new Error(`No image URL in response: ${JSON.stringify(response.data)}`);
    }

    // Download all images with sequential indices (auto-increment from existing)
    const outputPaths: string[] = [];
    let nextIndex = resolveNextOutputIndex(taskPath, 'png');
    for (let i = 0; i < imageUrls.length; i++) {
      const outputPath = outputFilePath(taskPath, nextIndex + i, 'png');
      await downloadFile(imageUrls[i], outputPath);
      outputPaths.push(outputPath);
    }

    return {
      taskPath,
      shotId,
      provider: 'volcengine',
      success: true,
      outputPath: outputPaths[0], // Primary output is the first image
      outputPaths, // All output paths for multi-image
    };
  }

  private async executeVideo(task: TaskJson, taskPath: string, apiKey: string): Promise<ProviderResult> {
    const submitUrl = task._opsv.api_url;
    const statusUrl = task._opsv.api_status_url || submitUrl;
    const shotId = task._opsv.shotId;

    // Check for resume from .log
    let requestId = getResumeTaskId(taskPath);

    if (!requestId) {
      const payload = { ...task };
      delete (payload as any)._opsv;

      // Convert local media paths in content to appropriate formats
      if (Array.isArray(payload.content)) {
        for (const item of payload.content) {
          if (item.image_url?.url) {
            item.image_url.url = await this.resolveImageField(item.image_url.url);
          }
          if (item.video_url?.url) {
            item.video_url.url = await this.resolveVideoField(item.video_url.url);
          }
          if (item.audio_url?.url) {
            item.audio_url.url = await this.resolveAudioField(item.audio_url.url);
          }
        }
      }

      const submitRes = await axios.post(submitUrl, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });

      requestId =
        submitRes.data?.id ||
        submitRes.data?.data?.id ||
        submitRes.data?.task_id;

      if (!requestId) {
        throw new Error(`No request ID in submit response: ${JSON.stringify(submitRes.data)}`);
      }

      appendLog(taskPath, { event: 'submitted', task_id: requestId });
      logger.info(`[Volcengine] Submitted ${shotId}, requestId=${requestId}`);
    } else {
      logger.info(`[Volcengine] Resuming ${shotId}, requestId=${requestId}`);
    }

    // Gradient polling
    const maxDuration = 4 * 60 * 60 * 1000; // 4h max
    while (true) {
      const elapsed = getElapsedMs(taskPath);
      if (elapsed > maxDuration) {
        throw new Error(`Polling timeout for ${requestId} (4h exceeded)`);
      }

      const interval = getPollIntervalMs(elapsed);
      await sleep(interval);

      const statusRes = await axios.get(`${statusUrl}/${requestId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const status = statusRes.data?.status || statusRes.data?.data?.status;

      if (status === 'succeeded' || status === 'completed') {
        const videoUrl =
          statusRes.data?.content?.video_url ||
          statusRes.data?.video_url ||
          statusRes.data?.data?.video_url;
        if (!videoUrl) throw new Error('Completed but no video_url found');

        const outputPath = outputFilePath(taskPath, resolveNextOutputIndex(taskPath, 'mp4'), 'mp4');
        await downloadFile(videoUrl, outputPath);

        appendLog(taskPath, { event: 'succeeded', task_id: requestId });
        return { taskPath, shotId, provider: 'volcengine', success: true, outputPath };
      }

      if (status === 'failed') {
        const reason = statusRes.data?.error_message || 'Unknown error';
        appendLog(taskPath, { event: 'failed', task_id: requestId, error: reason });
        throw new Error(`Video generation failed: ${reason}`);
      }

      appendLog(taskPath, { event: 'polling', status: status || 'unknown', task_id: requestId });
    }
  }
}

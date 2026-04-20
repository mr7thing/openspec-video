import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { VideoProvider } from './VideoProvider';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';

/**
 * SeedanceProvider - 字节跳动 Seedance 1.5/2.0 (Doubao Video v2) 视频生成实现
 */
export class SeedanceProvider implements VideoProvider {
    providerName = 'seedance';

    private async getBase64Image(filePath: string): Promise<string> {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            if (ext === '.webp') mimeType = 'image/webp';

            const stat = await fs.stat(filePath).catch(() => null);
            if (!stat) {
                throw new Error(`Local file not found: ${filePath}`);
            }

            const data = await fs.readFile(filePath);
            const base64Str = data.toString('base64');
            return `data:${mimeType};base64,${base64Str}`;
        } catch (e: any) {
            throw new Error(`Failed to encode image to base64: ${e.message}`);
        }
    }

    async submitJob(job: Job, modelName: string, apiKey: string): Promise<string> {
        const url = (job as any).api_url || 'https://ark.cn-beijing.volces.com/api/v3/video/submit';
        
        const quality = job.payload.global_settings.quality || '720p';
        const resolution = (job as any).resolution || quality;
        const aspectRatio = job.payload.global_settings.aspect_ratio || '16:9';

        const frameRef = job.payload.frame_ref;
        let imageArg = undefined;
        if (frameRef && frameRef.first) {
            imageArg = await this.getBase64Image(frameRef.first);
        } else if (job.reference_images && job.reference_images.length > 0) {
            imageArg = await this.getBase64Image(job.reference_images[0]);
        }

        const requestBody: any = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic video.",
            resolution: resolution,
            aspect_ratio: aspectRatio,
            duration: parseInt(job.payload.duration || '5'),
            fps: 24,
            sound: (job.payload.global_settings as any).sound !== false,
            ...(imageArg && { image: imageArg })
        };

        if (process.env.OPSV_DEBUG === 'true') {
            logger.debug(`[Seedance] Submitting to ${modelName}`, { 
                resolution, 
                aspectRatio, 
                hasImage: !!imageArg,
                prompt: requestBody.prompt 
            });
        }

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // 准则一：深度穿透解析 (V3 兼容)
            const data = response.data;
            const requestId = data.id || 
                             (data.data && data.data.id) || 
                             (data.data && Array.isArray(data.data) && data.data[0]?.id) ||
                             (data.task_id);

            if (requestId) {
                return requestId;
            }

            throw new Error(`Invalid submission response: ${JSON.stringify(data)}`);
        } catch (error: any) {
            const apiError = error.response ? error.response.data : { message: error.message, code: error.code };
            throw new Error(`[Seedance] Submission failed: ${JSON.stringify(apiError)}`);
        }
    }

    async pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void> {
        const url = `https://ark.cn-beijing.volces.com/api/v3/video/status?id=${requestId}`;
        let retries = 0;
        const maxRetries = 150;
        let pollIntervalMs = 5000;

        logger.info(`[Seedance] Start polling for TaskID: ${requestId}`);

        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            retries++;
            // 指数退避：5s -> 10s -> 20s -> 30s 封顶
            pollIntervalMs = Math.min(pollIntervalMs * 2, 30000);

            try {
                const response = await axios.get(url, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                });

                const data = response.data;
                const status = data.status || (data.data && data.data.status);

                if (status === 'succeeded' || status === 'completed') {
                    const videoUrl = data.video_url || (data.data && data.data.video_url);
                    if (!videoUrl) {
                        throw new Error(`Status is completed but no video_url found: ${JSON.stringify(data)}`);
                    }
                    logger.info(`[Seedance] 🟢 Video generation succeeded! Downloading: ${videoUrl}`);
                    await this.downloadVideo(videoUrl, outputFilePath);
                    return;
                } else if (status === 'failed') {
                    const reason = data.error_message || (data.data && data.data.error_message) || "Unknown remote error";
                    throw new Error(`Video generation failed remotely: ${reason}`);
                }
            } catch (error: any) {
                if (error.message && error.message.includes('Video generation failed remotely')) {
                    throw error;
                }
                if (retries > 5) {
                    logger.warn(`[Seedance] Poll Error (Try ${retries}): ${error.message}`);
                }
            }
        }

        throw new Error(`Polling timeout for requestId: ${requestId} after ${maxRetries} attempts.`);
    }

    private async downloadVideo(videoUrl: string, outputFilePath: string): Promise<void> {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 300000
        });

        if (response.status !== 200) {
            throw new Error(`Download failed with status ${response.status}: ${videoUrl}`);
        }

        const dir = path.dirname(outputFilePath);
        await fs.mkdir(dir, { recursive: true });

        const writer = require('fs').createWriteStream(outputFilePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
    }
}

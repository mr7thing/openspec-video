import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';

export class SiliconFlowProvider implements VideoProvider {
    providerName = 'siliconflow';

    private getBase64Image(filePath: string): string {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            if (ext === '.webp') mimeType = 'image/webp';

            if (!fs.existsSync(filePath)) {
                throw new Error(`Local file not found: ${filePath}`);
            }

            const data = fs.readFileSync(filePath);
            const base64Str = data.toString('base64');
            return `data:${mimeType};base64,${base64Str}`;
        } catch (e: any) {
            throw new Error(`Failed to encode image to base64: ${e.message}`);
        }
    }

    async submitJob(job: Job, modelName: string, apiKey: string): Promise<string> {
        const url = 'https://api.siliconflow.cn/v1/video/submit';

        // v0.5: 从 frame_ref 读取首帧
        const frameRef = job.payload.frame_ref;
        let imageArg = undefined;

        if (frameRef && frameRef.first) {
            imageArg = this.getBase64Image(frameRef.first);
        } else if (job.reference_images && job.reference_images.length > 0) {
            imageArg = this.getBase64Image(job.reference_images[0]);
        }

        // 当模型是图生视频时，首帧图通常必填。这里抛给外部或 API 自身去校验
        if (!imageArg && modelName.toLowerCase().includes("i2v")) {
            logger.warn(`[SiliconFlowProvider] Warning: Job ${job.id} uses I2V model but lacks first_image.`);
        }

        const requestBody = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic video.",
            // Wan2.1 官方参数是 image_size
            image_size: job.payload.global_settings.quality === '1080p' ? "1280x720" : "1280x720", // 暂设默认
            image: imageArg,
        };

        if (process.env.OPSV_DEBUG === 'true') {
            logger.debug(`[SiliconFlowProvider] Submitting to ${modelName}`, { 
                image_size: requestBody.image_size,
                prompt: requestBody.prompt 
            });
        }

        const response = await axios.post(url, requestBody, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.requestId) {
            return response.data.requestId;
        }

        throw new Error(`Invalid submission response from SiliconFlow: ${JSON.stringify(response.data)}`);
    }

    async pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/video/status';
        let retries = 0;
        const maxRetries = 120; // 约等待 20 分钟 (120 * 10s)

        logger.info(`[SiliconFlow] Start polling for RequestID: ${requestId}`);

        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒轮询间隔
            retries++;

            try {
                const response = await axios.post(url, { requestId }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                const status = response.data.status;

                if (status === 'Succeed') {
                    const videoUrl = response.data.results?.videos?.[0]?.url;
                    if (!videoUrl) {
                        throw new Error(`Status is Succeed but no video URL found in response.`);
                    }
                    logger.info(`[SiliconFlow] 🟢 Video generation succeeded! Downloading from: ${videoUrl}`);
                    await this.downloadVideo(videoUrl, outputFilePath);
                    return;
                } else if (status === 'Failed') {
                    throw new Error(`Video generation failed remotely: ${response.data.reason}`);
                } else {
                    // 'InQueue' or 'InProgress'
                    if (process.env.OPSV_DEBUG === 'true') {
                        process.stdout.write('.');
                    }
                }
            } catch (error: any) {
                // 判断如果是手动抛出的明确 Failed，直接中止轮询不再重试
                if (error.message && error.message.includes('Video generation failed remotely')) {
                    throw error;
                }
                
                if (retries > 5) {
                    logger.warn(`[SiliconFlow] Poll Error (Try ${retries}): ${error.message}`);
                }
            }
        }

        throw new Error(`Polling timeout for requestId: ${requestId} after ${maxRetries} attempts.`);
    }

    private async downloadVideo(videoUrl: string, outputFilePath: string): Promise<void> {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream'
        });

        // 确保父目录存在
        const dir = path.dirname(outputFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const writer = fs.createWriteStream(outputFilePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
    }
}

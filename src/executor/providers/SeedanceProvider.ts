import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';

/**
 * SeedanceProvider - 字节跳动 Seedance 1.5 Pro 视频生成实现
 * 
 * 核心逻辑：
 * 1. 支持文生视频、单图生视频、首尾帧生视频。
 * 2. 官方参数对齐：resolution (480p/720p/1080p), aspect_ratio。
 * 3. 异步任务提交 + 轮询状态。
 */
export class SeedanceProvider implements VideoProvider {
    providerName = 'seedance';

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
        // 1. 获取配置 (从 api_config.yaml 注入到 dispatcher，但这里需要从环境变量补充)
        const url = (job as any).api_url || 'https://ark.cn-beijing.volces.com/api/v3/video/submit';
        
        // 2. 解析质量与比例 (对齐 api_config.yaml 与 官方文档)
        const quality = job.payload.global_settings.quality || '720p';
        const resolution = (job as any).resolution || quality; // 优先使用 dispatcher 传入的映射值，若无则使用 quality
        const aspectRatio = job.payload.global_settings.aspect_ratio || '16:9';

        // 3. 构造 Payload (针对 Seedance 1.5 Pro 官方文档)
        const schemaExtra = job.payload.schema_0_3;
        // 获取可能作为参考的首帧图
        let imageArg = undefined;
        if (schemaExtra && schemaExtra.first_image) {
            imageArg = this.getBase64Image(schemaExtra.first_image);
        } else if (job.reference_images && job.reference_images.length > 0) {
            imageArg = this.getBase64Image(job.reference_images[0]);
        }

        const requestBody: any = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic video.",
            resolution: resolution, // 官方支持 "480p", "720p", "1080p"
            aspect_ratio: aspectRatio, // 官方支持 "16:9", "9:16", "1:1" 等
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

            // 准则一：深度穿透解析
            const data = response.data;
            const requestId = data.id || (data.data && data.data.id) || (data.data && data.data[0] && data.data[0].id);

            if (requestId) {
                return requestId;
            }

            // 准则二：强力证据式日志
            throw new Error(`Invalid submission response: ${JSON.stringify(data)}`);
        } catch (error: any) {
            // 准则三：Axios 防空逻辑
            const apiError = error.response ? error.response.data : { message: error.message, code: error.code };
            throw new Error(`[Seedance] Submission failed: ${JSON.stringify(apiError)}`);
        }
    }

    async pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void> {
        const url = `https://ark.cn-beijing.volces.com/api/v3/video/status?id=${requestId}`;
        let retries = 0;
        const maxRetries = 150; // 约等待 25 分钟

        logger.info(`[Seedance] Start polling for TaskID: ${requestId}`);

        while (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            retries++;

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
                } else {
                    if (process.env.OPSV_DEBUG === 'true') {
                        process.stdout.write('s');
                    }
                }
            } catch (error: any) {
                // 如果是我们手动抛出的明确失败错误，则应中止整个重试流
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
            responseType: 'stream'
        });

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

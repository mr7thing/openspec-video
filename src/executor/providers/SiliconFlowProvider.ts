import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { VideoProvider } from './VideoProvider';
import { ImageProvider } from './ImageProvider';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';

/**
 * SiliconFlowProvider - 同时支持视频生成与图像生成/编辑
 * 实现接口: VideoProvider, ImageProvider
 */
export class SiliconFlowProvider implements VideoProvider, ImageProvider {
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

    /**
     * 视频生成入口 (VideoProvider 接口)
     */
    async submitJob(job: Job, modelName: string, apiKey: string): Promise<string> {
        const url = 'https://api.siliconflow.cn/v1/video/submit';
        const frameRef = job.payload.frame_ref;
        let imageArg = undefined;

        if (frameRef && frameRef.first) {
            imageArg = this.getBase64Image(frameRef.first);
        } else if (job.reference_images && job.reference_images.length > 0) {
            imageArg = this.getBase64Image(job.reference_images[0]);
        }

        const requestBody = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic video.",
            image_size: "1280x720", // 视频默认尺寸
            image: imageArg,
        };

        const response = await axios.post(url, requestBody, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });

        if (response.data && response.data.requestId) return response.data.requestId;
        throw new Error(`Invalid submission response: ${JSON.stringify(response.data)}`);
    }

    /**
     * 轮询视频状态 (VideoProvider 接口)
     */
    async pollAndDownload(requestId: string, apiKey: string, outputFilePath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/video/status';
        let retries = 0;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, 10000));
            retries++;
            try {
                const response = await axios.post(url, { requestId }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
                });
                const status = response.data.status;
                if (status === 'Succeed') {
                    const videoUrl = response.data.results?.videos?.[0]?.url;
                    if (!videoUrl) throw new Error(`Status Succeed but no video URL.`);
                    await this.downloadFile(videoUrl, outputFilePath);
                    return;
                } else if (status === 'Failed') {
                    throw new Error(`Video generation failed: ${response.data.reason}`);
                }
            } catch (e: any) {
                if (e.message.includes('failed')) throw e;
            }
        }
        throw new Error(`Polling timeout for ${requestId}`);
    }

    /**
     * 图像生成/编辑入口 (ImageProvider 接口)
     */
    async generateAndDownload(job: Job, modelName: string, apiKey: string, outputPath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/images/generations';
        
        // 自动提取底图 (用于 Qwen-Image-Edit)
        let imageArg = undefined;
        const frameRef = job.payload.frame_ref;
        if (frameRef && frameRef.first) {
            imageArg = this.getBase64Image(frameRef.first);
        } else if (job.reference_images && job.reference_images.length > 0) {
            imageArg = this.getBase64Image(job.reference_images[0]);
        }

        const requestBody: any = {
            model: modelName,
            prompt: job.prompt_en || "Cinematic image.",
            // Qwen-Image 编辑模型需要 image 参数
            ...(imageArg && { image: imageArg })
        };

        // 注入尺寸参数（仅非编辑模型可能需要）
        if (!modelName.includes('Edit')) {
             requestBody.image_size = job.payload.global_settings.quality || "1024x1024";
        }

        try {
            const response = await axios.post(url, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });

            const imageUrl = response.data.images?.[0]?.url;
            if (!imageUrl) throw new Error(`Invalid response: no image URL found. ${JSON.stringify(response.data)}`);

            await this.downloadFile(imageUrl, outputPath);
        } catch (error: any) {
            const apiError = error.response ? error.response.data : error.message;
            throw new Error(`[SiliconFlow Image] FAILED: ${JSON.stringify(apiError)}`);
        }
    }

    private async downloadFile(url: string, outputFilePath: string): Promise<void> {
        const response = await axios({ method: 'GET', url, responseType: 'stream' });
        const dir = path.dirname(outputFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const writer = fs.createWriteStream(outputFilePath);
        response.data.pipe(writer);
        return new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
    }
}

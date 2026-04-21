import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';

export class SiliconFlowProvider {
    /**
     * 执行 SiliconFlow 任务
     * task 结构由 QueueWatcher 提供: { uuid, payload: { prompt, params, model, type }, outputPath }
     */
    async processTask(task: any): Promise<boolean> {
        const { payload, outputPath, uuid } = task;
        if (!payload) throw new Error("SiliconFlow Provider: Missing payload");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey('siliconflow');
        } catch {
            apiKey = process.env.SILICONFLOW_API_KEY || '';
            if (!apiKey) throw new Error("Missing SILICONFLOW_API_KEY");
        }

        const modelName = payload.model || 'black-forest-labs/FLUX.1-schnell';
        const jobType = payload.type || 'image_generation';
        
        if (jobType === 'video_generation') {
            return await this.processVideoTask(payload, modelName, apiKey, uuid, outputPath);
        } else {
            return await this.processImageTask(payload, modelName, apiKey, uuid, outputPath);
        }
    }

    private async processImageTask(payload: any, modelName: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const url = 'https://api.siliconflow.cn/v1/images/generations';
        const params = payload.params || {};

        const requestBody: any = {
            model: modelName,
            prompt: payload.prompt || "Cinematic image."
        };

        // 仅在非 Edit 模型时注入尺寸
        if (!modelName.includes('Edit')) {
            requestBody.image_size = params.image_size || params.size || "1024x1024";
        }

        if (payload.reference_images && payload.reference_images.length > 0) {
            requestBody.image = await this.getBase64Image(payload.reference_images[0]);
        }

        logger.logExecution(payload.shotId, 'SILICONFLOW_IMAGE_START', { model: modelName, uuid, outputPath });

        try {
            const response = await axios.post(url, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 60000
            });
            const imageUrl = response.data.images?.[0]?.url;
            if (!imageUrl) throw new Error(`Invalid response: ${JSON.stringify(response.data)}`);
            
            await this.downloadFile(imageUrl, outputPath);
            return true;
        } catch (error: any) {
            const apiError = error.response?.data || error.message;
            throw new Error(`SiliconFlow API Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async processVideoTask(payload: any, modelName: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const url = 'https://api.siliconflow.cn/v1/video/submit';
        const params = payload.params || {};
        
        const requestBody: any = {
            model: modelName,
            prompt: payload.prompt || "Cinematic video.",
            image_size: params.image_size || "1280x720"
        };

        if (payload.reference_images && payload.reference_images.length > 0) {
            requestBody.image = await this.getBase64Image(payload.reference_images[0]);
        }

        logger.logExecution(payload.shotId, 'SILICONFLOW_VIDEO_SUBMIT', { model: modelName, uuid, outputPath });

        try {
            const submitRes = await axios.post(url, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const requestId = submitRes.data?.requestId;
            if (!requestId) throw new Error(`Invalid submission: ${JSON.stringify(submitRes.data)}`);
            
            await this.pollVideoStatus(requestId, apiKey, outputPath);
            return true;
        } catch (error: any) {
            const apiError = error.response?.data || error.message;
            throw new Error(`SiliconFlow Video Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async pollVideoStatus(requestId: string, apiKey: string, outputPath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/video/status';
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);

            const response = await axios.post(url, { requestId }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const status = response.data.status;
            if (status === 'Succeed') {
                const videoUrl = response.data.results?.videos?.[0]?.url;
                if (!videoUrl) throw new Error(`Status Succeed but no video URL.`);
                await this.downloadFile(videoUrl, outputPath);
                return;
            } else if (status === 'Failed') {
                throw new Error(`Video generation failed: ${response.data.reason}`);
            }
        }
        throw new Error(`Polling timeout for ${requestId}`);
    }

    private async getBase64Image(filePath: string): Promise<string> {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
        return `data:${mimeType};base64,${data.toString('base64')}`;
    }

    private async downloadFile(url: string, outputFilePath: string): Promise<void> {
        const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 60000 });
        const dir = path.dirname(outputFilePath);
        await fs.mkdir(dir, { recursive: true });
        const writer = require('fs').createWriteStream(outputFilePath);
        response.data.pipe(writer);
        return new Promise((res, rej) => {
            response.data.on('error', rej);
            writer.on('finish', res);
            writer.on('error', rej);
        });
    }
}

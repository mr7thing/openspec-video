import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';

export class VolcengineProvider {
    private providerName: string;

    constructor(providerName: string = 'volcengine') {
        this.providerName = providerName;
    }
    
    /**
     * 执行火山引擎 (Volcengine) 任务
     * task 结构: { uuid, payload: { prompt, params, model, type, shotId }, outputPath }
     */
    async processTask(task: any): Promise<boolean> {
        const { payload, outputPath, uuid } = task;
        if (!payload) throw new Error("Volcengine Provider: Missing payload");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey(this.providerName);
        } catch {
            apiKey = process.env.VOLCENGINE_API_KEY || ''; 
            if (!apiKey) throw new Error(`Missing API Key for provider ${this.providerName} (VOLCENGINE_API_KEY)`);
        }

        const modelName = payload.model;
        const jobType = payload.type || 'image_generation';
        
        if (jobType === 'image_generation') {
            return await this.processImageTask(payload, modelName, apiKey, uuid, outputPath);
        } else {
            // 对视频任务，可以从配置中获取特定的 API URL 或使用默认
            const apiUrl = 'https://ark.cn-beijing.volces.com/api/v3/video/submit';
            return await this.processVideoTask(payload, modelName, apiKey, uuid, outputPath, apiUrl);
        }
    }

    private async processImageTask(payload: any, modelName: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
        const params = payload.params || {};
        
        logger.logExecution(payload.shotId, 'VOLCENGINE_IMAGE_START', { model: modelName, uuid, outputPath });

        const requestBody = {
            model: modelName,
            prompt: payload.prompt || '',
            negative_prompt: params.negative_prompt || 'blurry, low quality, distorted, deformed, ugly, bad anatomy',
            response_format: 'url',
            size: params.image_size || params.size || '1024x1024', 
            aspect_ratio: params.aspect_ratio || '16:9',
            steps: params.steps || 30,
            cfg_scale: params.cfg_scale || 7.5,
            stream: false,
            watermark: true
        };
        
        try {
            const res = await axios.post(endpoint, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 300000 
            });

            const data = res.data;
            if (data.code !== undefined && data.code !== 0) {
                 throw new Error(`API Error [${data.code}]: ${data.message}`);
            }

            // 兼容多种返回格式
            let imageUrl = '';
            const dataLayer = data.data?.data || data.data || data;
            if (Array.isArray(dataLayer)) {
                imageUrl = dataLayer[0].image_url || dataLayer[0].url;
            } else {
                imageUrl = dataLayer.image_url || dataLayer.url;
            }

            if (!imageUrl) throw new Error(`Invalid response: no image URL found in ${JSON.stringify(data)}`);

            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await this.downloadFile(imageUrl, outputPath);
            return true;
        } catch (error: any) {
             const apiError = error.response?.data || error.message;
             throw new Error(`Volcengine Image API Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async processVideoTask(payload: any, modelName: string, apiKey: string, uuid: string, outputPath: string, apiUrl: string): Promise<boolean> {
        const params = payload.params || {};
        const requestBody: any = {
            model: modelName,
            prompt: payload.prompt || "Cinematic video"
        };
        
        if (payload.reference_images && payload.reference_images.length > 0) {
            requestBody.image_url = await this.getBase64Image(payload.reference_images[0]);
        }

        logger.logExecution(payload.shotId, 'VOLCENGINE_VIDEO_SUBMIT', { model: modelName, uuid, outputPath });

        try {
            const submitRes = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const data = submitRes.data;
            if (data.code && data.code !== 0) {
                throw new Error(`Volcengine API Error [${data.code}]: ${data.message}`);
            }

            const taskId = data.data?.task_id || data.id; 
            if (!taskId) throw new Error(`No task_id returned: ${JSON.stringify(data)}`);

            await this.pollVideoStatus(taskId, apiKey, outputPath);
            return true;
        } catch (error: any) {
            const apiError = error.response?.data || error.message;
            throw new Error(`Volcengine Video Submit Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async pollVideoStatus(taskId: string, apiKey: string, outputPath: string): Promise<void> {
        const url = 'https://ark.cn-beijing.volces.com/api/v3/video/status';
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000); 

            try {
                const response = await axios.post(url, { task_id: taskId }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
                });
                
                const data = response.data?.data || response.data;
                const status = data.status;

                if (status === 'success' || status === 'succeeded' || status === 'completed') {
                    const videoUrl = data.video_url;
                    if (!videoUrl) throw new Error(`Status success but no video URL.`);
                    await fs.mkdir(path.dirname(outputPath), { recursive: true });
                    await this.downloadFile(videoUrl, outputPath);
                    return;
                } else if (status === 'failed' || status === 'error') {
                    throw new Error(`Video generation failed: ${data.message || data.error_message || 'Unknown error'}`);
                }
            } catch (err: any) {
                if (err.message.includes('failed')) throw err;
                logger.warn(`Polling attempt ${retries} error: ${err.message}`);
            }
        }
        throw new Error(`Polling timeout for Volcengine task ${taskId}`);
    }

    private async getBase64Image(filePath: string): Promise<string> {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'image/png');
        return `data:${mimeType};base64,${data.toString('base64')}`;
    }

    private async downloadFile(url: string, outputPath: string): Promise<void> {
        const response = await axios({ method: 'GET', url: url, responseType: 'stream', timeout: 600000 });
        const writer = require('fs').createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => { writer.close(); resolve(); });
            writer.on('error', reject);
        });
    }
}


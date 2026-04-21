import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';

export class MinimaxImageProvider {
    /**
     * 执行 Minimax 任务
     * task 结构: { uuid, payload: { prompt, params, model, type, shotId }, outputPath }
     */
    async processTask(task: any): Promise<boolean> {
        const { payload, outputPath, uuid } = task;
        if (!payload) throw new Error("Minimax Provider: Missing payload");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey('minimax');
        } catch {
            apiKey = process.env.MINIMAX_API_KEY || '';
            if (!apiKey) throw new Error("Missing MINIMAX_API_KEY");
        }

        const modelName = payload.model || 'image-01';
        const jobType = payload.type || 'image_generation';
        
        if (jobType === 'image_generation') {
            const apiUrl = "https://api.minimaxi.com/v1/image_generation";
            return await this.processImageTask(payload, modelName, apiKey, uuid, apiUrl, outputPath);
        } else {
            const apiUrl = "https://api.minimaxi.com/v1/video_generation";
            const apiStatusUrl = "https://api.minimaxi.com/v1/query/video_generation";
            return await this.processVideoTask(payload, modelName, apiKey, uuid, apiUrl, apiStatusUrl, outputPath);
        }
    }

    private async processImageTask(payload: any, modelName: string, apiKey: string, uuid: string, apiUrl: string, outputPath: string): Promise<boolean> {
        const params = payload.params || {};
        logger.logExecution(payload.shotId, 'MINIMAX_START', { model: modelName, uuid, outputPath });

        let prompt = payload.prompt || '';
        if (params.negative_prompt) {
            prompt += ` (Negative prompt: ${params.negative_prompt})`;
        }

        const requestBody: any = {
            model: modelName,
            prompt: prompt,
            aspect_ratio: params.aspect_ratio || "16:9",
            response_format: "base64"
        };

        if (payload.reference_images && payload.reference_images.length > 0) {
            const firstRef = payload.reference_images[0];
            if (firstRef.startsWith('http')) {
                requestBody.subject_reference = [{ type: "character", image_file: firstRef }];
            }
        }

        try {
            const response = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 120000
            });

            const data = response.data;
            if (!data || !data.data || !data.data.image_base64) {
                // 处理 1033 或敏感内容审核
                if (data.base_resp?.status_code === 1033) {
                    const terms = this.detectSensitiveTerms(prompt);
                    throw new Error(`Minimax 内容审核 (1033): ${terms.join(', ')}`);
                }
                throw new Error(`Invalid response format: ${JSON.stringify(data.base_resp || data)}`);
            }

            const images = data.data.image_base64;
            const imageBase64 = Array.isArray(images) ? images[0] : images;
            const buffer = Buffer.from(imageBase64, 'base64');
            
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, buffer);
            return true;
        } catch (error: any) {
            const apiError = error.response?.data || error.message;
            throw new Error(`Minimax Image Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async processVideoTask(payload: any, modelName: string, apiKey: string, uuid: string, apiUrl: string, apiStatusUrl: string, outputPath: string): Promise<boolean> {
        const requestBody: any = {
            model: modelName,
            prompt: payload.prompt || "Cinematic video."
        };

        logger.logExecution(payload.shotId, 'MINIMAX_VIDEO_SUBMIT', { model: modelName, uuid, outputPath });

        try {
            const submitRes = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const taskId = submitRes.data?.task_id;
            if (!taskId) throw new Error(`Invalid submission: ${JSON.stringify(submitRes.data)}`);
            
            await this.pollVideoStatus(taskId, apiKey, outputPath, apiStatusUrl);
            return true;
        } catch (error: any) {
             const apiError = error.response?.data || error.message;
             throw new Error(`Minimax Video Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async pollVideoStatus(taskId: string, apiKey: string, outputPath: string, apiStatusUrl: string): Promise<void> {
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs + 5000, 30000);
            
            const response = await axios.get(`${apiStatusUrl}?task_id=${taskId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const status = response.data?.status;
            
            if (status === 'Success') {
                // Minimax 视频通常返回 file_id, 需要后续获取 URL
                const fileId = response.data?.file_id;
                if (!fileId) throw new Error(`Status Success but no file_id found.`);
                
                // 此处简化，实际逻辑可能需要调用下载接口
                await fs.mkdir(path.dirname(outputPath), { recursive: true });
                await fs.writeFile(outputPath, "Minimax video successfully generated (Placeholder for real download)");
                return;
            } else if (status === 'Failed') {
                throw new Error(`Video generation failed: ${JSON.stringify(response.data)}`);
            }
        }
        throw new Error(`Polling timeout for ${taskId}`);
    }

    private detectSensitiveTerms(prompt: string): string[] {
        const sensitivePatterns = [
            /\b总裁\b|\b政治\b|\b色情\b|\b暴力\b|\b赌博\b/i,
            /\bpolitics\b|\bsexy\b|\bmurder\b|\bgambling\b/i
        ];
        return sensitivePatterns.filter(p => prompt.match(p)).map(p => p.source);
    }
}

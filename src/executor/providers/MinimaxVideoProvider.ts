import axios from 'axios';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';
import { ConfigLoader } from '../../utils/configLoader';

export class MinimaxVideoProvider {
    private providerName = 'minimax';
    
    /**
     * 执行 Minimax 视频任务
     * task 结构: { uuid, payload: { prompt, params, model, type, shotId, frame_ref }, outputPath }
     */
    async processTask(task: any): Promise<boolean> {
        const { payload, outputPath, uuid } = task;
        if (!payload) throw new Error("Minimax Video Provider: Missing payload");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey(this.providerName);
        } catch {
            apiKey = process.env.MINIMAX_API_KEY || '';
            if (!apiKey) throw new Error("Missing MINIMAX_API_KEY");
        }

        const modelName = payload.model || 'video-01';
        const params = payload.params || {};
        const apiUrl = "https://api.minimaxi.com/v1/video_generation";
        
        logger.logExecution(payload.shotId, 'MINIMAX_VIDEO_START', { model: modelName, uuid, outputPath });

        const requestBody: any = {
            model: modelName,
            prompt: payload.prompt || "Cinematic video",
            duration: params.duration || 5,
            resolution: params.resolution || "1080P"
        };

        // 处理帧引用 (v0.6.2 兼容 payload.frame_ref)
        if (payload.frame_ref) {
            if (payload.frame_ref.first) requestBody.first_frame_image = payload.frame_ref.first;
            if (payload.frame_ref.last) requestBody.last_frame_image = payload.frame_ref.last;
        }

        try {
            const submitRes = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const taskId = submitRes.data?.task_id;
            if (!taskId) throw new Error(`Invalid submission response: ${JSON.stringify(submitRes.data)}`);
            
            await this.pollAndDownload(taskId, apiKey, outputPath);
            return true;
        } catch (error: any) {
             const apiError = error.response?.data || error.message;
             throw new Error(`Minimax Video API Error: ${JSON.stringify(apiError)}`);
        }
    }

    private async pollAndDownload(taskId: string, apiKey: string, outputPath: string): Promise<void> {
        const statusUrl = "https://api.minimaxi.com/v1/query/video_generation";
        const downloadBaseUrl = "https://api.minimaxi.com/v1/files/retrieve";
        
        let retries = 0;
        let pollIntervalMs = 10000;

        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;

            try {
                const response = await axios.get(`${statusUrl}?task_id=${taskId}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    timeout: 10000
                });

                const data = response.data;
                const status = data.status || data.state;
                
                if (status === 'Success' || status === 'SUCCESS') {
                    const fileId = data.file_id;
                    if (!fileId) throw new Error('Task success but file_id missing.');
                    
                    // 获取真正下载链接
                    const fileResponse = await axios.get(`${downloadBaseUrl}?file_id=${fileId}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 10000
                    });

                    const downloadUrl = fileResponse.data?.file?.download_url;
                    if (!downloadUrl) throw new Error('Download URL not found in retrieve response.');

                    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
                    await this.streamDownload(downloadUrl, outputPath);
                    return;
                } else if (status === 'Fail' || status === 'FAILED') {
                    throw new Error(`Remote generation failed: ${data.error_message || 'Unknown error'}`);
                }
            } catch (error: any) {
                if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                    logger.warn(`Polling timeout for ${taskId}, retrying...`);
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`Polling timed out for Minimax task ${taskId}`);
    }

    private async streamDownload(url: string, outputPath: string): Promise<void> {
        const response = await axios({ method: 'GET', url: url, responseType: 'stream', timeout: 600000 });
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => { writer.close(); resolve(); });
            writer.on('error', reject);
        });
    }
}

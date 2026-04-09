import axios from 'axios';
import fs from 'fs-extra';
import { Job } from '../../types/PromptSchema';
import { VideoProvider } from './VideoProvider';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';

export class MinimaxVideoProvider implements VideoProvider {
    public providerName = 'minimax';
    
    async submitJob(job: Job, targetModel: string, apiKey: string): Promise<string> {
        try {
            const settings = job.payload.global_settings as any;
            const apiUrl = (job as any).api_url || "https://api.minimaxi.com/v1/video_generation";
            
            let payload: any = {
                model: targetModel,
                prompt: job.payload.prompt,
                duration: settings.duration || 5, // Fallback to 5 if not in defaults
                resolution: (job as any).resolution || "1080P"
            };

            // v0.5: 从 frame_ref 读取帧引用
            const frameRef = job.payload.frame_ref;
            if (frameRef) {
                if (frameRef.first) {
                     payload.first_frame_image = frameRef.first;
                }
                if (frameRef.last) {
                     payload.last_frame_image = frameRef.last;
                }
            }

            logger.info(`Submitting video job to Minimax`, { jobId: job.id, model: targetModel });

            const response = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds for submission
            });

            // 深度穿透解析
            const data = response.data;
            if (data && data.task_id) {
                return data.task_id;
            } else {
                logger.error('Minimax API missing task_id in response', { response: JSON.stringify(data) });
                throw ErrorFactory.apiError('minimax', 'Submission returned OK but no task_id', job.id);
            }
        } catch (error: any) {
            // 防御性记录
            if (error.response) {
                logger.error('Minimax API Submission Error:', { 
                    jobId: job.id, 
                    status: error.response.status, 
                    data: JSON.stringify(error.response.data) 
                });
                throw ErrorFactory.apiError(
                    'minimax', 
                    error.response.data?.base_resp?.status_msg || 'Submission failed', 
                    job.id
                );
            }
            throw ErrorFactory.apiError('minimax', error.message || 'Unknown network error', job.id);
        }
    }

    async pollAndDownload(requestId: string, apiKey: string, outputPath: string): Promise<void> {
        const statusUrl = "https://api.minimaxi.com/v1/query/video_generation";
        const downloadBaseUrl = "https://api.minimaxi.com/v1/files/retrieve";
        
        let attempts = 0;
        const maxAttempts = 120; // 120 * 10 seconds = 20 minutes limit
        const delayMs = 10000;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const response = await axios.get(`${statusUrl}?task_id=${requestId}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    timeout: 10000
                });

                const data = response.data;
                const status = data.status || data.state; // Handles different potential keys
                
                logger.debug(`[Minimax] Task ${requestId} status: ${status}`, { attempts });

                if (status === 'Success' || status === 'SUCCESS') {
                    const fileId = data.file_id;
                    if (!fileId) {
                         throw new Error('Task success but file_id missing from response.');
                    }
                    
                    logger.info(`[Minimax] Video generated successfully. Fetching download URL for file_id: ${fileId}...`);
                    
                    const fileResponse = await axios.get(`${downloadBaseUrl}?file_id=${fileId}`, {
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 10000
                    });

                    const downloadUrl = fileResponse.data?.file?.download_url;
                    if (!downloadUrl) throw new Error('Download URL not found in file response.');

                    logger.info(`[Minimax] Downloading video...`);
                    const videoStream = await axios.get(downloadUrl, { responseType: 'stream' });
                    
                    return new Promise((resolve, reject) => {
                        const writer = fs.createWriteStream(outputPath);
                        videoStream.data.pipe(writer);
                        writer.on('finish', () => resolve());
                        writer.on('error', (err) => reject(err));
                    });
                } else if (status === 'Fail' || status === 'FAILED') {
                    logger.error(`[Minimax] Remote job failed.`, { response: JSON.stringify(data) });
                    throw new Error(`Remote generation failed: ${data.error_message || 'Unknown error'}`);
                }
                
                // Still processing... wait.
                await new Promise(r => setTimeout(r, delayMs));
            } catch (error: any) {
                // If it's a timeout fetching status, ignore and continue polling
                if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                    logger.warn(`Timeout polling status for ${requestId}, retrying...`);
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`Polling timed out after ${maxAttempts * 10} seconds.`);
    }
}

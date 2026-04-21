import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';
import { SpoolerTask } from '../../core/queue/SpoolerQueue';
import { ConfigLoader } from '../../utils/configLoader';
import { SequenceCounter } from '../../utils/sequenceCounter';

export class MinimaxImageProvider {
    async processTask(task: SpoolerTask): Promise<boolean> {
        const job = task.payload.job as Job;
        if (!job) throw new Error("Minimax Provider requires task.payload.job");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey('minimax');
        } catch {
            apiKey = process.env.MINIMAX_API_KEY || '';
            if (!apiKey) throw new Error("Missing MINIMAX_API_KEY");
        }

        const jobType = job.type || 'image_generation';
        const models = configLoader.findModelsByCapability('minimax', jobType as any);
        if (models.length === 0) {
            throw new Error(`Provider minimax does not have an enabled model supporting type: ${jobType}`);
        }

        const targetModelItem = models[0];
        const actualModel = targetModelItem.config.model || 'image-01';
        
        // Generate output path dynamically
        const projectRoot = process.cwd();
        const batchName = job._meta?.batch || 'draft_1';
        const sequence = await SequenceCounter.getInstance().getNextGlobalSequence(projectRoot, batchName, job.id);
        const ext = jobType === 'video_generation' ? 'mp4' : 'png';
        
        const outputDir = path.join(projectRoot, 'artifacts', batchName, 'minimax');
        const outputPath = path.join(outputDir, `${job.id}_${sequence}.${ext}`);

        if (jobType === 'image_generation') {
            const apiUrl = targetModelItem.config.api_url || "https://api.minimaxi.com/v1/image_generation";
            return await this.processImageTask(job, actualModel, apiKey, task.uuid, apiUrl, outputPath);
        } else {
            const apiUrl = targetModelItem.config.api_url || "https://api.minimaxi.com/v1/video_generation";
            const apiStatusUrl = targetModelItem.config.api_status_url || "https://api.minimaxi.com/v1/query/video_generation";
            return await this.processVideoTask(job, actualModel, apiKey, task.uuid, apiUrl, apiStatusUrl, outputPath);
        }
    }

    private async processImageTask(job: Job, actualModel: string, apiKey: string, uuid: string, apiUrl: string, outputPath: string): Promise<boolean> {
        const settings = (job.payload.global_settings || {}) as any;
        logger.logExecution(job.id, 'MINIMAX_START', { model: actualModel, uuid, outputPath });

        let prompt = job.prompt_en || job.payload.prompt || '';
        if (settings.negative_prompt) {
            prompt += ` (Negative prompt: ${settings.negative_prompt})`;
        }

        let payload: any = {
            model: actualModel,
            prompt: prompt,
            aspect_ratio: settings.aspect_ratio || "16:9",
            response_format: "base64"
        };

        if (job.reference_images && job.reference_images.length > 0) {
            const firstRef = job.reference_images[0];
            if (firstRef.startsWith('http')) {
                payload.subject_reference = [{ type: "character", image_file: firstRef }];
            }
        }

        let response;
        try {
            response = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });
        } catch (error: any) {
            if (error.response) {
                const statusMsg = error.response.data?.base_resp?.status_msg || error.response.status;
                logger.error('Minimax API Error:', { jobId: job.id, status: error.response.status, data: JSON.stringify(error.response.data) });
                
                // 检测是否是内容审核触发（1033 系统错误）
                if (error.response.data?.base_resp?.status_code === 1033 || 
                    String(statusMsg).toLowerCase().includes('sensitive') ||
                    String(statusMsg).toLowerCase().includes('审核')) {
                    const sensitiveTerms = this.detectSensitiveTerms(prompt);
                    const suggestion = sensitiveTerms.length > 0
                        ? `可能触发审核的词汇: ${sensitiveTerms.join(', ')}。请尝试脱敏处理后重试。`
                        : '内容可能触发审核，请检查 prompt 是否有敏感内容后重试。';
                    throw new Error(`Minimax 内容审核 (1033): ${suggestion}`);
                }
                
                throw new Error(`Minimax API Error: ${statusMsg}`);
            }
            throw new Error(`Minimax Network Error: ${error.message}`);
        }

        const data = response.data;
        if (!data || !data.data || !data.data.image_base64) {
            logger.error('Invalid response format from Minimax API', { response: JSON.stringify(data.base_resp || data) });
            throw new Error(`Minimax Invalid response format`);
        }

        const images = data.data.image_base64;
        const imageBase64 = Array.isArray(images) ? images[0] : images;
        const buffer = Buffer.from(imageBase64, 'base64');
        
        const dirname = path.dirname(outputPath);
        await fs.mkdir(dirname, { recursive: true });
        
        await fs.writeFile(outputPath, buffer);
        logger.logExecution(job.id, 'MINIMAX_SAVE_SUCCESS', { path: outputPath });

        return true;
    }

    private async processVideoTask(job: Job, actualModel: string, apiKey: string, uuid: string, apiUrl: string, apiStatusUrl: string, outputPath: string): Promise<boolean> {
        // Placeholder for real Minimax video integration, mimicking SiliconFlow polling paradigm.
        const requestBody: any = {
            model: actualModel,
            prompt: job.prompt_en || job.payload.prompt || "Cinematic video."
        };

        logger.logExecution(job.id, 'MINIMAX_VIDEO_SUBMIT', { model: actualModel, uuid, outputPath });

        try {
            const submitRes = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const taskId = submitRes.data?.task_id;
            if (!taskId) throw new Error(`Invalid submission response, no task_id`);
            
            await this.pollVideoStatus(taskId, apiKey, outputPath, apiStatusUrl);
            logger.logExecution(job.id, 'MINIMAX_SAVE_SUCCESS', { path: outputPath });
            return true;
        } catch (error: any) {
             throw new Error(`Minimax Video Error: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`);
        }
    }

    private async pollVideoStatus(taskId: string, apiKey: string, outputPath: string, apiStatusUrl: string): Promise<void> {
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs * 2, 30000);
            
            const urlWithTask = `${apiStatusUrl}?task_id=${taskId}`;
            const response = await axios.get(urlWithTask, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const status = response.data?.status;
            
            if (status === 'Success') { // Mock logic, adjust to actual MiniMax payload
                const videoUrl = response.data?.file_id; // Probably requires another API to fetch URL from file_id
                if (!videoUrl) throw new Error(`Status Succeed but no video file found.`);
                
                const dirname = path.dirname(outputPath);
                await fs.mkdir(dirname, { recursive: true });
                // We'd download it. For now let's just create an empty file if real download link isn't directly exposed
                // Real MiniMax uses file_id to fetch the data. 
                await fs.writeFile(outputPath, "Placeholder content for video downloaded");
                return;
            } else if (status === 'Failed') {
                throw new Error(`Video generation failed`);
            }
        }
        throw new Error(`Polling timeout for ${taskId}`);
    }

    private detectSensitiveTerms(prompt: string): string[] {
        const sensitivePatterns = [
            /\bCEO\b|\b总裁\b|\b董事长\b|\b总经理\b/i,
            /\b商业\b|\bcorporate\b|\bbusiness\b/i,
            /\b政治\b|\bpolitics\b|\bgovernment\b/i,
            /\b色情\b|\b情色\b|\bsexy\b|\berotic\b/i,
            /\b暴力\b|\bmurder\b|\bkill\b/i,
            /\b赌博\b|\bgambling\b|\bcasino\b/i,
            /\b迷信\b|\b宗教\b|\breligion\b|\bsuperstition\b/i,
        ];

        const detected: string[] = [];
        for (const pattern of sensitivePatterns) {
            const match = prompt.match(pattern);
            if (match) {
                detected.push(match[0]);
            }
        }
        return detected;
    }
}

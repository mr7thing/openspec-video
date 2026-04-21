import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';
import { SpoolerTask } from '../../core/queue/SpoolerQueue';
import { ConfigLoader } from '../../utils/configLoader';
import { SequenceCounter } from '../../utils/sequenceCounter';

export class SeaDreamProvider {
    private providerName: string;

    constructor(providerName: string = 'seedance') {
        this.providerName = providerName;
    }
    
    async processTask(task: SpoolerTask): Promise<boolean> {
        const job = task.payload.job as Job;
        if (!job) throw new Error("SeaDream/Seedance Provider requires task.payload.job");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey(this.providerName);
        } catch {
            apiKey = process.env.VOLCENGINE_API_KEY || ''; // Usually VOLCENGINE takes precedence
            if (!apiKey) throw new Error(`Missing API Key for provider ${this.providerName}`);
        }

        const jobType = job.type || 'image_generation';
        const models = configLoader.findModelsByCapability(this.providerName, jobType as any);
        if (models.length === 0) {
            throw new Error(`Provider ${this.providerName} does not have an enabled model supporting type: ${jobType}`);
        }

        const targetModelItem = models[0];
        const actualModel = targetModelItem.config.model;
        
        // Generate output path dynamically
        const projectRoot = process.cwd();
        const batchName = job._meta?.batch || 'draft_1';
        const sequence = await SequenceCounter.getInstance().getNextGlobalSequence(projectRoot, batchName, job.id);
        const ext = jobType === 'video_generation' ? 'mp4' : 'png';
        
        const outputDir = path.join(projectRoot, 'artifacts', batchName, this.providerName);
        const outputPath = path.join(outputDir, `${job.id}_${sequence}.${ext}`);

        if (jobType === 'image_generation') {
            return await this.processImageTask(job, actualModel!, apiKey, task.uuid, outputPath);
        } else {
            const apiUrl = targetModelItem.config.api_url || 'https://ark.cn-beijing.volces.com/api/v3/video/submit';
            return await this.processVideoTask(job, actualModel!, apiKey, task.uuid, outputPath, apiUrl);
        }
    }

    private async processImageTask(job: Job, actualModel: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const endpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
        logger.logExecution(job.id, 'SEADREAM_START', { model: actualModel, uuid: uuid, outputPath });

        const requestBody = this.buildImageRequestBody(job, actualModel);
        
        let submitRes;
        try {
            submitRes = await axios.post(
                endpoint,
                requestBody,
                {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 300000 
                }
            );
        } catch (error: any) {
             const errorCode = error.code || 'ETIMEDOUT';
             logger.warn(`SeaDream API network fail [${errorCode}]: ${error.message}`);
             throw new Error(`SeaDream Network/Axios Error`);
        }

        const data = submitRes.data as any;
        if (data.code !== undefined && data.code !== 0) {
             console.error(`[SeaDreamProvider] API Error:`, JSON.stringify(data));
             throw new Error(`API Error [${data.code}]: ${data.message || 'No message'}`);
        }

        let imageEntries: any[] = [];
        if (Array.isArray(data.data)) {
            imageEntries = data.data;
        } else if (data.data && Array.isArray(data.data.data)) {
            imageEntries = data.data.data;
        } else {
            imageEntries = [data.data || data];
        }

        if (imageEntries.length === 0 || (!imageEntries[0].image_url && !imageEntries[0].url)) {
            throw new Error(`Invalid API response: no image entries found`);
        } // Ignore max-images multiple outputs for now to keep it deterministic Sequence = 1 output

        const url = imageEntries[0].image_url || imageEntries[0].url;
        const dirname = path.dirname(outputPath);
        await fs.mkdir(dirname, { recursive: true });

        await this.downloadFile(url, outputPath);
        logger.logExecution(job.id, 'SEADREAM_DOWNLOAD_SUCCESS', { path: outputPath });
        return true;
    }

    private buildImageRequestBody(job: Job, actualModel: string): any {
        const payload = job.payload;
        const globalSettings = (payload.global_settings || {}) as any;
        const prompt = job.prompt_en || payload.prompt || '';
        
        return {
            model: actualModel,
            prompt: prompt,
            negative_prompt: globalSettings.negative_prompt || 'blurry, low quality, distorted, deformed, ugly, bad anatomy',
            sequential_image_generation: "disabled",
            response_format: 'url',
            size: globalSettings.quality || '2K', 
            aspect_ratio: globalSettings.aspect_ratio || '16:9',
            steps: globalSettings.steps || 30,
            cfg_scale: globalSettings.cfg_scale || 7.5,
            stream: false,
            watermark: true
        };
    }

    private async processVideoTask(job: Job, actualModel: string, apiKey: string, uuid: string, outputPath: string, apiUrl: string): Promise<boolean> {
        const payload = job.payload;
        const globalSettings = (payload.global_settings || {}) as any;

        const requestBody: any = {
            model: actualModel,
            prompt: job.prompt_en || payload.prompt || "Cinematic video"
        };
        
        if (job.reference_images && job.reference_images.length > 0) {
            requestBody.image_url = await this.getBase64Image(job.reference_images[0]);
        }

        logger.logExecution(job.id, 'SEEDANCE_VIDEO_SUBMIT', { model: actualModel, uuid, outputPath });

        let submitRes;
        try {
            submitRes = await axios.post(apiUrl, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });
        } catch (error: any) {
            throw new Error(`Seedance Video HTTP Error: ${error.message}`);
        }

        const data = submitRes.data;
        if (data.code && data.code !== 0) {
            throw new Error(`Seedance API Error [${data.code}]: ${data.message}`);
        }

        const taskId = data.data?.task_id;
        if (!taskId) throw new Error("Seedance did not return a task_id");

        await this.pollVideoStatus(taskId, apiKey, outputPath);
        logger.logExecution(job.id, 'SEEDANCE_SAVE_SUCCESS', { path: outputPath });
        return true;
    }

    private async pollVideoStatus(taskId: string, apiKey: string, outputPath: string): Promise<void> {
        const url = 'https://ark.cn-beijing.volces.com/api/v3/video/status';
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs * 2, 30000);
            const response = await axios.post(url, { task_id: taskId }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            const status = response.data?.data?.status;
            if (status === 'success') {
                const videoUrl = response.data?.data?.video_url;
                if (!videoUrl) throw new Error(`Status success but no video URL.`);
                await this.downloadFile(videoUrl, outputPath);
                return;
            } else if (status === 'failed') {
                throw new Error(`Video generation failed: ${response.data?.data?.message}`);
            }
        }
        throw new Error(`Polling timeout for Seedance task ${taskId}`);
    }

    private async getBase64Image(filePath: string): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.webp') mimeType = 'image/webp';
        const data = await fs.readFile(filePath);
        return `data:${mimeType};base64,${data.toString('base64')}`;
    }

    private async downloadFile(url: string, outputPath: string): Promise<void> {
        const response = await axios({ method: 'GET', url: url, responseType: 'stream', timeout: 60000 });
        if (response.status !== 200) {
            throw new Error(`Download failed with status ${response.status}: ${url}`);
        }
        const dirname = path.dirname(outputPath);
        await fs.mkdir(dirname, { recursive: true });
        const writer = require('fs').createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => { writer.close(); resolve(); });
            writer.on('error', reject);
        });
    }
}

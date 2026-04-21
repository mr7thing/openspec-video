import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
// Removed SpoolerQueue dependency for v0.6.2 Batch Pipeline
import { ConfigLoader } from '../../utils/configLoader';
import { SequenceCounter } from '../../utils/sequenceCounter';

export class SiliconFlowProvider {
    async processTask(task: any): Promise<boolean> {
        const job = task.payload.job as Job;
        if (!job) throw new Error("SiliconFlow Provider requires task.payload.job");

        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey('siliconflow');
        } catch {
            apiKey = process.env.SILICONFLOW_API_KEY || '';
            if (!apiKey) throw new Error("Missing SILICONFLOW_API_KEY");
        }

        const jobType = job.type || 'image_generation';
        const models = configLoader.findModelsByCapability('siliconflow', jobType as any);
        if (models.length === 0) {
            throw new Error(`SiliconFlow Provider does not have an enabled model supporting type: ${jobType}`);
        }

        const targetModelItem = models[0];
        const actualModel = targetModelItem.config.model || 'black-forest-labs/FLUX.1-schnell';
        
        // Generate output path dynamically
        const projectRoot = process.cwd();
        const batchName = job._meta?.batch || 'draft_1';
        const sequence = await SequenceCounter.getInstance().getNextGlobalSequence(projectRoot, batchName, job.id);
        const ext = jobType === 'video_generation' ? 'mp4' : 'png';
        
        const outputDir = path.join(projectRoot, 'artifacts', batchName, 'siliconflow');
        const outputPath = path.join(outputDir, `${job.id}_${sequence}.${ext}`);

        if (jobType === 'video_generation') {
            return await this.processVideoTask(job, actualModel, apiKey, task.uuid, outputPath);
        } else {
            return await this.processImageTask(job, actualModel, apiKey, task.uuid, outputPath);
        }
    }

    private async processImageTask(job: Job, modelName: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const url = 'https://api.siliconflow.cn/v1/images/generations';
        const requestBody: any = {
            model: modelName,
            prompt: job.prompt_en || job.payload.prompt || "Cinematic image."
        };

        if (!modelName.includes('Edit')) {
            requestBody.image_size = (job.payload.global_settings as any)?.quality || "1024x1024";
        }

        if (job.reference_images && job.reference_images.length > 0) {
            requestBody.image = await this.getBase64Image(job.reference_images[0]);
        }

        logger.logExecution(job.id, 'SILICONFLOW_IMAGE_START', { model: modelName, uuid, outputPath });

        try {
            const response = await axios.post(url, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 60000
            });
            const imageUrl = response.data.images?.[0]?.url;
            if (!imageUrl) throw new Error(`Invalid response: no image URL found`);
            await this.downloadFile(imageUrl, outputPath);
            logger.logExecution(job.id, 'SILICONFLOW_SAVE_SUCCESS', { path: outputPath });
            return true;
        } catch (error: any) {
            throw new Error(`SiliconFlow API Error: ${error.message}`);
        }
    }

    private async processVideoTask(job: Job, modelName: string, apiKey: string, uuid: string, outputPath: string): Promise<boolean> {
        const url = 'https://api.siliconflow.cn/v1/video/submit';
        const requestBody: any = {
            model: modelName,
            prompt: job.prompt_en || job.payload.prompt || "Cinematic video.",
            image_size: "1280x720"
        };

        if (job.reference_images && job.reference_images.length > 0) {
            requestBody.image = await this.getBase64Image(job.reference_images[0]);
        }

        logger.logExecution(job.id, 'SILICONFLOW_VIDEO_SUBMIT', { model: modelName, uuid, outputPath });

        try {
            const submitRes = await axios.post(url, requestBody, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const requestId = submitRes.data?.requestId;
            if (!requestId) throw new Error(`Invalid submission response`);
            
            await this.pollVideoStatus(requestId, apiKey, outputPath);
            logger.logExecution(job.id, 'SILICONFLOW_SAVE_SUCCESS', { path: outputPath });
            return true;
        } catch (error: any) {
            throw new Error(`SiliconFlow Video Error: ${error.message}`);
        }
    }

    private async pollVideoStatus(requestId: string, apiKey: string, outputPath: string): Promise<void> {
        const url = 'https://api.siliconflow.cn/v1/video/status';
        let retries = 0;
        let pollIntervalMs = 5000;
        while (retries < 120) {
            await new Promise(r => setTimeout(r, pollIntervalMs));
            retries++;
            pollIntervalMs = Math.min(pollIntervalMs * 2, 30000);
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
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        if (ext === '.webp') mimeType = 'image/webp';
        const data = await fs.readFile(filePath);
        return `data:${mimeType};base64,${data.toString('base64')}`;
    }

    private async downloadFile(url: string, outputFilePath: string): Promise<void> {
        const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 60000 });
        if (response.status !== 200) {
            throw new Error(`Download failed with status ${response.status}: ${url}`);
        }
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

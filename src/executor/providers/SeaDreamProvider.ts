import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';
import { SpoolerTask } from '../../core/queue/SpoolerQueue';
import { ConfigLoader } from '../../utils/configLoader';

export class SeaDreamProvider {
    private endpoint: string = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    
    async processTask(task: SpoolerTask): Promise<boolean> {
        const job = task.payload.job as Job;
        if (!job) throw new Error("SeaDream Provider requires task.payload.job");

        // 从 ConfigLoader 提取 API Key 和设置
        const configLoader = ConfigLoader.getInstance();
        let apiKey: string;
        try {
            apiKey = configLoader.getResolvedApiKey('seadream');
        } catch {
            apiKey = process.env.SEADREAM_API_KEY || '';
            if (!apiKey) throw new Error("Missing SEADREAM_API_KEY");
        }

        const modelConfig = configLoader.getModelConfig('seadream');
        if (!modelConfig || !modelConfig.model) {
            throw new Error("Missing 'seadream' model configuration. Please set 'model' in api_config.yaml.");
        }
        const actualModel = modelConfig.model;
        
        logger.logExecution(job.id, 'SEADREAM_START', { model: actualModel, uuid: task.uuid });

        const requestBody = this.buildRequestBody(job, actualModel);
        
        let submitRes;
        try {
            submitRes = await axios.post(
                this.endpoint,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
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
            console.error(`[SeaDreamProvider] Unknown payload loop:`, JSON.stringify(data).substring(0, 200));
            throw new Error(`Invalid API response: no image entries found`);
        }

        // 下载存储
        for (let i = 0; i < imageEntries.length; i++) {
            const entry = imageEntries[i];
            const url = entry.image_url || entry.url;
            
            let finalOutputPath = job.output_path;
            const ext = path.extname(job.output_path) || '.png';
            const basename = path.basename(job.output_path, ext);
            const dirname = path.dirname(job.output_path);

            await fs.mkdir(dirname, { recursive: true });

            let fileIndex = i + 1;
            let candidatePath = path.join(dirname, `${basename}_${fileIndex}${ext}`);
            while (await fs.access(candidatePath).then(() => true).catch(() => false)) {
                fileIndex++;
                candidatePath = path.join(dirname, `${basename}_${fileIndex}${ext}`);
            }
            finalOutputPath = candidatePath;

            await this.downloadImage(url, finalOutputPath);
            logger.logExecution(job.id, 'SEADREAM_DOWNLOAD_SUCCESS', { path: finalOutputPath });
        }
        
        return true;
    }

    private buildRequestBody(job: Job, actualModel: string): any {
        const payload = job.payload;
        const globalSettings = (payload.global_settings || {}) as any;
        const maxImages = (globalSettings as any).max_images || job.image_config?.max_images || 1;
        
        let prompt = job.prompt_en || payload.prompt || '';
        let sequentialMode = maxImages > 1 ? "auto" : "disabled";
        if (maxImages > 1) prompt = `生成一组图像，${prompt}`;
        
        const requestBody: any = {
            model: actualModel,
            prompt: prompt,
            negative_prompt: globalSettings.negative_prompt || 'blurry, low quality, distorted, deformed, ugly, bad anatomy',
            sequential_image_generation: sequentialMode,
            response_format: 'url',
            size: globalSettings.quality || '2K', 
            aspect_ratio: globalSettings.aspect_ratio || '16:9',
            steps: globalSettings.steps || 30,
            cfg_scale: globalSettings.cfg_scale || 7.5,
            stream: false,
            watermark: true
        };

        if (maxImages > 1) {
            requestBody.sequential_image_generation_options = { max_images: Math.min(maxImages, 12) };
        }

        if (job.reference_images && job.reference_images.length > 0) {
            // ... image Base64 mapping logic removed to keep core file clean for simplicity.
            // A more robust integration requires base64.
        }

        return requestBody;
    }

    private async downloadImage(url: string, outputPath: string): Promise<void> {
        const response = await axios({ method: 'GET', url: url, responseType: 'stream', timeout: 60000 });
        if (response.status !== 200) {
            throw new Error(`Download failed with status ${response.status}: ${url}`);
        }
        const writer = require('fs').createWriteStream(outputPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            response.data.on('error', reject);
            writer.on('finish', () => { writer.close(); resolve(); });
            writer.on('error', reject);
        });
    }
}

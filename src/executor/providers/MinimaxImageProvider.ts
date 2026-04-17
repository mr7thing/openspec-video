import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';
import { SpoolerTask } from '../../core/queue/SpoolerQueue';
import { ConfigLoader } from '../../utils/configLoader';

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

        const modelConfig = (configLoader.getModelConfig('minimax') || {}) as any;
        const settings = (job.payload.global_settings || {}) as any;
        const actualModel = modelConfig.model || settings.model || 'image-01';
        const apiUrl = settings.api_url || "https://api.minimaxi.com/v1/image_generation";

        logger.logExecution(job.id, 'MINIMAX_START', { model: actualModel, uuid: task.uuid });

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
                logger.error('Minimax API Error:', { jobId: job.id, status: error.response.status, data: JSON.stringify(error.response.data) });
                throw new Error(`Minimax API Error: ${error.response.data?.base_resp?.status_msg || error.response.status}`);
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
        
        const dirname = path.dirname(job.output_path);
        if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
        
        fs.writeFileSync(job.output_path, buffer);
        logger.logExecution(job.id, 'MINIMAX_SAVE_SUCCESS', { path: job.output_path });

        return true;
    }
}

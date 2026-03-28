import axios from 'axios';
import fs from 'fs-extra';
import { Job } from '../../types/PromptSchema';
import { ImageProvider, ImageGenerationResult } from './ImageProvider';
import { logger } from '../../utils/logger';
import { ErrorFactory } from '../../errors/OpsVError';

export class MinimaxImageProvider implements ImageProvider {
    public providerName = 'minimax';

    async generateImage(job: Job, targetModel: string, apiKey: string): Promise<ImageGenerationResult> {
        throw new Error('Method not supported explicitly. Use generateAndDownload instead.');
    }

    async generateAndDownload(job: Job, targetModel: string, apiKey: string, outputPath: string): Promise<void> {
        try {
            const settings = job.payload.global_settings as any;
            const apiUrl = settings.api_url || "https://api.minimaxi.com/v1/image_generation";
            
            // Build prompt
            let prompt = job.payload.prompt || '';
            if (settings.negative_prompt) {
                prompt += ` (Negative prompt: ${settings.negative_prompt})`;
            }

            // Map aspect ratio
            const aspectRatio = settings.aspect_ratio || "16:9";
            
            let payload: any = {
                model: settings.model || "image-01",
                prompt: prompt,
                aspect_ratio: aspectRatio,
                response_format: "base64"
            };

            // Support subject reference if provided (image2image/reference)
            // If the job has reference images, we use the first one as character reference as per Minimax spec
            if (job.reference_images && job.reference_images.length > 0) {
                // Minimax accepts subject_reference. type: 'character'. 
                // But it requires an image_file URL or array. We might need to encode it as base64 or upload it... Wait, Minimax API expects Minimax File ID or URL for images. But their latest docs show URL. 
                // If it's a local file, we might not be able to pass it directly unless we upload it. MiniMax docs show 'image_file': 'https://...' 
                // However, they also let us upload files or we skip it. For this implementation, if it's an absolute local path, we might log a warning that local references are unsupported without URL uploading, OR we omit it. I will leave it empty if it's local, or pass URL if it's HTTP.
                const firstRef = job.reference_images[0];
                if (firstRef.startsWith('http')) {
                    payload.subject_reference = [
                        { type: "character", image_file: firstRef }
                    ];
                } else {
                    logger.warn(`Minimax API requires HTTP URLs for reference images. Local file ${firstRef} will be ignored.`, { jobId: job.id });
                }
            }

            logger.info(`submitting text-to-image job to Minimax: ${job.id}`, { model: settings.model });

            const response = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2 minutes
            });

            const data = response.data;
            if (!data || !data.data || !data.data.image_base64) {
                logger.error('Invalid response format from Minimax API', { response: JSON.stringify(data.base_resp || data) });
                throw ErrorFactory.apiError('minimax', 'Invalid response structural format', job.id);
            }

            const images = data.data.image_base64;
            if (!images || images.length === 0) {
                throw ErrorFactory.apiError('minimax', 'No images returned from API', job.id);
            }

            const imageBase64 = Array.isArray(images) ? images[0] : images;
            const buffer = Buffer.from(imageBase64, 'base64');
            fs.writeFileSync(outputPath, buffer);

            logger.info(`Image created successfully and saved to ${outputPath}`);

        } catch (error: any) {
            // 防御性日志记录 (Evidential Logging)
            if (error.response) {
                logger.error('Minimax API Error:', { 
                    jobId: job.id, 
                    status: error.response.status, 
                    data: JSON.stringify(error.response.data) 
                });
                throw ErrorFactory.apiError(
                    'minimax', 
                    error.response.data?.base_resp?.status_msg || error.response.data?.message || 'API rejected the request', 
                    job.id
                );
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                logger.error('Minimax API Timeout', { jobId: job.id, message: error.message });
                throw ErrorFactory.apiError('minimax', 'Request timed out', job.id);
            } else {
                logger.error('Minimax Request Failed', { jobId: job.id, error: error.message || error });
                throw ErrorFactory.apiError('minimax', error.message || 'Unknown network error', job.id);
            }
        }
    }
}

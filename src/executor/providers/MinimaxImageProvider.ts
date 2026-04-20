import axios from 'axios';
import fs from 'fs/promises';
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
        
        const dirname = path.dirname(job.output_path);
        await fs.mkdir(dirname, { recursive: true });
        
        await fs.writeFile(job.output_path, buffer);
        logger.logExecution(job.id, 'MINIMAX_SAVE_SUCCESS', { path: job.output_path });

        return true;
    }

    /**
     * 检测可能触发内容审核的敏感词汇
     */
    private detectSensitiveTerms(prompt: string): string[] {
        // 常见审核敏感词（基于实际测试反馈）
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

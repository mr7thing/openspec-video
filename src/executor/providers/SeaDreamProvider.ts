/**
 * SeaDream 5.0 Lite Provider
 * 
 * 火山引擎 SeaDream 图像生成服务接入实现
 * API 文档参考: https://www.volcengine.com/docs/82379/1824121
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ImageProvider, ImageGenerationResult } from './ImageProvider';
import { Job } from '../../types/PromptSchema';
import { logger } from '../../utils/logger';
import { ErrorFactory, ExecutionError } from '../../errors/OpsVError';

/**
 * SeaDream API 响应格式
 */
interface SeaDreamResponse {
    code: number;
    message: string;
    data?: {
        /** 图像 URL */
        image_url?: string;
        /** Base64 图像数据 */
        image_base64?: string;
        /** 生成使用的种子 */
        seed?: number;
        /** 生成耗时 */
        inference_time?: number;
    };
}

/**
 * SeaDream 5.0 Lite 配置选项
 */
interface SeaDreamConfig {
    /** API 端点 */
    endpoint: string;
    /** 超时时间（毫秒） */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 默认生成参数 */
    defaults: {
        width: number;
        height: number;
        steps: number;
        cfg_scale: number;
    };
}

export class SeaDreamProvider implements ImageProvider {
    providerName = 'seadream';
    
    private defaultConfig: SeaDreamConfig = {
        endpoint: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
        timeout: 300000, // 增加到 5 分钟
        maxRetries: 3,
        defaults: {
            width: 1024,
            height: 1024,
            steps: 30,
            cfg_scale: 7.5
        }
    };

    private config: SeaDreamConfig;

    constructor(config?: Partial<SeaDreamConfig>) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * 准备请求体
     */
    private buildRequestBody(job: Job, modelName: string): any {
        const payload = job.payload;
        const globalSettings = payload.global_settings || {};
        
        // 从 modelConfig 中获取具体配置 (由 Dispatcher 传入，这里通过 Job 负载或全局配置获取)
        // 实际上 ImageModelDispatcher 应该在调用时传入这些额外参数
        // 为了兼容现有接口，我们检查 payload.global_settings
        const actualModel = (globalSettings as any).model || modelName;

        // 解析画幅比例 (从 project.md / payload 传入)
        const aspectRatio = globalSettings.aspect_ratio || '1:1';
        
        // 获取分辨率 (严格按照配置读取，不自作主张映射坐标)
        const quality = globalSettings.quality || '2K';
        
        // 获取生成数量 (0.3.16)
        // 优先级：全局配置 (来自 api_config.yaml) > Job 特定配置
        const maxImages = (globalSettings as any).max_images || job.image_config?.max_images || 1;
        
        // 构建提示词
        let prompt = job.prompt_en || payload.prompt || '';
        
        // 组图逻辑：如果 max_images > 1，添加前缀
        let sequentialMode = "disabled";
        if (maxImages > 1) {
            sequentialMode = "auto";
            prompt = `生成一组图像，${prompt}`;
        }

        const settings = globalSettings as any;
        const negativePrompt = settings.negative_prompt || this.extractNegativePrompt(payload);
        const steps = settings.steps || this.config.defaults.steps;
        const cfgScale = settings.cfg_scale || this.config.defaults.cfg_scale;

        // SeaDream 5.0 Lite 请求体格式 (对齐 ref.md)
        const requestBody: any = {
            model: actualModel,
            prompt: prompt,
            negative_prompt: negativePrompt || undefined,
            sequential_image_generation: sequentialMode,
            response_format: 'url',
            size: quality, // 传递如 "2K", "4K"
            aspect_ratio: aspectRatio, // 传递如 "16:9"
            steps: steps,
            cfg_scale: cfgScale,
            stream: false,
            watermark: true
        };

        // 如果是组图，添加选项
        if (maxImages > 1) {
            requestBody.sequential_image_generation_options = {
                max_images: Math.min(maxImages, 12) // 最大 12
            };
        }

        // 附件自动适配 (参考图)
        if (job.reference_images && job.reference_images.length > 0) {
            if (job.reference_images.length === 1) {
                const refImage = job.reference_images[0];
                if (fs.existsSync(refImage)) {
                    requestBody.image = this.imageToBase64(refImage);
                }
            } else {
                // 多参考图模式
                requestBody.image = job.reference_images
                    .filter(img => fs.existsSync(img))
                    .map(img => this.imageToBase64(img));
            }
        }

        return requestBody;
    }

    /**
     * 获取官方尺寸枚举
     */
    private getOfficialSize(quality: string): string {
        const sizeMap: Record<string, string> = {
            '480p': '720p', // 映射到最低支持
            '720p': '720p',
            '1080p': '1080p',
            '2K': '2K'
        };
        return sizeMap[quality] || '2K';
    }

    /**
     * 提取负面提示词（从 payload 或解析 prompt）
     */
    private extractNegativePrompt(payload: any): string {
        // 如果 payload 中有明确的负面提示词
        if (payload.negative_prompt) {
            return payload.negative_prompt;
        }
        
        // 默认负面提示词
        return 'blurry, low quality, distorted, deformed, ugly, bad anatomy';
    }

    /**
     * 将图像转换为 Base64
     */
    private imageToBase64(imagePath: string): string {
        try {
            const data = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 
                           ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                           'image/png';
            return `data:${mimeType};base64,${data.toString('base64')}`;
        } catch (error) {
            logger.error(`Failed to convert image to base64: ${imagePath}`, { error });
            throw ErrorFactory.compilationFailed('图像转 Base64 失败', { filePath: imagePath });
        }
    }

    /**
     * 下载图像到本地
     */
    private async downloadImage(url: string, outputPath: string): Promise<void> {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 60000
        });

        // 确保输出目录存在
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                writer.close();
                resolve();
            });
            writer.on('error', reject);
        });
    }

    /**
     * 生成图像
     */
    async generateImage(job: Job, modelName: string, apiKey: string): Promise<ImageGenerationResult> {
        const requestBody = this.buildRequestBody(job, modelName);
        
        logger.logExecution(job.id, 'SEADREAM_SUBMIT', { 
            model: requestBody.model, 
            size: requestBody.size 
        });

        let lastError: Error | null = null;
        
        // 重试机制
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await axios.post<SeaDreamResponse>(
                    this.config.endpoint,
                    requestBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: this.config.timeout
                    }
                );

                const data = response.data as any;
                
                if (data.code !== undefined && data.code !== 0) {
                     throw new Error(`API Error [${data.code}]: ${data.message || 'No message'}`);
                }

                // 重点：处理可能的嵌套 data.data 结构 (0.3.14 支持组图遍历)
                let imageEntries: any[] = [];
                if (Array.isArray(data.data)) {
                    imageEntries = data.data;
                } else if (data.data && Array.isArray(data.data.data)) {
                    imageEntries = data.data.data;
                } else {
                    imageEntries = [data.data || data];
                }

                if (imageEntries.length === 0) {
                    throw new Error(`Invalid API response: no image entries found in ${JSON.stringify(data).substring(0, 100)}...`);
                }

                const result: ImageGenerationResult = {
                    images: imageEntries.map(entry => ({
                        url: entry.image_url || entry.url,
                        base64: entry.image_base64 || entry.b64_json,
                        seed: entry.seed
                    })).filter(img => img.url || img.base64),
                    generationTime: imageEntries[0]?.inference_time,
                    model: modelName
                };

                if (result.images.length === 0) {
                    throw new Error("No valid images found in API response");
                }

                logger.logExecution(job.id, 'SEADREAM_SUCCESS', { 
                    count: result.images.length,
                    time: result.generationTime
                });

                return result;

            } catch (error: any) {
                lastError = error;
                const apiError = error.response?.data;
                const status = error.response?.status;
                const errorCode = error.code; // Axios 的错误代码 (e.g., ECONNABORTED)
                
                let errorMsg = '';
                if (apiError) {
                    errorMsg = `API Error [${apiError.code || status}]: ${apiError.message || 'Unknown API error'}`;
                } else if (errorCode) {
                    errorMsg = `Network/Axios Error [${errorCode}]: ${error.message}`;
                } else {
                    errorMsg = `Unknown Error: ${error.message}`;
                }

                logger.warn(`SeaDream API attempt ${attempt} failed`, { 
                    jobId: job.id, 
                    error: errorMsg,
                    code: errorCode,
                    status: status,
                    response: apiError ? JSON.stringify(apiError) : 'No response data',
                    stack: error.stack?.split('\n')[1]
                });

                if (attempt < this.config.maxRetries) {
                    // 指数退避
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // 所有重试都失败了
        throw ErrorFactory.apiError(
            'SeaDream', 
            `Failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
            job.id
        );
    }

    /**
     * 生成并下载图像 (0.3.14 支持多图下载)
     */
    async generateAndDownload(job: Job, modelName: string, apiKey: string, outputPath: string): Promise<string> {
        const result = await this.generateImage(job, modelName, apiKey);
        const downloadedPaths: string[] = [];

        for (let i = 0; i < result.images.length; i++) {
            const img = result.images[i];
            
            // 构造防冲突的文件名：试图生成第一个不存在的序号
            let finalOutputPath = outputPath;
            const ext = path.extname(outputPath);
            const basename = path.basename(outputPath, ext);
            const dirname = path.dirname(outputPath);

            // 寻找下一个可用的文件名 (e.g., _1, _2, _3...)
            let fileIndex = i + 1;
            let candidatePath = path.join(dirname, `${basename}_${fileIndex}${ext}`);
            
            // 如果文件已存在，则继续往后推，确保不覆盖旧图 (柒叔：万一有_6, _12呢？)
            while (fs.existsSync(candidatePath)) {
                fileIndex++;
                candidatePath = path.join(dirname, `${basename}_${fileIndex}${ext}`);
            }
            finalOutputPath = candidatePath;

            if (img.url) {
                await this.downloadImage(img.url, finalOutputPath);
                logger.logExecution(job.id, 'SEADREAM_DOWNLOAD_SUCCESS', { path: finalOutputPath, index: fileIndex });
            } else if (img.base64) {
                const dir = path.dirname(finalOutputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                const base64Data = img.base64.replace(/^data:image\/\w+;base64,/, '');
                fs.writeFileSync(finalOutputPath, Buffer.from(base64Data, 'base64'));
                logger.logExecution(job.id, 'SEADREAM_SAVE_SUCCESS', { path: finalOutputPath, index: fileIndex });
            }
            
            downloadedPaths.push(finalOutputPath);
        }

        return downloadedPaths[0]; // 返回第一张作为主要结果
    }

    /**
     * 检查支持的功能
     */
    supportsFeature(feature: string): boolean {
        const supportedFeatures = [
            'txt2img',           // 文生图
            'img2img',           // 图生图
            'negative_prompt',   // 负面提示词
            'seed_control',      // 种子控制
            'aspect_ratio',      // 画幅比例
            'quality_settings'   // 质量设置
        ];
        return supportedFeatures.includes(feature);
    }
}

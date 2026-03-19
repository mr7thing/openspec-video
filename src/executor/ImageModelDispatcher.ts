/**
 * 图像模型调度器 (ImageModelDispatcher)
 * 
 * 负责任务队列的调度、多模型管理和执行流程控制。
 * 参考 VideoModelDispatcher 设计，专为图像生成优化。
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Job } from '../types/PromptSchema';
import { ImageProvider } from './providers/ImageProvider';
import { SeaDreamProvider } from './providers/SeaDreamProvider';
import { logger } from '../utils/logger';
import { ErrorFactory, OpsVError } from '../errors/OpsVError';

/**
 * 模型配置接口
 */
interface ModelConfig {
    /** 提供商名称 */
    provider: string;
    /** 支持的特性 */
    features: string[];
    /** 最大图像尺寸 */
    max_size: { width: number; height: number };
    /** 默认参数 */
    defaults?: {
        steps?: number;
        cfg_scale?: number;
        max_images?: number;
        quality?: string;
        negative_prompt?: string;
    };
    /** 成本估算（每千次调用） */
    cost_per_1k?: number;
    /** 实际模型 ID/Endpoint ID */
    model?: string;
}

/**
 * API 配置接口
 */
interface ApiConfig {
    models: Record<string, ModelConfig>;
}

/**
 * 执行统计
 */
interface ExecutionStats {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    totalTime: number;
}

export class ImageModelDispatcher {
    private projectRoot: string;
    private apiConfigPath: string;
    private config: ApiConfig;
    private providers: Map<string, ImageProvider>;
    private stats: ExecutionStats;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.apiConfigPath = path.join(this.projectRoot, '.env', 'api_config.yaml');
        this.config = this.loadConfig();
        this.providers = new Map();
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            totalTime: 0
        };

        this.registerProviders();
    }

    /**
     * 加载 API 配置
     */
    private loadConfig(): ApiConfig {
        const defaultConfig: ApiConfig = {
            models: {
                'seadream-5.0-lite': {
                    provider: 'seadream',
                    features: ['txt2img', 'img2img', 'negative_prompt', 'seed_control', 'aspect_ratio'],
                    max_size: { width: 2048, height: 2048 },
                    defaults: {
                        max_images: 4,
                        quality: '2K'
                    },
                    model: 'doubao-seedream-5-0-260128'
                }
            }
        };

        if (!fs.existsSync(this.apiConfigPath)) {
            logger.warn(`API config not found at ${this.apiConfigPath}, using defaults`);
            return defaultConfig;
        }

        try {
            const raw = fs.readFileSync(this.apiConfigPath, 'utf8');
            const config = yaml.load(raw) as ApiConfig;
            return { ...defaultConfig, ...config };
        } catch (e: any) {
            logger.error(`Failed to load api_config.yaml`, { error: e.message });
            return defaultConfig;
        }
    }

    /**
     * 注册图像提供商
     */
    private registerProviders(): void {
        // 注册 SeaDream 提供商
        this.providers.set('seadream', new SeaDreamProvider());
        
        // 预留：未来可添加更多提供商
        // this.providers.set('stability', new StabilityProvider());
        // this.providers.set('midjourney', new MidjourneyProvider());
    }

    /**
     * 获取可用的非冲突文件名
     */
    private getUniqueImagePath(originalPath: string): string {
        if (!fs.existsSync(originalPath)) {
            return originalPath;
        }

        const dir = path.dirname(originalPath);
        const ext = path.extname(originalPath);
        const name = path.basename(originalPath, ext);

        let counter = 1;
        let newPath = path.join(dir, `${name}_${counter}${ext}`);
        
        while (fs.existsSync(newPath)) {
            counter++;
            newPath = path.join(dir, `${name}_${counter}${ext}`);
        }
        
        return newPath;
    }

    /**
     * 验证任务参数
     */
    private validateJob(job: Job, modelConfig: ModelConfig): void {
        const payload = job.payload;
        const settings = payload.global_settings || {};

        // 验证画幅比例
        const aspectRatio = settings.aspect_ratio || '1:1';
        const supportedRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '2.39:1'];
        
        if (!supportedRatios.includes(aspectRatio)) {
            throw ErrorFactory.compilationFailed(
                `Unsupported aspect ratio: ${aspectRatio}`,
                { jobId: job.id }
            );
        }

        // 验证输出格式
        const validFormats = ['.png', '.jpg', '.jpeg', '.webp'];
        const ext = path.extname(job.output_path).toLowerCase();
        
        if (!validFormats.includes(ext)) {
            throw ErrorFactory.compilationFailed(
                `Unsupported output format: ${ext}`,
                { jobId: job.id }
            );
        }

        logger.logExecution(job.id, 'VALIDATED', { aspectRatio });
    }

    /**
     * 执行单个图像生成任务
     */
    async dispatchJob(job: Job, targetModel: string): Promise<string> {
        const modelConfig = this.config.models?.[targetModel];
        
        if (!modelConfig) {
            throw ErrorFactory.compilationFailed(
                `Model configuration for '${targetModel}' not found`,
                { jobId: job.id }
            );
        }

        const provider = this.providers.get(modelConfig.provider);
        if (!provider) {
            throw ErrorFactory.compilationFailed(
                `Unsupported provider: '${modelConfig.provider}'`,
                { jobId: job.id }
            );
        }

        // 验证任务
        this.validateJob(job, modelConfig);

        // 获取 API Key
        const apiKey = process.env.SEADREAM_API_KEY || process.env.VOLCENGINE_API_KEY;
        if (!apiKey) {
            throw ErrorFactory.compilationFailed(
                'SEADREAM_API_KEY or VOLCENGINE_API_KEY environment variable not set',
                { jobId: job.id }
            );
        }

        // 注入模型特定配置到 payload 以便提供商读取
        // 优先级：任务自带设置 > api_config.yaml 里的 defaults > 固定默认值
        const settings = job.payload.global_settings as any;
        if (settings) {
            const defaults = modelConfig.defaults || {};
            
            // 穿透注入
            settings.max_images = settings.max_images || defaults.max_images || 1;
            settings.quality = settings.quality || defaults.quality || '2K';
            settings.steps = settings.steps || defaults.steps || 30;
            settings.cfg_scale = settings.cfg_scale || defaults.cfg_scale || 7.5;
            settings.negative_prompt = settings.negative_prompt || defaults.negative_prompt;
            
            settings.model = modelConfig.model || targetModel;
        }

        // 计算输出路径
        const baseOutputPath = path.isAbsolute(job.output_path)
            ? job.output_path
            : path.join(this.projectRoot, job.output_path);

        const finalOutputPath = this.getUniqueImagePath(baseOutputPath);

        logger.logExecution(job.id, 'DISPATCH', { 
            model: targetModel, 
            provider: modelConfig.provider,
            output: finalOutputPath
        });

        const startTime = Date.now();

        try {
            // 执行生成
            if (provider instanceof SeaDreamProvider) {
                await provider.generateAndDownload(job, targetModel, apiKey, finalOutputPath);
            } else {
                // 通用提供商接口
                const result = await provider.generateImage(job, targetModel, apiKey);
                // 处理结果保存...
            }

            const duration = Date.now() - startTime;
            this.stats.success++;
            this.stats.totalTime += duration;

            logger.logExecution(job.id, 'COMPLETED', { 
                duration: `${duration}ms`,
                output: finalOutputPath
            });

            return finalOutputPath;

        } catch (error: any) {
            this.stats.failed++;
            
            logger.logExecution(job.id, 'FAILED', { 
                error: error.message 
            });

            if (error instanceof OpsVError) {
                throw error;
            }
            
            throw ErrorFactory.apiError(
                modelConfig.provider,
                error.message,
                job.id
            );
        }
    }

    /**
     * 批量执行图像生成任务
     */
    async dispatchAll(jobs: Job[], targetModel: string, options: {
        concurrency?: number;
        onProgress?: (completed: number, total: number) => void;
        skipFailed?: boolean;
    } = {}): Promise<{ results: string[]; errors: Array<{ jobId: string; error: string }> }> {
        
        const { concurrency = 1, onProgress, skipFailed = false } = options;
        
        this.stats.total = jobs.length;
        this.stats.success = 0;
        this.stats.failed = 0;
        this.stats.skipped = 0;
        this.stats.totalTime = 0;

        const results: string[] = [];
        const errors: Array<{ jobId: string; error: string }> = [];

        logger.info(`Starting image generation pipeline for ${jobs.length} jobs`, {
            model: targetModel,
            concurrency
        });

        // 串行执行（保守策略，避免触发限流）
        if (concurrency === 1) {
            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                
                try {
                    const result = await this.dispatchJob(job, targetModel);
                    results.push(result);
                } catch (error: any) {
                    errors.push({ jobId: job.id, error: error.message });
                    
                    if (!skipFailed) {
                        throw error;
                    }
                }

                onProgress?.(i + 1, jobs.length);

                // 任务间延迟（避免限流）
                if (i < jobs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else {
            // 并行执行（需要提供商支持）
            const batches = this.chunkArray(jobs, concurrency);
            
            for (const batch of batches) {
                const batchPromises = batch.map(job => 
                    this.dispatchJob(job, targetModel)
                        .then(result => ({ success: true, result, jobId: job.id }))
                        .catch(error => ({ success: false, error: error.message, jobId: job.id }))
                );

                const batchResults = await Promise.all(batchPromises);
                
                for (const r of batchResults) {
                    if (r.success) {
                        results.push((r as { success: true; result: string }).result);
                    } else {
                        errors.push({ 
                            jobId: r.jobId, 
                            error: (r as { success: false; error: string }).error 
                        });
                    }
                }

                onProgress?.(Math.min(results.length + errors.length, jobs.length), jobs.length);
            }
        }

        // 输出统计
        const avgTime = this.stats.success > 0 
            ? Math.round(this.stats.totalTime / this.stats.success) 
            : 0;

        logger.info('Image generation pipeline completed', {
            total: this.stats.total,
            success: this.stats.success,
            failed: this.stats.failed,
            avgTime: `${avgTime}ms`
        });

        return { results, errors };
    }

    /**
     * 将数组分块
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * 获取执行统计
     */
    getStats(): ExecutionStats {
        return { ...this.stats };
    }

    /**
     * 获取支持的模型列表
     */
    getSupportedModels(): string[] {
        return Object.keys(this.config.models || {});
    }

    /**
     * 获取模型配置
     */
    getModelConfig(modelName: string): ModelConfig | undefined {
        return this.config.models?.[modelName];
    }
}

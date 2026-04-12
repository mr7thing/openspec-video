/**
 * 图像模型调度器 (ImageModelDispatcher)
 * 
 * 负责任务队列的调度、多模型管理和执行流程控制。
 * 参考 VideoModelDispatcher 设计，专为图像生成优化。
 */

import fs from 'fs';
import path from 'path';
import { Job } from '../types/PromptSchema';
import { ImageProvider } from './providers/ImageProvider';
import { SeaDreamProvider } from './providers/SeaDreamProvider';
import { MinimaxImageProvider } from './providers/MinimaxImageProvider';
import { logger } from '../utils/logger';
import { ErrorFactory, OpsVError } from '../errors/OpsVError';
import { ConfigLoader, ApiConfig, ModelConfig } from '../utils/configLoader';
import { PromptPayload } from '../types/PromptSchema';

export class ImageModelDispatcher {
    private projectRoot: string;
    private configLoader: ConfigLoader;
    private config: ApiConfig;
    private providers: Map<string, ImageProvider>;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.configLoader = ConfigLoader.getInstance();
        this.config = this.configLoader.loadConfig(this.projectRoot);
        this.providers = new Map();
        this.registerProviders();
    }

    /**
     * 注册图像提供商
     */
    private registerProviders(): void {
        // 注册 SeaDream 提供商
        this.providers.set('seadream', new SeaDreamProvider());
        
        // 注册 Minimax 提供商
        this.providers.set('minimax', new MinimaxImageProvider());
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
        const apiKey = this.configLoader.getResolvedApiKey(targetModel);

        // 注入模型特定配置到 payload（优先级：任务设置 > yaml defaults > 固定默认值）
        const settings = job.payload.global_settings as PromptPayload['global_settings'] & Record<string, unknown>;
        const defaults = modelConfig.defaults || {};
        settings.max_images = (settings.max_images as number) || (defaults.max_images as number) || 1;
        settings.quality = settings.quality || (defaults.quality as string) || '2K';
        settings.steps = (settings.steps as number) || (defaults.steps as number) || 30;
        settings.cfg_scale = (settings.cfg_scale as number) || (defaults.cfg_scale as number) || 7.5;
        settings.negative_prompt = settings.negative_prompt || (defaults.negative_prompt as string);
        settings.model = (modelConfig.model as string) || targetModel;

        // 计算输出路径：如果是 Gemini 等默认情况存入根，API模型存入子目录
        const baseOutputPath = path.isAbsolute(job.output_path)
            ? job.output_path
            : path.join(this.projectRoot, job.output_path);

        const draftBaseDir = path.dirname(baseOutputPath);
        const fileName = path.basename(baseOutputPath);

        // 如果是指定的特定 API 模型（非人工方式），强制坍缩到子目录
        const targetDir = (modelConfig.provider === 'gemini' || !modelConfig.provider) 
            ? draftBaseDir 
            : path.join(draftBaseDir, modelConfig.provider);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const finalOutputPath = this.getUniqueImagePath(path.join(targetDir, fileName));

        logger.logExecution(job.id, 'DISPATCH', { 
            model: targetModel, 
            provider: modelConfig.provider,
            output: finalOutputPath
        });

        const startTime = Date.now();

        try {
            // 统一调用接口方法（方案A：无分支，无 instanceof）
            await provider.generateAndDownload(job, targetModel, apiKey, finalOutputPath);

            const duration = Date.now() - startTime;
            logger.logExecution(job.id, 'COMPLETED', {
                duration: `${duration}ms`,
                output: finalOutputPath
            });

            return finalOutputPath;

        } catch (error: unknown) {
            logger.logExecution(job.id, 'FAILED', {
                error: error instanceof Error ? error.message : String(error)
            });

            if (error instanceof OpsVError) throw error;

            throw ErrorFactory.apiError(
                modelConfig.provider,
                error instanceof Error ? error.message : String(error),
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

        // stats 局部化，避免多次并发调用时竞争条件
        let successCount = 0;
        let failedCount = 0;
        let totalTime = 0;

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
                
                const t0 = Date.now();
                try {
                    const result = await this.dispatchJob(job, targetModel);
                    results.push(result);
                    successCount++;
                    totalTime += Date.now() - t0;
                } catch (error: unknown) {
                    failedCount++;
                    errors.push({
                        jobId: job.id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    if (!skipFailed) throw error;
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
        const avgTime = successCount > 0 ? Math.round(totalTime / successCount) : 0;
        logger.info('Image generation pipeline completed', {
            total: jobs.length,
            success: successCount,
            failed: failedCount,
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

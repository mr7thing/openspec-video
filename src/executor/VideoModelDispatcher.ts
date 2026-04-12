import fs from 'fs';
import path from 'path';
import { Job } from '../types/PromptSchema';
import { VideoProvider } from './providers/VideoProvider';
import { SiliconFlowProvider } from './providers/SiliconFlowProvider';
import { SeedanceProvider } from './providers/SeedanceProvider';
import { MinimaxVideoProvider } from './providers/MinimaxVideoProvider';
import { FrameExtractor } from './FrameExtractor';
import { ConfigLoader, ApiConfig } from '../utils/configLoader';
import { logger } from '../utils/logger';

// ============================================================================
// 类型定义
// ============================================================================

export type DispatchStatus = 'success' | 'failed' | 'timeout';

export interface DispatchResult {
    jobId: string;
    status: DispatchStatus;
    outputPath?: string;  // success 时有效
    error?: string;       // failed/timeout 时有效
}

export interface DispatchSummary {
    total: number;
    succeeded: number;
    failed: number;
    results: DispatchResult[];
}

export class VideoModelDispatcher {
    private projectRoot: string;
    private configLoader: ConfigLoader;
    private config: ApiConfig;
    private providers: Map<string, VideoProvider>;
    /** failFast: true 时，一个任务失败即终止整个队列；false 时记录错误后继续 */
    private failFast: boolean;
    /** 单任务超时时间（毫秒），默认 5 分钟 */
    private jobTimeoutMs: number;

    constructor(projectRoot: string, options: { failFast?: boolean; jobTimeoutMs?: number } = {}) {
        this.projectRoot = projectRoot;
        this.failFast = options.failFast ?? false;
        this.jobTimeoutMs = options.jobTimeoutMs ?? 300_000; // 5 分钟
        this.configLoader = ConfigLoader.getInstance();
        this.config = this.configLoader.loadConfig(this.projectRoot);

        // 注册已实现的 Provider
        this.providers = new Map();
        this.providers.set('siliconflow', new SiliconFlowProvider());
        this.providers.set('seedance', new SeedanceProvider());
        this.providers.set('minimax', new MinimaxVideoProvider());
    }

    /**
     * 为视频寻找合适安全的重命名，不覆盖已有视频
     * e.g. shot_1.mp4 存在，则转为 shot_1_1.mp4
     */
    private getUniqueVideoPath(originalPath: string): string {
        if (!fs.existsSync(originalPath)) return originalPath;

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
     * 针对单个作业进行派发调度
     */
    async dispatchJob(job: Job, targetModel: string): Promise<string> {
        const modelConf = this.config.models?.[targetModel];
        if (!modelConf) {
            throw new Error(`[Dispatcher] Model configuration for '${targetModel}' not found in api_config.yaml.`);
        }

        const providerName = modelConf.provider;
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`[Dispatcher] Unsupported provider: '${providerName}' for model '${targetModel}'.`);
        }

        // v0.5: 根据支持能力裁减 frame_ref
        const sanitizedJob = JSON.parse(JSON.stringify(job)) as Job;
        const frameRef = sanitizedJob.payload?.frame_ref;

        if (frameRef) {
            if (!modelConf.supports_first_image) frameRef.first = null;
            if (!modelConf.supports_last_image) frameRef.last = null;
        }

        // 注入配置中的额外字段 (如 api_url, resolution)
        (sanitizedJob as any).api_url = modelConf.api_url;
        
        // 分辨率映射：读取 quality 控制对应的物理分辨率
        const quality = sanitizedJob.payload.global_settings.quality;
        if (modelConf.quality_map && modelConf.quality_map[quality]) {
            (sanitizedJob as any).resolution = modelConf.quality_map[quality].resolution;
        } else {
            // fallback 到 default
            (sanitizedJob as any).resolution = modelConf.defaults?.size || "1280x720";
        }

        // 获取或校验鉴权
        // 通过 ConfigLoader 统一处理
        const apiKey = this.configLoader.getResolvedApiKey(targetModel);

        logger.info(`[Dispatcher] 🚀 派发任务 [${job.id}] → 模型 [${targetModel}] (${providerName})`);

        // 1. 发送请求，获得请求凭证
        const requestId = await provider.submitJob(sanitizedJob, targetModel, apiKey);
        logger.info(`[Dispatcher]   请求已提交，追踪 ID: ${requestId}`);

        // 2. 预测绝对存放路径
        const baseOutputPath = path.isAbsolute(job.output_path)
            ? job.output_path
            : path.join(this.projectRoot, job.output_path);

        const draftBaseDir = path.dirname(baseOutputPath);
        const fileName = path.basename(baseOutputPath);

        // 如果是指定的特定 API 模型（非人工方式），强制坍缩到子目录
        const targetDir = (modelConf.provider === 'gemini' || !modelConf.provider) 
            ? draftBaseDir 
            : path.join(draftBaseDir, modelConf.provider);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const finalOutputPath = this.getUniqueVideoPath(path.join(targetDir, fileName));

        // 3. 阻塞挂起：轮询并等待落盘
        logger.info(`[Dispatcher]   等待远程任务完成...`);
        await provider.pollAndDownload(requestId, apiKey, finalOutputPath);

        logger.info(`[Dispatcher] 🎉 任务 [${job.id}] 完成 → ${finalOutputPath}`);
        return finalOutputPath;
    }

    /**
     * 批量派发流水线与长镜头依赖图谱解析
     * @param jobs 任务队列
     * @param targetModel 全局指定的大模型名称
     * @returns 执行摘要，包含每个任务的成功/失败状态
     */
    async dispatchAll(jobs: Job[], targetModel: string): Promise<DispatchSummary> {
        const jobResults = new Map<string, string>();
        const completedJobs = new Set<string>();
        const dispatchResults: DispatchResult[] = [];

        for (const [index, job] of jobs.entries()) {
            logger.info(`[Dispatcher] [${index + 1}/${jobs.length}] 开始处理任务: ${job.id}`);

            // v0.5: 从 frame_ref 读取帧引用
            const frameRef = job.payload?.frame_ref;
            let firstImage = frameRef?.first as string | null | undefined;

            if (firstImage && firstImage.startsWith('@FRAME:')) {
                const parts = firstImage.replace('@FRAME:', '').split('_');
                const frameType = parts.pop();
                const sourceJobId = parts.join('_');

                logger.info(`[Dispatcher] ⏳ 跨帧依赖: [${job.id}] → [${sourceJobId}]`);

                if (!completedJobs.has(sourceJobId) || !jobResults.has(sourceJobId)) {
                    const errMsg = `依赖断裂: [${job.id}] 前置产物 [${sourceJobId}] 未就绪`;
                    logger.error(`[Dispatcher] ❌ ${errMsg}`);
                    dispatchResults.push({ jobId: job.id, status: 'failed', error: errMsg });
                    if (this.failFast) break;
                    continue;
                }

                const sourceVideoPath = jobResults.get(sourceJobId)!;
                const frameFilename = `${sourceJobId}_${frameType}.jpg`;
                const extractedFramePath = path.join(this.projectRoot, 'artifacts', 'drafts_frame_cache', frameFilename);

                await FrameExtractor.extractLastFrame(sourceVideoPath, extractedFramePath);

                // v0.5: 写回 frame_ref.first
                if (frameRef) frameRef.first = extractedFramePath;
                logger.info(`[Dispatcher] ✅ 帧引用消解: ${firstImage} → ${extractedFramePath}`);
            }

            try {
                const finalPath = await this.dispatchWithTimeout(job, targetModel);
                jobResults.set(job.id, finalPath);
                completedJobs.add(job.id);
                dispatchResults.push({ jobId: job.id, status: 'success', outputPath: finalPath });
            } catch (e: unknown) {
                const isTimeout = e instanceof Error && e.message.includes('超时');
                const status: DispatchStatus = isTimeout ? 'timeout' : 'failed';
                const errMsg = e instanceof Error ? e.message : String(e);

                logger.error(`[Dispatcher] ❌ 任务 [${job.id}] ${status}: ${errMsg}`);
                dispatchResults.push({ jobId: job.id, status, error: errMsg });

                if (this.failFast) {
                    logger.warn(`[Dispatcher] failFast 已启用，终止后续 ${jobs.length - index - 1} 个任务`);
                    break;
                }
            }
        }

        // 生成执行摘要
        const summary: DispatchSummary = {
            total: jobs.length,
            succeeded: dispatchResults.filter(r => r.status === 'success').length,
            failed: dispatchResults.filter(r => r.status !== 'success').length,
            results: dispatchResults,
        };

        logger.info(`\n[Dispatcher] ✨ 执行完成: ${summary.succeeded}/${summary.total} 成功, ${summary.failed} 失败`);
        return summary;
    }

    /**
     * 带超时的单任务派发
     * 超过 jobTimeoutMs 后抛出超时错误
     */
    private dispatchWithTimeout(job: Job, targetModel: string): Promise<string> {
        return Promise.race([
            this.dispatchJob(job, targetModel),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`任务超时 (>${this.jobTimeoutMs}ms): ${job.id}`)),
                    this.jobTimeoutMs
                )
            ),
        ]);
    }
}


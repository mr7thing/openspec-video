import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Job } from '../types/PromptSchema';
import { VideoProvider } from './providers/VideoProvider';
import { SiliconFlowProvider } from './providers/SiliconFlowProvider';
import { SeedanceProvider } from './providers/SeedanceProvider';
import { FrameExtractor } from './FrameExtractor';

export class VideoModelDispatcher {
    private projectRoot: string;
    private apiConfigPath: string;
    private config: any;
    private providers: Map<string, VideoProvider>;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.apiConfigPath = path.join(this.projectRoot, '.env', 'api_config.yaml');
        this.config = this.loadConfig();

        // 注册已实现的 Provider
        this.providers = new Map();
        this.providers.set('siliconflow', new SiliconFlowProvider());
        this.providers.set('seedance', new SeedanceProvider());
    }

    private loadConfig(): any {
        if (!fs.existsSync(this.apiConfigPath)) {
            console.warn(`[Dispatcher] Warning: api_config.yaml not found at ${this.apiConfigPath}. Using empty config.`);
            return { models: {} };
        }
        try {
            const raw = fs.readFileSync(this.apiConfigPath, 'utf8');
            return yaml.load(raw);
        } catch (e: any) {
            console.error(`[Dispatcher] Failed to parse api_config.yaml: ${e.message}`);
            return { models: {} };
        }
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

        // 根据支持能力裁减 Job 中的数据
        const sanitizedJob = JSON.parse(JSON.stringify(job)) as Job;
        const schema = (sanitizedJob.payload as any)?.schema_0_3;

        if (schema) {
            if (!modelConf.supports_first_image) schema.first_image = undefined;
            if (!modelConf.supports_middle_image) schema.middle_image = undefined;
            if (!modelConf.supports_last_image) schema.last_image = undefined;
            if (!modelConf.supports_reference_images) schema.reference_images = [];
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
        // 根据 Provider 类型抓取对应的环境变量
        let apiKey = '';
        if (providerName === 'siliconflow') {
            apiKey = process.env.SILICONFLOW_API_KEY || '';
            if (!apiKey) throw new Error("SILICONFLOW_API_KEY environment variable is not set.");
        } else if (providerName === 'seedance') {
            apiKey = process.env.SEEDANCE_API_KEY || process.env.VOLCENGINE_API_KEY || '';
            if (!apiKey) throw new Error("Neither SEEDANCE_API_KEY nor VOLCENGINE_API_KEY is set.");
        }
        // else if ...

        console.log(`[Dispatcher] 🚀 Dispatching job [${job.id}] to model [${targetModel}] via Provider [${providerName}]...`);

        // 1. 发送请求，获得请求凭证
        const requestId = await provider.submitJob(sanitizedJob, targetModel, apiKey);
        console.log(`[Dispatcher]   Request submitted successfully. Tracking ID: ${requestId}`);

        // 2. 预测绝对存放路径
        const baseOutputPath = path.isAbsolute(job.output_path)
            ? job.output_path
            : path.join(this.projectRoot, job.output_path);

        const finalOutputPath = this.getUniqueVideoPath(baseOutputPath);

        // 3. 阻塞挂起：轮询并等待落盘
        console.log(`[Dispatcher]   Waiting for job to finish remotely...`);
        await provider.pollAndDownload(requestId, apiKey, finalOutputPath);

        console.log(`[Dispatcher] 🎉 Job [${job.id}] completed cleanly at [${finalOutputPath}]`);
        return finalOutputPath;
    }

    /**
     * 批量派发流水线与长镜头依赖图谱解析
     * @param jobs 任务队列
     * @param targetModel 全局指定的大模型名称
     */
    async dispatchAll(jobs: Job[], targetModel: string): Promise<void> {
        const jobResults = new Map<string, string>();
        const completedJobs = new Set<string>();

        for (const job of jobs) {
            // 拦截与分析 schema 里的 @FRAME 指针
            const schema = (job.payload as any)?.schema_0_3;
            let firstImage = schema?.first_image as string | undefined;

            if (firstImage && firstImage.startsWith('@FRAME:')) {
                // e.g. @FRAME:shot_1_last
                const parts = firstImage.replace('@FRAME:', '').split('_');
                const frameType = parts.pop(); // 'last'
                const sourceJobId = parts.join('_'); // 'shot_1'

                console.log(`[Dispatcher] ⏳ 命中跨维依赖！任务 [${job.id}] 依赖于源视频截帧 [${sourceJobId}]. 正在验证源状态...`);

                if (!completedJobs.has(sourceJobId) || !jobResults.has(sourceJobId)) {
                    throw new Error(`[Dispatcher] 依赖链断裂: 任务 [${job.id}] 前置需要的产物 [${sourceJobId}] 尚未渲染完备。请检查视频 JSON 排列是否有误。`);
                }

                const sourceVideoPath = jobResults.get(sourceJobId)!;
                const frameFilename = `${sourceJobId}_${frameType}.jpg`;
                // 落盘于统一的临时草稿区，遵循 _last / _middle 命名范式
                const extractedFramePath = path.join(this.projectRoot, 'artifacts', 'drafts_frame_cache', frameFilename);

                // 注入幽灵组件执行提取
                await FrameExtractor.extractLastFrame(sourceVideoPath, extractedFramePath);

                // ✨ 变量塌缩 ✨
                schema.first_image = extractedFramePath;
                console.log(`[Dispatcher] 💥 因果变数消解: 【${firstImage}】 塌缩为绝对路径 【${extractedFramePath}】`);
            }

            try {
                // 逐个下发真实的 API 生命周期
                const finalPath = await this.dispatchJob(job, targetModel);
                jobResults.set(job.id, finalPath);
                completedJobs.add(job.id);
            } catch (e: any) {
                console.error(`[Dispatcher] ❌ 管线阻塞：任务 [${job.id}] 宣告失败终止: ${e.message}`);
                throw e;
            }
        }

        console.log(`\n[Dispatcher] ✨ 所有 ${jobs.length} 个任务已成功走完生命周期！`);
    }
}

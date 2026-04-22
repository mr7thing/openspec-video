import { BatchManifestManager } from '../queue/BatchManifestManager';
import { Job } from '../../types/PromptSchema';
import { ConfigLoader } from '../../utils/configLoader';
import { logger } from '../../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface StandardTaskIntent {
    provider: string;       // e.g., 'volcengine', 'siliconflow'
    modelKey: string;      // e.g., 'sea_dream_image', 'flux_pro'
    job: Job;
}

export class StandardAPICompiler {
    private baseQueueDir: string;
    private configLoader: ConfigLoader;

    constructor(baseQueueDir: string) {
        this.baseQueueDir = baseQueueDir;
        this.configLoader = ConfigLoader.getInstance();
    }

    /**
     * 根据环序号 Word 获取映射 (v0.6.2 强约束)
     */
    static getCircleWord(index: number): string {
        const words = ['zerocircle', 'firstcircle', 'secondcircle', 'thirdcircle', 'fourthcircle', 'fifthcircle'];
        return words[index] || `circle_${index}`;
    }

    /**
     * 编译任务意图并按照 Circle 结构注册到 opsv-queue
     */
    async compileAndEnqueue(intent: StandardTaskIntent, circleIndex: number = 0, iterationIndex: number = 1): Promise<string> {
        const circleWord = StandardAPICompiler.getCircleWord(circleIndex);
        const circleFullName = `${circleWord}_${iterationIndex}`;
        const provider = intent.provider;
        const circlePath = path.join(this.baseQueueDir, circleFullName);
        const providerDir = path.join(circlePath, provider);

        // 1. 确保 Provider 目录存在
        await fs.mkdir(providerDir, { recursive: true });

        // 2. 确定批次 (Batch inside provider)
        let batchNum = 1;
        try {
            const entries = await fs.readdir(providerDir);
            const batchFolders = entries.filter(e => e.startsWith('queue_'));
            if (batchFolders.length > 0) {
                const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''))).filter(n => !isNaN(n));
                batchNum = Math.max(...nums) + 1;
            }
        } catch (e) {
            // Directory is empty/new, use batch 1
        }

        const batchDir = path.join(providerDir, `queue_${batchNum}`);
        const manager = new BatchManifestManager(batchDir);
        await manager.init(circleFullName, batchNum);

        // 3. 配置合并逻辑
        const modelCfg = this.configLoader.getModelConfig(intent.provider, intent.modelKey);
        const defaults = modelCfg?.defaults || {};
        const userParams = (intent.job.payload as any).global_settings || {};
        
        // 合并规则：用户参数优先，不足处用默认值补齐
        const finalParams = { ...defaults, ...userParams };

        // 4. 强参数校验 (Defense Strategy)
        this.applyParameterDefense(intent.provider, intent.modelKey, finalParams);

        // 5. 构建标准化意图 (StandardTaskIntent)
        const intention = {
            shotId: intent.job.id,
            type: intent.job.type || 'image_generation',
            provider: intent.provider,
            model: intent.modelKey,
            prompt: intent.job.prompt_en || (intent.job.payload as any).prompt,
            params: finalParams,
            reference_images: intent.job.reference_images || []
        };

        // 6. 注册任务到 manifest
        const taskId = intent.job.id;
        await manager.registerTask(taskId, taskId, intention);

        logger.info(`[Compiler] Circle Enqueued: ${circleFullName}/${provider}/queue_${batchNum}/${taskId}`);
        return taskId;
    }

    /**
     * 针对不同 Provider 的物理参数防御逻辑
     */
    private applyParameterDefense(provider: string, model: string, params: any) {
        // 1. SiliconFlow 强制尺寸对齐 (v0.6.2 更新)
        if (provider === 'siliconflow') {
            const recommended = ['1024x1024', '512x1024', '768x1024', '1024x512', '1024x768', '1440x720', '720x1440', '1664x928', '928x1664'];
            const currentSize = params.image_size || params.size || params.resolution || '1024x1024';
            
            if (!recommended.includes(currentSize)) {
                logger.warn(`[Defense] SiliconFlow: Size ${currentSize} not in recommended list. Fallback to 1024x1024`);
                params.image_size = '1024x1024';
            } else {
                params.image_size = currentSize;
            }
            
            // 清理冗余字段
            delete params.size;
            delete params.resolution;
        }

        // 2. Volcengine (火山方舟) 关键参数清洗
        if (provider === 'volcengine') {
            // 确保尺寸映射到物理像素 (Bug 8 Fix)
            if (params.size === '2K') params.size = '1920x1080';
            if (params.size === '2K-Square') params.size = '1440x1440';
            
            if (!params.size) params.size = '1280x720';
        }

        // 3. Minimax 防御
        if (provider === 'minimax') {
            if (!params.prompt_optimizer) params.prompt_optimizer = true;
        }
    }
}

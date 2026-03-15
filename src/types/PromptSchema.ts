import { z } from 'zod';

// ============================================================================
// OpenSpec-Video 类型定义 (0.3.2)
// ============================================================================

// ---- 任务类型枚举 ----
export enum JobType {
    IMAGE_GENERATION = 'image_generation',
    VIDEO_GENERATION = 'video_generation'
}

// ---- 相机设置 ----
export const CameraSettingsSchema = z.object({
    type: z.string().optional(),
    motion: z.string().optional()
});

export type CameraSettings = z.infer<typeof CameraSettingsSchema>;

// ---- 全局设置 ----
export const GlobalSettingsSchema = z.object({
    aspect_ratio: z.string(),
    quality: z.string().default("2K")
});

export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

// ---- 0.3.2 Schema 扩展 ----
export const Schema032Schema = z.object({
    first_image: z.string().optional(),
    middle_image: z.string().optional(),
    last_image: z.string().optional(),
    reference_images: z.array(z.string()).optional()
});

export type Schema032 = z.infer<typeof Schema032Schema>;

// ---- Payload 结构：给 Banana / Veo 等多模态大模型 ----
export const PromptPayloadSchema = z.object({
    // 纯中文叙事提示词（第一个任务会拼接 vision）
    prompt: z.string().optional(),
    global_settings: z.object({
        aspect_ratio: z.string(),
        quality: z.string().default("2K")
    }),
    subject: z.object({
        description: z.string().optional()
    }).optional(),
    environment: z.object({
        description: z.string().optional()
    }).optional(),
    camera: z.object({
        type: z.string().optional(),
        motion: z.string().optional()
    }).optional(),
    duration: z.string().optional(),
    schema_0_3: z.object({
        first_image: z.string().optional(),
        middle_image: z.string().optional(),
        last_image: z.string().optional(),
        reference_images: z.array(z.string()).optional()
    }).optional()
});

export type PromptPayload = z.infer<typeof PromptPayloadSchema>;

// ---- Job 元数据 ----
export const JobMetaSchema = z.object({
    timestamp: z.string().optional(),
    batch: z.string().optional(),
    source: z.string().optional()
});

export type JobMeta = z.infer<typeof JobMetaSchema>;

// ---- 图像生成扩展配置 (0.3.3) ----
export const ImageConfigSchema = z.object({
    /** 随机种子，用于复现结果 */
    seed: z.number().optional(),
    /** 推理步数 */
    steps: z.number().min(1).max(50).optional(),
    /** CFG Scale (提示词遵循度) */
    cfg_scale: z.number().min(1).max(20).optional(),
    /** 负面提示词 */
    negative_prompt: z.string().optional(),
    /** 采样器 */
    sampler: z.enum(['Euler', 'Euler a', 'DPM++ 2M', 'DPM++ 2M Karras']).optional(),
    /** 图像增强 */
    enhance: z.boolean().optional(),
    /** 高清修复 */
    hires_fix: z.boolean().optional(),
    /** 高清修复倍率 */
    hires_scale: z.number().optional()
});

export type ImageConfig = z.infer<typeof ImageConfigSchema>;

// ---- Job 根结构：双通道隔离 ----
export const JobSchema = z.object({
    id: z.string(),
    type: z.enum(['image_generation', 'video_generation']),
    // 纯英文渲染指令（给 SD / Flux / ComfyUI CLIP）
    prompt_en: z.string().optional(),
    // 结构化 payload（给 Banana / Veo）
    payload: PromptPayloadSchema,
    // 参考图绝对路径数组（给 ComfyUI Load Image 节点）
    reference_images: z.array(z.string()).optional(),
    output_path: z.string(),
    // 可选元数据
    _meta: JobMetaSchema.optional(),
    // UI 状态标记（不被序列化）
    _skip: z.boolean().optional(),
    // 图像生成配置 (0.3.3)
    image_config: ImageConfigSchema.optional(),
    // 种子值 (0.3.3)
    seed: z.number().optional()
});

export type Job = z.infer<typeof JobSchema>;

// ---- 任务验证辅助函数 ----
export const JobValidator = {
    /**
     * 验证任务对象是否符合 Schema
     */
    validate(job: unknown): { success: true; data: Job } | { success: false; errors: string[] } {
        const result = JobSchema.safeParse(job);
        if (result.success) {
            return { success: true, data: result.data };
        }
        return {
            success: false,
            errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
    },

    /**
     * 验证任务数组
     */
    validateMany(jobs: unknown[]): { valid: Job[]; invalid: { index: number; errors: string[] }[] } {
        const valid: Job[] = [];
        const invalid: { index: number; errors: string[] }[] = [];

        jobs.forEach((job, index) => {
            const result = this.validate(job);
            if (result.success) {
                valid.push(result.data);
            } else {
                invalid.push({ index, errors: result.errors });
            }
        });

        return { valid, invalid };
    },

    /**
     * 创建类型安全的 Job 对象（替代 as any）
     */
    createJob(params: Omit<Job, '_meta' | '_skip'> & Partial<Pick<Job, '_meta' | '_skip'>>): Job {
        return JobSchema.parse(params);
    },

    /**
     * 检查是否为图像生成任务
     */
    isImageJob(job: Job): boolean {
        return job.type === JobType.IMAGE_GENERATION;
    },

    /**
     * 检查是否为视频生成任务
     */
    isVideoJob(job: Job): boolean {
        return job.type === JobType.VIDEO_GENERATION;
    }
};

// ---- 兼容类型（用于逐步迁移）----
export type JobInput = Omit<Job, 'type'> & { type: string };
export type PayloadInput = Omit<PromptPayload, 'global_settings'> & { 
    global_settings?: { aspect_ratio?: string; quality?: string } 
};

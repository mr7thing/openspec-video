import { z } from 'zod';

// ============================================================================
// OpenSpec-Video 类型定义 (v0.5)
// 核心变更: schema_0_3 → frame_ref，删除 middle_image，删除兼容类型
// ============================================================================

// ---- 任务类型枚举 ----
export enum JobType {
    IMAGE_GENERATION = 'image_generation',
    VIDEO_GENERATION = 'video_generation'
}

// ---- 帧引用（v0.5 替代原 schema_0_3） ----
export const FrameRefSchema = z.object({
    first: z.string().nullable().optional(),
    last: z.string().nullable().optional(),
});
export type FrameRef = z.infer<typeof FrameRefSchema>;

// ---- Payload 结构 ----
export const PromptPayloadSchema = z.object({
    // 叙事提示词
    prompt: z.string().optional(),
    global_settings: z.object({
        aspect_ratio: z.string(),
        quality: z.string().default('1920x1080')
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
    // v0.5: frame_ref 替代 schema_0_3
    frame_ref: FrameRefSchema.optional(),
});

export type PromptPayload = z.infer<typeof PromptPayloadSchema>;

// ---- Job 元数据 ----
export const JobMetaSchema = z.object({
    timestamp: z.string().optional(),
    batch: z.string().optional(),
    source: z.string().optional()
});

export type JobMeta = z.infer<typeof JobMetaSchema>;

// ---- 图像生成扩展配置 ----
export const ImageConfigSchema = z.object({
    seed: z.number().optional(),
    steps: z.number().min(1).max(50).optional(),
    cfg_scale: z.number().min(1).max(20).optional(),
    negative_prompt: z.string().optional(),
    sampler: z.enum(['Euler', 'Euler a', 'DPM++ 2M', 'DPM++ 2M Karras']).optional(),
    hires_scale: z.number().optional(),
    max_images: z.number().min(1).max(12).default(1)
});

export type ImageConfig = z.infer<typeof ImageConfigSchema>;

// ---- Job 根结构 ----
export const JobSchema = z.object({
    id: z.string(),
    type: z.enum(['image_generation', 'video_generation']),
    // 英文渲染指令
    prompt_en: z.string().optional(),
    // 结构化 payload
    payload: PromptPayloadSchema,
    // 参考图绝对路径数组
    reference_images: z.array(z.string()).optional(),
    output_path: z.string(),
    _meta: JobMetaSchema.optional(),
    _skip: z.boolean().optional(),
    image_config: ImageConfigSchema.optional(),
    seed: z.number().optional()
});

export type Job = z.infer<typeof JobSchema>;

// ---- 任务验证辅助函数 ----
export const JobValidator = {
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

    createJob(params: Omit<Job, '_meta' | '_skip'> & Partial<Pick<Job, '_meta' | '_skip'>>): Job {
        return JobSchema.parse(params);
    },

    isImageJob(job: Job): boolean {
        return job.type === JobType.IMAGE_GENERATION;
    },

    isVideoJob(job: Job): boolean {
        return job.type === JobType.VIDEO_GENERATION;
    }
};

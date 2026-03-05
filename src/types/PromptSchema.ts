import { z } from 'zod';

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
    }).optional()
});

export type PromptPayload = z.infer<typeof PromptPayloadSchema>;

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
    output_path: z.string()
});

export type Job = z.infer<typeof JobSchema>;

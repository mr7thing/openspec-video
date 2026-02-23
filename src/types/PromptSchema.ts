import { z } from 'zod';

export const PromptPayloadSchema = z.object({
    global_settings: z.object({
        aspect_ratio: z.string(),
        quality: z.string().default("4K")
    }),
    subject: z.object({
        identity_ref: z.string().optional(), // ID reference to character asset
        description: z.string(),
        action: z.string().optional(),
        clothing: z.string().optional()
    }),
    environment: z.object({
        location: z.string().optional(),
        lighting: z.string().optional(),
        details: z.array(z.string()).optional()
    }),
    camera: z.object({
        type: z.string().optional(),
        focus: z.string().optional(),
        motion: z.string().optional() // For video generation
    }),
    prompt: z.string().optional() // Raw prompt override
});

export type PromptPayload = z.infer<typeof PromptPayloadSchema>;

export const JobSchema = z.object({
    id: z.string(), // shot_id
    type: z.enum(['image_generation', 'video_generation']),
    target_tool: z.enum(['nano_banana_pro', 'veo_3_1']),
    payload: PromptPayloadSchema,
    assets: z.array(z.string()), // Absolute paths to references
    output_path: z.string(),
    _meta: z.object({
        project: z.string(),
        timestamp: z.string(),
        mode: z.string()
    }).optional()
});

export type Job = z.infer<typeof JobSchema>;

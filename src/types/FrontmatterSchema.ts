import { z } from 'zod';

// ============================================================================
// OpenSpec-Video v0.5 Frontmatter Schema
// 四层规范体系 — 第二层：文档标头
// ============================================================================

// ---- 资产类型枚举 ----
export const AssetTypeEnum = z.enum([
    'character', 'prop', 'costume', 'scene',
    'shot-design', 'shot-production', 'project'
]);
export type AssetType = z.infer<typeof AssetTypeEnum>;

// ---- 文档状态枚举 ----
export const StatusEnum = z.enum(['drafting', 'draft', 'approved']);
export type Status = z.infer<typeof StatusEnum>;

// ---- 通用 frontmatter（所有文档类型） ----
export const BaseFrontmatterSchema = z.object({
    type: AssetTypeEnum,
    status: StatusEnum,
    // 视觉简述（用于列表展示）
    visual_brief: z.string().optional(),
    // 视觉详细特征描述（用于驱动 prompt_en 生成，v0.5.6 引入）
    visual_detailed: z.string().optional(),
    // 最终渲染 Prompt（YAML 驱动）
    prompt_en: z.string().optional(),
    // 资产引用与变体依赖（合并为统一数组，第一个通常为变体父级）
    refs: z.array(z.string()).optional(),
    // 审阅记录 "YYYY-MM-DD: 描述"
    reviews: z.array(z.string()).optional(),
});
export type BaseFrontmatter = z.infer<typeof BaseFrontmatterSchema>;

// ---- 项目文档额外字段 ----
export const ProjectFrontmatterSchema = BaseFrontmatterSchema.extend({
    aspect_ratio: z.string().optional(),
    resolution: z.string().optional(),
    global_style_postfix: z.string().optional(),
    vision: z.string().optional(),
    engine: z.string().optional(),
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;

// ---- 分镜设计文档额外字段 (Script.md) ----
export const ShotDesignFrontmatterSchema = BaseFrontmatterSchema.extend({
    title: z.string().optional(),
    total_shots: z.number().optional(),
    style: z.string().optional(),
});
export type ShotDesignFrontmatter = z.infer<typeof ShotDesignFrontmatterSchema>;

// ---- 分镜生产文档额外字段 (Shotlist.md) ----
export const ShotProductionFrontmatterSchema = BaseFrontmatterSchema.extend({
    title: z.string().optional(),
    frame_ref: z.object({
        first: z.string().nullable().optional(),
        last: z.string().nullable().optional(),
    }).optional(),
});
export type ShotProductionFrontmatter = z.infer<typeof ShotProductionFrontmatterSchema>;

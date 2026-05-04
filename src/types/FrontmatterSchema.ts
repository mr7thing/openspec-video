import { z } from 'zod';

// ============================================================================
// OpsV v0.8 Frontmatter Schema
// ============================================================================

// Document category — organizational classification, NOT generation type.
// Generation type (imagen/video/audio/comfy/webapp) comes from api_config.yaml via --model.
export const AssetCategoryEnum = z.enum([
  'character', 'prop', 'costume', 'scene',
  'shot-design', 'shot-production', 'project'
]);
export type AssetCategory = z.infer<typeof AssetCategoryEnum>;

export const StatusEnum = z.enum(['drafting', 'syncing', 'approved']);
export type Status = z.infer<typeof StatusEnum>;

export const BaseFrontmatterSchema = z.object({
  category: AssetCategoryEnum,
  status: StatusEnum,
  visual_brief: z.string().optional(),
  visual_detailed: z.string().optional(),
  prompt_en: z.string().optional(),
  refs: z.array(z.string()).optional(),
  reviews: z.array(z.string()).optional(),
  workflow: z.string().optional(),
  node_mapping: z.record(z.object({
    nodeId: z.string(),
    fieldName: z.string(),
  })).optional(),
});
export type BaseFrontmatter = z.infer<typeof BaseFrontmatterSchema>;

export const ProjectFrontmatterSchema = BaseFrontmatterSchema.extend({
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  global_style_postfix: z.string().optional(),
  vision: z.string().optional(),
});
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;

export const ShotDesignFrontmatterSchema = BaseFrontmatterSchema.extend({
  title: z.string().optional(),
  total_shots: z.number().optional(),
  style: z.string().optional(),
});
export type ShotDesignFrontmatter = z.infer<typeof ShotDesignFrontmatterSchema>;

export const ShotProductionFrontmatterSchema = BaseFrontmatterSchema.extend({
  title: z.string().optional(),
  id: z.string().optional(),
  first_frame: z.string().optional(),
  last_frame: z.string().optional(),
  duration: z.string().optional(),
  frame_ref: z.object({
    first: z.string().nullable().optional(),
    last: z.string().nullable().optional(),
  }).optional(),
  video_path: z.string().nullable().optional(),
  ref_videos: z.array(z.string()).optional(),
  ref_audios: z.array(z.string()).optional(),
});
export type ShotProductionFrontmatter = z.infer<typeof ShotProductionFrontmatterSchema>;

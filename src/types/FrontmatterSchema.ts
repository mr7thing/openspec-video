import { z } from 'zod';

// ============================================================================
// OpsV Frontmatter Schema
// ============================================================================

// Document category — organizational classification, NOT generation type.
// Generation type (imagen/video/audio/comfy/webapp) comes from api_config.yaml via --model.
export const AssetCategoryEnum = z.string();
export type AssetCategory = string;

export const StatusEnum = z.enum(['drafting', 'syncing', 'approved']);
export type Status = z.infer<typeof StatusEnum>;

export const NodeMappingSchema = z.record(z.object({
  nodeId: z.string(),
  fieldName: z.string(),
}));
export type NodeMapping = z.infer<typeof NodeMappingSchema>;

export const RefEntrySchema = z.object({
  id: z.string(),
  type: z.string().optional(),
});
export type RefEntry = z.infer<typeof RefEntrySchema>;

export interface ResolvedRef {
  id: string;
  variant?: string;
  type: string;
  docPath: string;
  outputs: string[];
}

export interface TypedSectionRef {
  type: string;
  refId: string;
  label: string;
  variant?: string;
}

export const BaseFrontmatterSchema = z.object({
  category: z.string(),
  status: StatusEnum,
  visual_brief: z.string().optional(),
  visual_detailed: z.string().optional(),
  prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
  refs: z.array(RefEntrySchema).optional(),
  reviews: z.array(z.string()).optional(),
  workflow: z.string().optional(),              // Deprecated: use workflow_id or workflow_path
  workflow_id: z.string().optional(),            // RunningHub workflowId
  workflow_path: z.string().optional(),          // ComfyUI Local JSON filename
  node_mapping: NodeMappingSchema.optional(),
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

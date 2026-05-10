// ============================================================================
// OpsV v0.8 Manifest & Review Schema
// Aligned with DependencyGraph.Manifest interface
// ============================================================================

import { z } from 'zod';
import { StatusEnum } from './FrontmatterSchema';

export const ManifestAssetEntrySchema = z.object({
  status: StatusEnum,
  layer: z.number(),
  category: z.string().optional(),
});
export type ManifestAssetEntry = z.infer<typeof ManifestAssetEntrySchema>;

export const ManifestCircleEntrySchema = z.object({
  circle: z.string(),
  layer: z.number(),
  assetIds: z.array(z.string()),
  status: z.record(StatusEnum).optional(),
});
export type ManifestCircleEntry = z.infer<typeof ManifestCircleEntrySchema>;

export const CircleManifestSchema = z.object({
  version: z.string(),
  target: z.string(),
  generatedAt: z.string(),
  assets: z.record(ManifestAssetEntrySchema).optional(),
  circles: z.array(ManifestCircleEntrySchema).optional(),
});
export type CircleManifest = z.infer<typeof CircleManifestSchema>;

export const ManifestInfoSchema = z.object({
  manifestPath: z.string(),
  circleDir: z.string(),
  circleName: z.string(),
  manifest: CircleManifestSchema,
});
export type ManifestInfo = z.infer<typeof ManifestInfoSchema>;

export const DocumentOutputSchema = z.object({
  circle: z.string(),
  provider: z.string(),
  filename: z.string(),
  path: z.string(),
});
export type DocumentOutput = z.infer<typeof DocumentOutputSchema>;

export const DocumentInfoSchema = z.object({
  docId: z.string(),
  docPath: z.string(),
  circle: z.string(),
  category: z.string(),
  status: z.string(),
  content: z.string().optional(),
  outputs: z.array(DocumentOutputSchema),
});
export type DocumentInfo = z.infer<typeof DocumentInfoSchema>;

export const ReviewEntrySchema = z.object({
  timestamp: z.string(),
  action: z.enum(['approved', 'syncing', 'rejected']),
  outputFile: z.string().optional(),
  modifiedTaskPath: z.string().optional(),
});
export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;

export const ReviewOptionsSchema = z.object({
  port: z.coerce.number().default(3100),
  circle: z.union([z.boolean(), z.string()]).optional(),
  latest: z.boolean().optional(),
  all: z.boolean().optional(),
  ttl: z.coerce.number().default(900),
});
export type ReviewOptions = z.infer<typeof ReviewOptionsSchema>;

export interface CircleSummary {
  name: string;
  target: string;
  assetCount: number;
  layers: number;
}

export interface CircleAssetsResult {
  circle: string;
  assets: Array<{
    id: string;
    status: string;
    layer: number;
    category?: string;
    outputs: string[];
  }>;
}

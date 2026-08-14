// ============================================================================
// OpsV Canonical Model v1 — schema (Zod)
//
// The Canonical Model is the intermediate representation (IR) produced by
// parsing Asset Documents. It is a machine contract, NOT a storage format.
// Spec: .trellis/spec/canonical-model/canonical-types.md
//
// Invariant: the Canonical Model is always derived from the Asset Document
// and is never a second authority over it. Round-trip must be lossless.
// ============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// ReferenceExpression (Reference DSL v2)
// ---------------------------------------------------------------------------

export const CanonicalReferenceSchema = z.object({
  type: z.literal('reference'),
  /** 'asset' by default; 'FRAME' reserved for shotsdeck continuity. */
  namespace: z.string().default('asset'),
  /** Bare id: alice / shot-023 / scene.temple */
  id: z.string().min(1),
  /** Member access (.face / .costume / .output) — only when the Pack allowlists it. */
  selector: z.string().optional(),
  /** Version pin (:v3) */
  variant: z.string().optional(),
  /** State pin ([approved] / [latest]) */
  state: z.string().optional(),
  /** Exact original text (@alice:v3) — round-trip uses this. */
  raw: z.string().min(1),
});
export type CanonicalReference = z.infer<typeof CanonicalReferenceSchema>;

// ---------------------------------------------------------------------------
// Constraint
// ---------------------------------------------------------------------------

export const CanonicalConstraintSchema = z.object({
  kind: z.string(),
  level: z.union([z.literal('strict'), z.literal('loose'), z.string()]),
});
export type CanonicalConstraint = z.infer<typeof CanonicalConstraintSchema>;

// ---------------------------------------------------------------------------
// Timeline / Segment — first-class semantic container
// ---------------------------------------------------------------------------

export const CanonicalCameraSchema = z.object({
  shot: z.string().optional(),
  movement: z.string().optional(),
  speed: z.string().optional(),
});
export type CanonicalCamera = z.infer<typeof CanonicalCameraSchema>;

export const CanonicalSegmentSchema = z.object({
  id: z.string().min(1),
  start: z.number(),
  end: z.number(),
  subjects: z.array(CanonicalReferenceSchema).default([]),
  scene: z.array(CanonicalReferenceSchema).optional(),
  action: z.string().optional(),
  camera: CanonicalCameraSchema.optional(),
  prompt: z.string().optional(),
  references: z.array(CanonicalReferenceSchema).optional(),
  constraints: z.array(CanonicalConstraintSchema).optional(),
});
export type CanonicalSegment = z.infer<typeof CanonicalSegmentSchema>;

export const CanonicalTimelineSchema = z.object({
  segments: z.array(CanonicalSegmentSchema),
  frameRate: z.number().optional(),
  /** Derived: sum of segment durations. Not authoritative when segments are empty. */
  duration: z.number().optional(),
});
export type CanonicalTimeline = z.infer<typeof CanonicalTimelineSchema>;

// ---------------------------------------------------------------------------
// Approved variant
// ---------------------------------------------------------------------------

export const ApprovedVariantSchema = z.object({
  variant: z.string().min(1),
  artifactPath: z.string(),
  supersedes: z.string().optional(),
});
export type ApprovedVariant = z.infer<typeof ApprovedVariantSchema>;

// ---------------------------------------------------------------------------
// Artifact — contract-validated output
// ---------------------------------------------------------------------------

export const MediaInfoSchema = z.object({
  duration: z.number().optional(),
  codec: z.string().optional(),
  resolution: z.object({ w: z.number(), h: z.number() }).optional(),
});
export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export const ProvenanceSchema = z.object({
  actor: z.string(),
  capability: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const AssetStateEnum = z.enum([
  'draft',
  'candidate',
  'review',
  'approved',
  'released',
  'rejected',
  'superseded',
]);
export type AssetState = z.infer<typeof AssetStateEnum>;

/** Artifact validation result. Contract shape lands in P3 (artifact-contract.md). */
export const ArtifactValidationResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(
    z.object({
      rule: z.string(),
      expected: z.unknown().optional(),
      actual: z.unknown().optional(),
    }),
  ).default([]),
});
export type ArtifactValidationResult = z.infer<typeof ArtifactValidationResultSchema>;

export const CanonicalArtifactSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  uri: z.string(),
  type: z.string(),
  mediaInfo: MediaInfoSchema.optional(),
  provenance: ProvenanceSchema,
  validation: ArtifactValidationResultSchema.default({ ok: false, errors: [] }),
  state: AssetStateEnum.default('draft'),
});
export type CanonicalArtifact = z.infer<typeof CanonicalArtifactSchema>;

// ---------------------------------------------------------------------------
// Review — review as state mutation
// ---------------------------------------------------------------------------

export const CanonicalReviewSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  artifactId: z.string().optional(),
  kind: z.enum(['annotation', 'feedback', 'revise', 'approve', 'reject']),
  timeline: z.object({ start: z.number(), end: z.number() }).optional(),
  target: z.string().optional(),
  issue: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  comment: z.string(),
  actor: z.object({ type: z.enum(['human', 'agent', 'system']), id: z.string() }),
  timestamp: z.string(),
});
export type CanonicalReview = z.infer<typeof CanonicalReviewSchema>;

// ---------------------------------------------------------------------------
// Document — parsed Asset Document (frontmatter envelope + raw body)
// ---------------------------------------------------------------------------

export const AssetLifecycleStatusEnum = z.enum(['drafting', 'syncing', 'approved']);
export type AssetLifecycleStatus = z.infer<typeof AssetLifecycleStatusEnum>;

export const CanonicalDocumentSchema = z.object({
  category: z.string(),
  status: AssetLifecycleStatusEnum,
  /** Optional — the frontmatter envelope is loose in practice (not all docs carry id). */
  id: z.string().optional(),
  prompt: z.string().optional(),
  visualBrief: z.string().optional(),
  visualDetailed: z.string().optional(),
  negativePrompt: z.string().optional(),
  /** External + design refs extracted from the frontmatter refs map. */
  refs: z.object({
    external: z.array(CanonicalReferenceSchema).default([]),
    design: z.array(CanonicalReferenceSchema).default([]),
  }).default({ external: [], design: [] }),
  /** Raw review entries from the frontmatter reviews array. */
  reviews: z.array(z.string()).default([]),
  /** Raw body, preserved verbatim. Segment/timeline parsing lands in P2. */
  bodyRaw: z.string(),
  /**
   * Unmodeled frontmatter fields, preserved verbatim so round-trip is lossless.
   * This is a fidelity mechanism, not a second authority.
   */
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type CanonicalDocument = z.infer<typeof CanonicalDocumentSchema>;

// ---------------------------------------------------------------------------
// Asset — one asset's canonical projection
// ---------------------------------------------------------------------------

export const CanonicalAssetSchema = z.object({
  id: z.string(),
  category: z.string(),
  /** Document path relative to project root. */
  docPath: z.string(),
  document: CanonicalDocumentSchema,
  timeline: CanonicalTimelineSchema.optional(),
  refs: z.object({
    external: z.array(CanonicalReferenceSchema).default([]),
    design: z.array(CanonicalReferenceSchema).default([]),
  }).default({ external: [], design: [] }),
  approvedRefs: z.array(ApprovedVariantSchema).default([]),
  status: AssetLifecycleStatusEnum,
  artifacts: z.array(CanonicalArtifactSchema).default([]),
  reviews: z.array(CanonicalReviewSchema).default([]),
});
export type CanonicalAsset = z.infer<typeof CanonicalAssetSchema>;

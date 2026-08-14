// ============================================================================
// Artifact Contract — what an artifact must satisfy to become an OPSV asset
//
// The contract prescribes acceptance conditions, never how the artifact was
// generated. `opsv commit` / `opsv import` validate against it.
// Spec: .trellis/spec/canonical-model/artifact-contract.md
// ============================================================================

import { z } from 'zod';

export const DurationRuleSchema = z.object({
  duration: z.object({ tolerance: z.number().nonnegative() }),
});
export const CodecRuleSchema = z.object({
  codec: z.object({ allowed: z.array(z.string()) }),
});
export const ResolutionRuleSchema = z.object({
  resolution: z.object({ min: z.object({ w: z.number(), h: z.number() }) }),
});
export const FrameRateRuleSchema = z.object({
  frameRate: z.object({ min: z.number().optional(), max: z.number().optional() }),
});
export const HasAudioRuleSchema = z.object({
  hasAudio: z.boolean(),
});
export const AspectRatioRuleSchema = z.object({
  aspectRatio: z.object({ min: z.number().optional(), max: z.number().optional() }),
});

export const ValidationRuleSchema = z.union([
  DurationRuleSchema,
  CodecRuleSchema,
  ResolutionRuleSchema,
  FrameRateRuleSchema,
  HasAudioRuleSchema,
  AspectRatioRuleSchema,
]);
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;

export const ArtifactContractSchema = z.object({
  contract: z.string().optional(),
  output: z.object({ type: z.string() }),
  required: z.object({
    uri: z.boolean().optional(),
    media_info: z.boolean().optional(),
    provenance: z.boolean().optional(),
  }).default({}),
  validation: z.array(ValidationRuleSchema).default([]),
  metadata: z.record(z.string(), z.boolean()).default({}),
});
export type ArtifactContract = z.infer<typeof ArtifactContractSchema>;

/**
 * The Core built-in minimal contract — the default when a task/profile
 * declares none. uri + provenance are required; type must match; duration
 * and codec/resolution are validated only when probed and rule present.
 */
export const DEFAULT_ARTIFACT_CONTRACT: ArtifactContract = {
  contract: 'builtin/v1',
  output: { type: '*' },
  required: { uri: true, provenance: true },
  validation: [],
  metadata: { provider: false, model: false, prompt: false },
};

/**
 * Resolve a (possibly partial) contract by merging it over the built-in
 * default. Falls back to the default entirely when none is given.
 */
export function loadArtifactContract(contract?: Partial<ArtifactContract>): ArtifactContract {
  const merged: ArtifactContract = {
    ...DEFAULT_ARTIFACT_CONTRACT,
    ...contract,
    output: { ...DEFAULT_ARTIFACT_CONTRACT.output, ...(contract?.output ?? {}) },
    required: { ...DEFAULT_ARTIFACT_CONTRACT.required, ...(contract?.required ?? {}) },
    validation: contract?.validation ?? DEFAULT_ARTIFACT_CONTRACT.validation,
    metadata: { ...DEFAULT_ARTIFACT_CONTRACT.metadata, ...(contract?.metadata ?? {}) },
  };
  const parsed = ArtifactContractSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid artifact contract: ${parsed.error.message}`);
  }
  return parsed.data;
}

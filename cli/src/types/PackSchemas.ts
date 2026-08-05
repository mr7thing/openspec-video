// ============================================================================
// Pack contract Zod schemas — the single decode path for pack.yaml and
// exported Category/Profile/Skill manifests. Runtime resolvers
// (ProjectConfig/PackContracts) and the static checker (PackChecker) both
// decode through these schemas; no command-layer casts allowed.
// ============================================================================

import { z } from 'zod';

export const PolicyLevelSchema = z.enum(['auto', 'ask', 'human']);
export type PolicyLevel = z.infer<typeof PolicyLevelSchema>;

const POLICY_ACTION_KEYS = ['draft', 'compile', 'execute', 'approve', 'sync', 'delete'] as const;

// Null is tolerated for forward compatibility with packs that use an empty
// YAML value to mean "fall back to defaults"; the checker normalizes it out.
export const ActionPolicySchema = z.object({
  draft: PolicyLevelSchema.nullish(),
  compile: PolicyLevelSchema.nullish(),
  execute: PolicyLevelSchema.nullish(),
  approve: PolicyLevelSchema.nullish(),
  sync: PolicyLevelSchema.nullish(),
  delete: z.literal('never').nullish(),
}).passthrough();
export type ActionPolicy = z.infer<typeof ActionPolicySchema>;
export const KNOWN_POLICY_KEYS: readonly string[] = POLICY_ACTION_KEYS;

export const PackManifestSchema = z.object({
  id: z.coerce.string().min(1),
  version: z.coerce.string().min(1),
  dependencies: z.array(z.unknown()).optional(),
  // Lenient here so the checker can report PACK_POLICY_INVALID (a dedicated
  // code) instead of failing the whole manifest decode. Validated separately
  // via ActionPolicySchema in PackChecker and policy-aware consumers.
  policy: z.record(z.string(), z.unknown()).optional(),
  categories: z.record(z.string()).optional(),
  profiles: z.record(z.string()).optional(),
  skills: z.record(z.string()).optional(),
}).passthrough();
export type PackManifest = z.infer<typeof PackManifestSchema>;

export const CategoryContractSchema = z.object({
  default_profile: z.string().optional(),
  profiles: z.array(z.string()).optional(),
}).passthrough();
export type CategoryContract = z.infer<typeof CategoryContractSchema>;

export const MaterializeTargetSchema = z.object({
  directory: z.string(),
  category: z.string(),
}).passthrough();

const ProfileBaseSchema = z.object({
  capability: z.string().optional(),
  skill: z.string().optional(),
  frame_directive: z.boolean().optional(),
  required_ref_categories: z.array(z.string()).optional(),
  materialize: z.object({
    clips: MaterializeTargetSchema.optional(),
    shots: MaterializeTargetSchema.optional(),
  }).passthrough().optional(),
}).passthrough();

export const ProfileContractSchema = z.discriminatedUnion('kind', [
  ProfileBaseSchema.extend({
    kind: z.literal('workflow'),
    outputs: z.undefined({ invalid_type_error: 'workflow Profile must not declare outputs' }),
  }),
  ProfileBaseSchema.extend({
    kind: z.literal('production'),
    outputs: z.array(z.string()).min(1, 'production Profile must declare outputs'),
  }),
]);
export type ProfileContract = z.infer<typeof ProfileContractSchema>;

export const SKILL_ACTIONS = ['draft', 'materialize', 'compile', 'review'] as const;
export const SkillManifestSchema = z.object({
  name: z.string().optional(),
  action: z.enum(SKILL_ACTIONS),
  category: z.string().optional(),
  profile: z.string().optional(),
  gates: z.array(z.string()).optional(),
  completion: z.string().optional(),
}).passthrough().superRefine((value, ctx) => {
  // Review/router skills are not bound to a Category/Profile pair; every
  // other action requires both so cross-file closure can be verified.
  if (value.action !== 'review') {
    if (!value.category) ctx.addIssue({ code: 'custom', path: ['category'], message: `Skill action "${value.action}" requires a category` });
    if (!value.profile) ctx.addIssue({ code: 'custom', path: ['profile'], message: `Skill action "${value.action}" requires a profile` });
  }
});
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// ============================================================================
// Pack contract Zod schemas — the single decode path for pack.yaml and
// exported Category/Profile/Skill manifests. Runtime resolvers
// (ProjectConfig/PackContracts) and the static checker (PackChecker) both
// decode through these schemas; no command-layer casts allowed.
//
// A Pack has three explicit responsibility layers (C2 schema evolution):
//   1. Workflow        — graph.yaml (stages) + profiles: stage inputs/outputs
//                        and completion conditions.
//   2. Toolset         — skills + Stage.recommended_capabilities: soft
//                        recommendations only, never a whitelist.
//   3. Spec constraints — categories / document Contracts / gates: hard
//                        validation enforced by the checker and runtime.
// ============================================================================

import { z } from 'zod';
import { ArtifactContractSchema } from '../canonical/artifacts/ArtifactContract';

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

/**
 * Declarative ordered input slot (T07). Declaration order in the profile IS
 * the reference order contract: the asset document's external refs under
 * `refs[ref_type]` (document order) must match slots 1:1 in order.
 */
export const InputSlotSchema = z.object({
  slot: z.string().min(1),
  category: z.string().min(1),
  ref_type: z.string().min(1).default('image'),
  required: z.boolean().default(true),
}).passthrough();
export type InputSlot = z.infer<typeof InputSlotSchema>;

/**
 * A semantic contract identity, not an executable file path. Contract bodies
 * remain owned by their compiler/runtime; Profiles bind the versioned identity
 * so Snapshot/Task digests can distinguish semantic revisions.
 */
export const VersionedContractReferenceSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.string().min(1),
}).strict();
export type VersionedContractReference = z.infer<typeof VersionedContractReferenceSchema>;

const ProfileBaseSchema = z.object({
  capability: z.string().optional(),
  skill: z.string().optional(),
  frame_directive: z.boolean().optional(),
  required_ref_categories: z.array(z.string()).optional(),
  inputs: z.array(InputSlotSchema).optional(),
  materialize: z.object({
    clips: MaterializeTargetSchema.optional(),
    shots: MaterializeTargetSchema.optional(),
  }).passthrough().optional(),
  prompt_contract: VersionedContractReferenceSchema.optional(),
  task_contract: VersionedContractReferenceSchema.optional(),
  artifact: ArtifactContractSchema.optional(),
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
]).superRefine((value, ctx) => {
  const slots = (value.inputs || []).map(input => input.slot);
  const duplicate = slots.find((slot, index) => slots.indexOf(slot) !== index);
  if (duplicate) ctx.addIssue({ code: 'custom', path: ['inputs'], message: `Duplicate input slot "${duplicate}"` });
  if (
    value.kind === 'production'
    && value.artifact
    && value.artifact.output.type !== '*'
    && !value.outputs.includes(value.artifact.output.type)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['artifact', 'output', 'type'],
      message: `Artifact output type "${value.artifact.output.type}" is not declared in production outputs`,
    });
  }
});
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

// ============================================================================
// graph.yaml — Workflow layer: Stage-level contract definitions (C2).
// Backward compatible: a node may still be a bare dependency array
// (`script: [shotlist]`); the object form adds optional Stage fields and
// missing fields inherit the profile's lenient behavior.
// ============================================================================

/** The four standard Roles a Stage can declare applicability for. */
export const STAGE_ROLES = [
  'document-author',
  'contract-checker',
  'production-dispatcher',
  'asset-quality-reviewer',
] as const;
export type StageRole = (typeof STAGE_ROLES)[number];

export const StageRoleApplicabilitySchema = z.enum(['required', 'optional', 'not_applicable']);
export type StageRoleApplicability = z.infer<typeof StageRoleApplicabilitySchema>;

/**
 * Per-Role applicability declaration. Strict on purpose: an unknown key is a
 * typo of a standard Role and must fail validation (PACK_STAGE_INVALID).
 */
export const StageRolesSchema = z.object({
  'document-author': StageRoleApplicabilitySchema.optional(),
  'contract-checker': StageRoleApplicabilitySchema.optional(),
  'production-dispatcher': StageRoleApplicabilitySchema.optional(),
  'asset-quality-reviewer': StageRoleApplicabilitySchema.optional(),
}).strict();
export type StageRoles = z.infer<typeof StageRolesSchema>;

/** Declarative Stage completion conditions (hard-checkable rule names). */
export const STAGE_COMPLETION_RULES = [
  'output_exists',
  'output_contract_valid',
  'document_status_approved',
] as const;
export const StageCompletionRuleSchema = z.enum(STAGE_COMPLETION_RULES);
export type StageCompletionRule = z.infer<typeof StageCompletionRuleSchema>;

/**
 * Stage-level node definition (object form). All fields optional — a Stage
 * declares goals (inputs/outputs/completion), not implementations;
 * `recommended_capabilities` is a soft recommendation, never a whitelist.
 */
export const StageNodeSchema = z.object({
  /** DAG dependencies (object-form equivalent of the legacy array value). */
  depends_on: z.array(z.string()).optional(),
  /** Required input documents/references for the Stage. */
  inputs: z.array(z.string()).optional(),
  outputs: z.object({
    /** Name of the output Contract the Stage must satisfy. */
    contract: z.string().optional(),
  }).passthrough().optional(),
  completion: z.array(StageCompletionRuleSchema).optional(),
  /** Pack-relative guidance doc path(s); single string or list. */
  quality_guidance: z.union([z.string(), z.array(z.string())]).optional(),
  roles: StageRolesSchema.optional(),
  recommended_capabilities: z.array(z.string()).optional(),
}).passthrough();
export type StageNode = z.infer<typeof StageNodeSchema>;

/** Legacy form: node name -> dependency list. Object form: Stage definition. */
export const GraphNodeSchema = z.union([z.array(z.string()), StageNodeSchema]);
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphContractSchema = z.object({
  workflow: z.record(GraphNodeSchema).optional(),
}).passthrough();
export type GraphContract = z.infer<typeof GraphContractSchema>;

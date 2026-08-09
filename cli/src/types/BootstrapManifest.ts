// ============================================================================
// Bootstrap Manifest — Zod schema for `.opsv/bootstrap/manifest.json` (C1).
//
// `opsv bootstrap` materializes the project-level execution context from the
// Pack Stack + Project Config: pack lock info, Workflow Graph (derived from
// graph.yaml + profiles), Document/Prompt Contract references, Input/Output
// definitions, Gate/Policy, recommended capabilities, and Role Context
// template reference slots (template bodies land in C3).
//
// The Pack-side graph.yaml read projection lives here temporarily: C2 owns
// the canonical Stage Contract schema in types/PackSchemas.ts; this reader
// stays a tolerant superset (list-form dependency DAG + object-form stage
// fields) and must never be stricter than the Pack checker.
// ============================================================================

import { z } from 'zod';

export const BOOTSTRAP_CONTRACT_VERSION = 1;

/**
 * The four standard roles (analysis §7). Kept in sync with
 * core/WorkContext.ts WORK_CONTEXT_ROLES — a test pins the equality; C3
 * materializes the template bodies at the referenced paths.
 */
export const BOOTSTRAP_ROLES = [
  'document-author',
  'contract-checker',
  'production-dispatcher',
  'asset-quality-reviewer',
] as const;
export type BootstrapRole = (typeof BOOTSTRAP_ROLES)[number];

export const BootstrapRoleSchema = z.enum([
  'document-author',
  'contract-checker',
  'production-dispatcher',
  'asset-quality-reviewer',
]);

/** Role Context template reference slot. C1 fixes the reference location
 *  (`status: pending`); C3 materializes the body and flips the status. */
export const BootstrapRoleTemplateSchema = z.object({
  role: BootstrapRoleSchema,
  /** Project-root-relative POSIX path of the template body. */
  template: z.string(),
  status: z.enum(['pending', 'materialized']),
});
export type BootstrapRoleTemplate = z.infer<typeof BootstrapRoleTemplateSchema>;

export const BootstrapDiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type BootstrapDiagnostic = z.infer<typeof BootstrapDiagnosticSchema>;

export const BootstrapInputSlotSchema = z.object({
  slot: z.string(),
  category: z.string(),
  refType: z.string(),
  required: z.boolean(),
});
export type BootstrapInputSlot = z.infer<typeof BootstrapInputSlotSchema>;

export const BootstrapPackSchema = z.object({
  id: z.string(),
  version: z.string(),
  /** Declared source from .opsv/project.yaml (POSIX separators). */
  source: z.string(),
  /** Resolved pack root: project-root-relative POSIX; absolute for external sources. */
  root: z.string(),
  /** True when pack-lock.yaml v2 holds an entry matching the live digests. */
  locked: z.boolean(),
  /** sha256 of pack.yaml bytes. */
  manifestDigest: z.string(),
  /** Canonical Pack tree digest (core/PackDigest.ts, single owner). */
  contentDigest: z.string(),
  /** sha256 of graph.yaml bytes; null when the Pack declares no workflow graph. */
  graphDigest: z.string().nullable(),
});
export type BootstrapPack = z.infer<typeof BootstrapPackSchema>;

/** Stage Contract fields (C2 shape), surfaced verbatim when a Pack declares
 *  them in graph.yaml. Missing fields mean "inherit the profile's lenient
 *  behavior" — bootstrap never invents defaults. */
export const BootstrapStageSchema = z.object({
  inputs: z.array(z.string()).optional(),
  /** Verbatim copy of the C2 Stage outputs object (`contract` plus Pack-defined extras). */
  outputs: z.object({ contract: z.string().optional() }).passthrough().optional(),
  completion: z.array(z.string()).optional(),
  /** C2 allows a single path or a list; surfaced verbatim. */
  qualityGuidance: z.union([z.string(), z.array(z.string())]).optional(),
  roles: z.record(z.string()).optional(),
  recommendedCapabilities: z.array(z.string()).optional(),
});
export type BootstrapStage = z.infer<typeof BootstrapStageSchema>;

export const WorkflowGraphNodeSchema = z.object({
  id: z.string(),
  /** Pack whose graph.yaml declares this stage. */
  pack: z.string(),
  /** Stage dependencies as declared by the Pack (edge direction verbatim). */
  dependsOn: z.array(z.string()),
  stage: BootstrapStageSchema.optional(),
  /** Category contract reference, when the Pack exports a category with this id. */
  category: z.object({
    path: z.string(),
    defaultProfile: z.string().optional(),
    profiles: z.array(z.string()).optional(),
  }).optional(),
  /** Derived from the category's default Profile (graph.yaml + profiles). */
  profile: z.object({
    name: z.string(),
    kind: z.enum(['workflow', 'production']),
    capability: z.string().optional(),
    skill: z.string().optional(),
    inputs: z.array(BootstrapInputSlotSchema).optional(),
    outputs: z.array(z.string()).optional(),
  }).optional(),
  /** Gates declared by the profile's primary Skill manifest. */
  gates: z.array(z.string()).optional(),
});
export type WorkflowGraphNode = z.infer<typeof WorkflowGraphNodeSchema>;

export const BootstrapManifestSchema = z.object({
  contractVersion: z.literal(BOOTSTRAP_CONTRACT_VERSION),
  generatedAt: z.string(),
  digestAlgorithm: z.string(),
  /** Combined digest over Pack content digests + graph.yaml digests + the
   *  Project Config hash. Single input to the bootstrap_stale judgement. */
  contentDigest: z.string(),
  projectConfig: z.object({
    path: z.string(),
    digest: z.string(),
  }),
  packs: z.array(BootstrapPackSchema),
  workflowGraph: z.array(WorkflowGraphNodeSchema),
  documentContracts: z.array(z.object({
    category: z.string(),
    pack: z.string(),
    path: z.string(),
    defaultProfile: z.string().optional(),
    profiles: z.array(z.string()).optional(),
  })),
  promptContract: z.object({
    refSyntax: z.array(z.string()),
  }),
  io: z.object({
    inputs: z.array(BootstrapInputSlotSchema.extend({
      pack: z.string(),
      profile: z.string(),
    })),
    outputs: z.array(z.object({
      pack: z.string(),
      profile: z.string(),
      outputs: z.array(z.string()),
    })),
  }),
  policy: z.object({
    project: z.record(z.string(), z.string()).optional(),
    packs: z.array(z.object({
      pack: z.string(),
      effective: z.record(z.string(), z.string()),
      issues: z.array(BootstrapDiagnosticSchema),
    })),
  }),
  gates: z.array(z.object({
    pack: z.string(),
    skill: z.string(),
    action: z.string().optional(),
    gates: z.array(z.string()),
  })),
  /** Soft recommendations only — never a whitelist (non-goal #6). */
  recommendedCapabilities: z.array(z.object({
    capability: z.string(),
    pack: z.string(),
    profiles: z.array(z.string()),
    /** Project-declared binding (.opsv/project.yaml bindings), when present. */
    binding: z.string().optional(),
  })),
  roles: z.array(BootstrapRoleTemplateSchema),
  diagnostics: z.array(BootstrapDiagnosticSchema),
});
export type BootstrapManifest = z.infer<typeof BootstrapManifestSchema>;

// ---------------------------------------------------------------------------
// graph.yaml read projection (tolerant; canonical Stage schema is C2's).
// ---------------------------------------------------------------------------

const GraphNodeRawSchema = z.union([
  // Current form: plain dependency list.
  z.array(z.string()),
  // Stage-object form (C2 fragment): dependency list plus stage fields.
  // Field shapes mirror types/PackSchemas.ts StageNodeSchema so this reader
  // is never stricter than the Pack checker: outputs is a passthrough object
  // (contract plus Pack-defined extras), quality_guidance a string or list.
  z.object({
    depends_on: z.array(z.string()).optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.object({ contract: z.string().optional() }).passthrough().optional(),
    completion: z.array(z.string()).optional(),
    quality_guidance: z.union([z.string(), z.array(z.string())]).optional(),
    roles: z.record(z.string()).optional(),
    recommended_capabilities: z.array(z.string()).optional(),
  }).passthrough(),
]);
export type PackWorkflowGraphNodeRaw = z.infer<typeof GraphNodeRawSchema>;

export const PackWorkflowGraphFileSchema = z.object({
  // Optional like C2's GraphContractSchema: a graph.yaml without a workflow
  // key is a valid (empty) graph, not a read error.
  workflow: z.record(GraphNodeRawSchema).optional(),
}).passthrough();
export type PackWorkflowGraphFile = z.infer<typeof PackWorkflowGraphFileSchema>;

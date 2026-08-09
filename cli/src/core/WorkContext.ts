// ============================================================================
// WorkContext — Context Manifest materialization (`opsv work context`).
// Single source of truth for hook injection and sub-agent context pull: one
// manifest per (asset, stage, role), built on top of the Work Packet (never
// a parallel computation) plus the resolved Document Contract.
// Standalone: reads only project config, videospec/, and Pack exports —
// never .trellis/.
// Role context is the stage-A minimal set: doc format requirements
// (documentContract), dependency syntax + completion condition
// (promptContract), and Pack guidance paths (guidanceRefs). C3 adds the
// bootstrap-materialized Role Context template (roleTemplate) and the
// fail-fast ROLE_NOT_APPLICABLE judgement for stage `roles` declarations.
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { buildWorkPacket, WorkPacket } from './WorkPacket';
import { resolveDocumentContract, resolvePackExportPath } from './PackContracts';
import { loadProjectConfig } from './ProjectConfig';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';
import { NextAction, WORK_PACKET_CONTRACT_VERSION } from './NextAction';
import { CategoryContract, ProfileContract, SkillManifestSchema, StageCompletionRule, StageRoles } from '../types/PackSchemas';
import { getProjectDir } from '../utils/configLoader';

/** Fixed stage-A role set. Packs may declare additional roles in stage C. */
export const WORK_CONTEXT_ROLES = [
  'document-author',
  'contract-checker',
  'production-dispatcher',
  'asset-quality-reviewer',
] as const;
export type WorkContextRole = (typeof WORK_CONTEXT_ROLES)[number];

export function isWorkContextRole(value: string): value is WorkContextRole {
  return (WORK_CONTEXT_ROLES as readonly string[]).includes(value);
}

export function unknownRoleMessage(role: string): string {
  return `ROLE_UNKNOWN: "${role}" is not a known role (expected one of: ${WORK_CONTEXT_ROLES.join(', ')})`;
}

/** Issue-code message when a Pack's stage `roles` declaration excludes the
 *  requested role (C2 declaration, C3 judgement). */
export function roleNotApplicableMessage(role: WorkContextRole, stage: string): string {
  return `ROLE_NOT_APPLICABLE: role "${role}" is declared not_applicable for stage "${stage}" by the Pack's graph.yaml`;
}

/** Canonical @-ref dependency syntax, mirroring RefSyntaxParser's grammar. */
export const REF_SYNTAX_FORMS: readonly string[] = [
  '@id — external Asset Document reference',
  '@id:variant — external reference pinned to an approved variant',
  '@:key — in-document Design Reference',
  '@FRAME:name_kind — frame reference (resolved at compile time; profile-scoped)',
];

export interface WorkContextDocumentContract {
  category: string;
  /**
   * Project-root-relative POSIX path of the resolved categories/*.yaml.
   * Absolute when the Pack lives outside the project root (external `source:`).
   */
  path?: string;
  /** Decoded category contract; passthrough fields carry doc-format requirements. */
  contract?: CategoryContract;
  profile?: {
    name: string;
    kind: string;
    capability?: string;
    model?: string;
    /** Decoded profiles/*.yaml (inputs, required_ref_categories, outputs, ...). */
    contract: ProfileContract;
  };
}

export interface WorkContextPromptContract {
  /** Canonical @-ref syntax forms (dependency syntax). */
  refSyntax: string[];
  /** Completion condition declared by the primary Skill manifest. */
  completion?: string;
}

/**
 * Workflow-layer Stage view (C2), surfaced when the Pack's graph.yaml declares
 * a node named after the asset's Category. Purely incremental: manifests for
 * Packs without Stage declarations simply omit this field.
 */
export interface WorkContextStage {
  name: string;
  dependsOn: string[];
  inputs?: string[];
  outputs?: { contract?: string };
  /** Declarative completion conditions for the Stage. */
  completion?: StageCompletionRule[];
  /** Four-Role applicability declarations (required/optional/not_applicable). */
  roles?: StageRoles;
  /** Soft capability recommendations — never a whitelist. */
  recommendedCapabilities?: string[];
  /** Quality guidance doc paths: project-root-relative, absolute for external Packs. */
  qualityGuidance?: string[];
}

export interface WorkContextManifest {
  contractVersion: number;
  asset: string;
  role: WorkContextRole;
  nextAction?: NextAction;
  documentContract?: WorkContextDocumentContract;
  promptContract: WorkContextPromptContract;
  stage?: WorkContextStage;
  refs: WorkPacket['refs'];
  policy: Record<string, string>;
  issues: WorkPacket['issues'];
  /** Pack guidance paths (SKILL.md references): project-root-relative, absolute for external Packs. */
  guidanceRefs: string[];
  /**
   * Role Context template (C3): the bootstrap-materialized body for this role
   * plus its project-root-relative path. Omitted when `opsv bootstrap` has not
   * materialized templates (pure increment — never an error here).
   */
  roleTemplate?: { path: string; content: string };
}

/**
 * Project-root-relative POSIX path. Falls back to the absolute path when the
 * target lives outside the project root (external Pack sources), so consumers
 * never receive a `../../` escape whose meaning depends on the process cwd.
 */
function relativePosix(projectRoot: string, absolute: string): string {
  const rel = path.relative(projectRoot, absolute);
  const chosen = rel.startsWith('..') || path.isAbsolute(rel) ? absolute : rel;
  return chosen.split(path.sep).join('/');
}

/** Read the primary Skill manifest's completion condition, when declared. */
function skillCompletion(projectRoot: string, packet: WorkPacket): string | undefined {
  const manifestRelative = packet.primarySkill?.manifest;
  if (!manifestRelative) return undefined;
  const manifestPath = path.resolve(projectRoot, manifestRelative);
  if (!fs.existsSync(manifestPath)) return undefined;
  const parsed = SkillManifestSchema.safeParse(yaml.load(fs.readFileSync(manifestPath, 'utf8')));
  return parsed.success ? parsed.data.completion : undefined;
}

/** Pack guidance paths: the primary Skill's SKILL.md, then the Pack root SKILL.md. */
function guidanceRefs(projectRoot: string, packet: WorkPacket, packRoot?: string): string[] {
  const refs: string[] = [];
  if (packet.primarySkill?.manifest) {
    const skillDoc = path.resolve(projectRoot, path.dirname(packet.primarySkill.manifest), 'SKILL.md');
    if (fs.existsSync(skillDoc)) refs.push(relativePosix(projectRoot, skillDoc));
  }
  if (packRoot) {
    const packDoc = path.join(packRoot, 'SKILL.md');
    if (fs.existsSync(packDoc)) refs.push(relativePosix(projectRoot, packDoc));
  }
  return [...new Set(refs)];
}

/** Mirrors core/Bootstrap.ts BOOTSTRAP_ROLES_DIR_REL. The import direction is
 *  Bootstrap → WorkContext, so the path constant is duplicated here. */
const BOOTSTRAP_ROLE_TEMPLATE_DIR_REL = '.opsv/bootstrap/roles';

/** The bootstrap-materialized Role Context template for this role (C3). */
function roleTemplateRef(projectRoot: string, role: WorkContextRole): { path: string; content: string } | undefined {
  const abs = path.join(projectRoot, BOOTSTRAP_ROLE_TEMPLATE_DIR_REL, `${role}.md`);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined;
  return { path: `${BOOTSTRAP_ROLE_TEMPLATE_DIR_REL}/${role}.md`, content: fs.readFileSync(abs, 'utf8') };
}

export function buildWorkContext(projectRoot: string, selector: string, role: string): WorkContextManifest {
  if (!isWorkContextRole(role)) throw new Error(unknownRoleMessage(role));
  const packet = buildWorkPacket(projectRoot, selector);
  const manifest: WorkContextManifest = {
    contractVersion: WORK_PACKET_CONTRACT_VERSION,
    asset: packet.asset,
    role,
    nextAction: packet.nextAction,
    promptContract: { refSyntax: [...REF_SYNTAX_FORMS], completion: skillCompletion(projectRoot, packet) },
    refs: packet.refs,
    policy: packet.policy,
    issues: packet.issues,
    guidanceRefs: guidanceRefs(projectRoot, packet),
  };
  const roleTemplate = roleTemplateRef(projectRoot, role);
  if (roleTemplate) manifest.roleTemplate = roleTemplate;
  if (!packet.category) return manifest; // CATEGORY_MISSING is already on issues

  // Re-resolve the Document Contract to expose the raw category/profile
  // contracts. The selector → frontmatter lookup mirrors buildWorkPacket so
  // both paths resolve the same profile override.
  const videospec = getProjectDir(projectRoot, 'videospec');
  const filePath = fs.existsSync(path.resolve(projectRoot, selector))
    ? path.resolve(projectRoot, selector)
    : AssetManager.findAssetFilePathUnder(videospec, selector);
  const profileOverride = filePath
    ? FrontmatterParser.parseRaw(fs.readFileSync(filePath, 'utf8')).frontmatter.profile
    : undefined;
  try {
    const resolved = resolveDocumentContract(projectRoot, packet.category, profileOverride, loadProjectConfig(projectRoot));
    const categoryExport = resolved.pack.manifest.categories?.[packet.category];
    manifest.documentContract = {
      category: packet.category,
      path: categoryExport ? relativePosix(projectRoot, resolvePackExportPath(resolved.pack.root, categoryExport)) : undefined,
      contract: resolved.category,
      profile: {
        name: resolved.profileName,
        kind: resolved.profile.kind,
        capability: resolved.profile.capability,
        model: resolved.boundModel,
        contract: resolved.profile,
      },
    };
    manifest.guidanceRefs = guidanceRefs(projectRoot, packet, resolved.pack.root);
    if (resolved.stage) {
      const stage = resolved.stage;
      manifest.stage = {
        name: stage.name,
        dependsOn: stage.dependsOn,
        inputs: stage.inputs,
        outputs: stage.outputs,
        completion: stage.completion,
        roles: stage.roles,
        recommendedCapabilities: stage.recommended_capabilities,
        qualityGuidance: stage.quality_guidance === undefined
          ? undefined
          : (Array.isArray(stage.quality_guidance) ? stage.quality_guidance : [stage.quality_guidance])
            .map(rel => relativePosix(projectRoot, resolvePackExportPath(resolved.pack.root, rel))),
      };
    }
  } catch (error: any) {
    // The Work Packet already surfaced this as an issue; degrade to the
    // category name so the manifest still materializes (fail-visible).
    if (typeof error?.message === 'string' && error.message.startsWith('CAPABILITY_BINDING_MISSING:')) {
      manifest.documentContract = { category: packet.category };
      return manifest;
    }
    throw error;
  }
  // C3: a Pack may exclude a role from a stage (C2 `roles` declaration). The
  // query then fails fast with a stable issue code, mirroring ROLE_UNKNOWN.
  if (manifest.stage?.roles?.[role] === 'not_applicable') {
    throw new Error(roleNotApplicableMessage(role, manifest.stage.name));
  }
  return manifest;
}

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ProjectConfig, ResolvedPack, loadProjectConfig, resolvePacks } from './ProjectConfig';
import {
  CategoryContract,
  CategoryContractSchema,
  GraphContractSchema,
  InputSlot,
  ProfileContract,
  ProfileContractSchema,
  StageNode,
  VersionedContractReference,
} from '../types/PackSchemas';
import { resolveContainedReal } from '../utils/pathSecurity';
import { parseRefKey } from './RefSyntaxParser';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';
import { ConfigLoader } from '../utils/configLoader';
import { ArtifactContract, loadArtifactContract } from '../canonical/artifacts/ArtifactContract';
import { mergePolicies, PolicyIssue } from './PolicyLattice';

export { CategoryContract, ProfileContract };

/** Profile-specific generation-reference requirement. Empty means references remain optional. */
export function missingRequiredRefCategories(
  projectRoot: string,
  profile: ProfileContract,
  refs: Record<string, Record<string, string[]>> | undefined,
): string[] {
  const required = profile.required_ref_categories || [];
  if (required.length === 0) return [];
  const categories = new Set<string>();
  for (const typeMap of Object.values(refs || {})) for (const key of Object.keys(typeMap || {})) {
    const ref = parseRefKey(key);
    if (!ref || ref.kind !== 'external') continue;
    const doc = AssetManager.findAssetFilePathUnder(path.join(projectRoot, 'videospec'), ref.id);
    if (doc) categories.add(FrontmatterParser.parseRaw(fs.readFileSync(doc, 'utf8')).frontmatter.category);
  }
  return required.filter(category => !categories.has(category));
}

export interface InputSlotIssue {
  code: 'PROFILE_INPUT_MISSING' | 'PROFILE_INPUT_MISMATCH';
  message: string;
}

/**
 * Verify declarative ordered input slots (T07) against the document's
 * external refs: per ref_type, refs in document order must match slots 1:1
 * in declaration order. Refs whose target doc is missing are skipped here —
 * the refs pass already reports them (REF_MISSING/REF_UNAVAILABLE).
 */
export function inputSlotIssues(
  projectRoot: string,
  profile: ProfileContract,
  refs: Record<string, Record<string, string[]>> | undefined,
): InputSlotIssue[] {
  const inputs = profile.inputs || [];
  if (inputs.length === 0) return [];
  const videospec = path.join(projectRoot, 'videospec');
  const issues: InputSlotIssue[] = [];
  for (const refType of [...new Set(inputs.map(input => input.ref_type))]) {
    const slots = inputs.filter(input => input.ref_type === refType);
    const resolved: Array<{ key: string; category?: string }> = [];
    for (const key of Object.keys(refs?.[refType] || {})) {
      const ref = parseRefKey(key);
      if (!ref || ref.kind !== 'external') continue;
      const doc = AssetManager.findAssetFilePathUnder(videospec, ref.id);
      if (!doc) continue;
      resolved.push({ key, category: FrontmatterParser.parseRaw(fs.readFileSync(doc, 'utf8')).frontmatter.category });
    }
    if (resolved.length > slots.length) {
      issues.push({ code: 'PROFILE_INPUT_MISMATCH', message: `Profile declares ${slots.length} "${refType}" input slot(s) but the document carries ${resolved.length} external "${refType}" ref(s)` });
      continue;
    }
    for (const [index, slot] of slots.entries()) {
      const actual = resolved[index];
      if (!actual) {
        if (slot.required) issues.push({ code: 'PROFILE_INPUT_MISSING', message: `Profile requires input slot "${slot.slot}" (a "${slot.category}" ${refType} reference)` });
        continue;
      }
      if (actual.category !== slot.category) {
        issues.push({ code: 'PROFILE_INPUT_MISMATCH', message: `Input slot "${slot.slot}" expects a "${slot.category}" reference but "${actual.key}" resolves to category "${actual.category}"` });
      }
    }
  }
  return issues;
}

/** model.type → semantic capability id. Single owner for resolution + registry projection. */
export const MODEL_TYPE_TO_CAPABILITY: Readonly<Record<string, string>> = {
  video: 'video.generate',
  imagen: 'image.generate',
  audio: 'audio.generate',
  comfy: 'comfy.execute',
  webapp: 'webapp.run',
};

/** Pack/Profile capability aliases. Declarations only; never an execution registry or whitelist. */
export const CAPABILITY_ALIASES: Readonly<Record<string, string>> = {
  'video-generation': 'video.generate',
  'image-generation': 'image.generate',
  'audio-generation': 'audio.generate',
  'continuous-i2v': 'video.generate',
  'image-to-video': 'video.generate',
};

export function resolveCapabilityId(capability: string): string {
  return CAPABILITY_ALIASES[capability] ?? capability;
}

/**
 * Fail closed only when both sides are known and clearly incompatible.
 * comfy/webapp are generic transports whose concrete workflow may implement
 * image/video/audio capabilities, so their compatibility cannot be rejected
 * from model.type alone. Unknown types/capabilities remain backward compatible.
 */
export function isModelTypeCompatibleWithCapability(modelType: string | undefined, capability: string): boolean {
  if (!modelType || modelType === 'comfy' || modelType === 'webapp') return true;
  const modelCapability = MODEL_TYPE_TO_CAPABILITY[modelType];
  const semanticCapability = resolveCapabilityId(capability);
  if (!modelCapability) return true;
  const knownSemanticCapabilities = new Set(Object.values(MODEL_TYPE_TO_CAPABILITY));
  if (!knownSemanticCapabilities.has(semanticCapability)) return true;
  return modelCapability === semanticCapability;
}

export interface ResolvedCapability {
  declared: string;
  id: string;
  boundModel?: string;
  provider?: string;
  modelType?: string;
}

export interface ResolvedArtifactContract {
  source: 'profile' | 'builtin';
  value: ArtifactContract;
}

export interface ResolvedDocumentContract {
  pack: ResolvedPack;
  category: CategoryContract;
  profileName: string;
  profile: ProfileContract;
  boundModel?: string;
  defaults?: Record<string, unknown>;
  capability?: ResolvedCapability;
  inputSlots: InputSlot[];
  policy: Record<string, string>;
  policyIssues: PolicyIssue[];
  promptContract?: VersionedContractReference;
  taskContract?: VersionedContractReference;
  artifactContract: ResolvedArtifactContract;
  /**
   * Workflow-layer Stage contract (C2) for the graph.yaml node named after
   * this Category, when the Pack declares one. Undefined when the Pack has
   * no graph.yaml or no node for the Category (lenient inherit behavior).
   */
  stage?: ResolvedStage;
}

/** Stage view exposed to consumers: normalized node fields plus its name. */
export interface ResolvedStage extends StageNode {
  name: string;
  /** DAG dependencies, normalized from the legacy array form or depends_on. */
  dependsOn: string[];
}

/**
 * Leniently decode a Pack's graph.yaml. Runtime resolution never throws for
 * graph problems — `opsv pack check` owns Stage validation (PACK_STAGE_INVALID);
 * an undecodable or missing graph simply yields no Stage view.
 */
export function loadGraphStages(packRoot: string): Map<string, ResolvedStage> {
  const stages = new Map<string, ResolvedStage>();
  const graphPath = path.join(packRoot, 'graph.yaml');
  if (!fs.existsSync(graphPath)) return stages;
  let raw: unknown;
  try {
    raw = yaml.load(fs.readFileSync(graphPath, 'utf8'));
  } catch {
    return stages;
  }
  const parsed = GraphContractSchema.safeParse(raw);
  if (!parsed.success) return stages;
  for (const [name, node] of Object.entries(parsed.data.workflow || {})) {
    if (Array.isArray(node)) stages.set(name, { name, dependsOn: node });
    else stages.set(name, { ...node, name, dependsOn: node.depends_on || [] });
  }
  return stages;
}

/** Resolve a pack-export-relative path, requiring real containment under the
 *  pack root (rejects `../`, absolute paths, and symlink escapes). Single
 *  owner used by contract resolution, Work Packet skill loads, and shims. */
export function resolvePackExportPath(packRoot: string, rel: string): string {
  const contained = resolveContainedReal(packRoot, rel);
  if (!contained) throw new Error(`PACK_EXPORT_OUTSIDE_ROOT: "${rel}" resolves outside pack root ${packRoot}`);
  return contained;
}

function loadYaml<T>(filePath: string, schema: { safeParse: (raw: unknown) => any }): T {
  if (!fs.existsSync(filePath)) throw new Error(`Pack contract not found: ${filePath}`);
  const parsed = schema.safeParse(yaml.load(fs.readFileSync(filePath, 'utf8')));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i: any) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Pack contract invalid: ${filePath} (${detail})`);
  }
  return parsed.data as T;
}

export function resolveDocumentContract(
  projectRoot: string,
  categoryName: string,
  profileOverride?: string,
  config?: ProjectConfig,
): ResolvedDocumentContract {
  const effectiveConfig = config || loadProjectConfig(projectRoot);
  const packs = resolvePacks(projectRoot, effectiveConfig);
  const candidates = packs.filter((pack) => pack.manifest.categories?.[categoryName]);
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? `No Pack exports category "${categoryName}"`
      : `Category "${categoryName}" is exported by multiple Packs`);
  }

  const pack = candidates[0];
  const category = loadYaml<CategoryContract>(resolvePackExportPath(pack.root, pack.manifest.categories![categoryName]), CategoryContractSchema);
  const requestedProfile = profileOverride || category.default_profile;
  if (!requestedProfile) throw new Error(`Category "${categoryName}" has no default profile`);
  const derived = effectiveConfig.profiles?.[requestedProfile];
  const profileName = derived?.extends || requestedProfile;
  if (category.profiles && !category.profiles.includes(profileName)) {
    throw new Error(`Profile "${requestedProfile}" is not allowed for category "${categoryName}"`);
  }

  const profilePath = pack.manifest.profiles?.[profileName];
  if (!profilePath) throw new Error(`Pack "${pack.manifest.id}" does not export profile "${profileName}"`);
  const profile = loadYaml<ProfileContract>(resolvePackExportPath(pack.root, profilePath), ProfileContractSchema);
  const resolvedProfile = derived ? { ...profile, capability: derived.capability || profile.capability } : profile;
  const declaredCapability = resolvedProfile.capability;
  const semanticCapability = declaredCapability ? resolveCapabilityId(declaredCapability) : undefined;
  const boundModel = declaredCapability
    ? effectiveConfig.bindings?.[declaredCapability] ?? effectiveConfig.bindings?.[semanticCapability!]
    : undefined;
  if (resolvedProfile.kind === 'production' && declaredCapability && !boundModel) {
    throw new Error(`CAPABILITY_BINDING_MISSING: Production profile "${requestedProfile}" requires a project binding for capability "${declaredCapability}"`);
  }

  let capability: ResolvedCapability | undefined;
  if (declaredCapability && semanticCapability) {
    capability = { declared: declaredCapability, id: semanticCapability, boundModel };
    if (boundModel) {
      const model = new ConfigLoader().loadConfig(projectRoot, { silent: true }).models[boundModel];
      if (model && !isModelTypeCompatibleWithCapability(model.type, semanticCapability)) {
        throw new Error(
          `CAPABILITY_MODEL_INCOMPATIBLE: Model "${boundModel}" has type "${model.type}" and cannot satisfy capability "${declaredCapability}" (${semanticCapability})`,
        );
      }
      if (model) {
        capability.provider = model.provider;
        capability.modelType = model.type;
      }
    }
  }

  const policy = mergePolicies({}, pack.manifest.policy || {}, effectiveConfig.policy || {});
  const artifactContract: ResolvedArtifactContract = {
    source: resolvedProfile.artifact ? 'profile' : 'builtin',
    value: loadArtifactContract(resolvedProfile.artifact),
  };
  // Consume the Workflow-layer Stage (inputs/completion) named after the
  // Category; absent nodes keep the lenient profile-inherit behavior.
  const stage = loadGraphStages(pack.root).get(categoryName);
  return {
    pack,
    category,
    profileName: requestedProfile,
    profile: resolvedProfile,
    boundModel,
    defaults: derived?.defaults,
    capability,
    inputSlots: [...(resolvedProfile.inputs || [])],
    policy: policy.effective,
    policyIssues: policy.issues,
    promptContract: resolvedProfile.prompt_contract,
    taskContract: resolvedProfile.task_contract,
    artifactContract,
    stage,
  };
}

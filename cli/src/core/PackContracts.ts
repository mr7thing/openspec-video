import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ProjectConfig, ResolvedPack, loadProjectConfig, resolvePacks } from './ProjectConfig';
import { CategoryContract, CategoryContractSchema, GraphContractSchema, ProfileContract, ProfileContractSchema, StageNode } from '../types/PackSchemas';
import { resolveContainedReal } from '../utils/pathSecurity';
import { parseRefKey } from './RefSyntaxParser';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';

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

export interface ResolvedDocumentContract {
  pack: ResolvedPack;
  category: CategoryContract;
  profileName: string;
  profile: ProfileContract;
  boundModel?: string;
  defaults?: Record<string, unknown>;
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
  const boundModel = resolvedProfile.capability ? effectiveConfig.bindings?.[resolvedProfile.capability] : undefined;
  if (resolvedProfile.kind === 'production' && resolvedProfile.capability && !boundModel) {
    throw new Error(`CAPABILITY_BINDING_MISSING: Production profile "${requestedProfile}" requires a project binding for capability "${resolvedProfile.capability}"`);
  }
  // Consume the Workflow-layer Stage (inputs/completion) named after the
  // Category; absent nodes keep the lenient profile-inherit behavior.
  const stage = loadGraphStages(pack.root).get(categoryName);
  return { pack, category, profileName: requestedProfile, profile: resolvedProfile, boundModel, defaults: derived?.defaults, stage };
}

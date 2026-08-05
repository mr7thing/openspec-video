// ============================================================================
// PackChecker — static Pack contract validation.
// Loads pack.yaml plus all exported Category/Profile/Skill manifests through
// the shared Zod schemas (types/PackSchemas), builds the export graph, and
// applies cross-file closure rules. Produces a deterministic report with
// stable issue codes; never throws for pack-content problems.
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ZodType } from 'zod';
import {
  ActionPolicySchema,
  CategoryContract,
  CategoryContractSchema,
  KNOWN_POLICY_KEYS,
  PackManifest,
  PackManifestSchema,
  ProfileContract,
  ProfileContractSchema,
  SkillManifest,
  SkillManifestSchema,
} from '../types/PackSchemas';
import { resolveContainedReal } from '../utils/pathSecurity';

export const PACK_ISSUE_CODES = [
  'PACK_SCHEMA_INVALID',
  'PACK_EXPORT_MISSING',
  'PACK_EXPORT_OUTSIDE_ROOT',
  'PACK_PROFILE_SKILL_MISSING',
  'PACK_SKILL_PROFILE_MISSING',
  'PACK_SKILL_CATEGORY_MISSING',
  'PACK_PROFILE_NOT_ALLOWED',
  'PACK_DEFAULT_PROFILE_INVALID',
  'PACK_POLICY_INVALID',
  'PACK_CAPABILITY_CONCRETE_MODEL',
  'PACK_ORPHAN_FILE',
  // v2 addition (T07): declarative input slots referencing unknown categories.
  'PACK_PROFILE_INPUT_INVALID',
] as const;
export type PackIssueCode = (typeof PACK_ISSUE_CODES)[number];

export interface PackIssue {
  code: PackIssueCode;
  severity: 'error' | 'warning';
  path: string; // pack-root-relative, forward slashes
  message: string;
  context?: Record<string, unknown>;
}

export interface PackCheckReport {
  pack: { id?: string; version?: string; root: string };
  issues: PackIssue[];
  ok: boolean;
}

/** Capability strings that smell like concrete provider/model keys (F6). */
const CONCRETE_CAPABILITY_RE = [/^rh-workflow/i, /^comfyui[.-]/i, /\.gguf$/i, /^[a-z0-9-]+\/[a-z0-9.-]+:\w+/i];

function looksConcreteModel(capability: string): boolean {
  return CONCRETE_CAPABILITY_RE.some(re => re.test(capability));
}

function toRel(rel: string): string {
  return rel.split(path.sep).join('/');
}

interface LoadedExport<T> {
  rel: string;
  value?: T;
}

export function checkPack(packRoot: string): PackCheckReport {
  const issues: PackIssue[] = [];
  const push = (issue: PackIssue) => issues.push(issue);

  const manifestRel = 'pack.yaml';
  const manifestPath = path.join(packRoot, manifestRel);
  let manifest: PackManifest | undefined;
  if (!fs.existsSync(manifestPath)) {
    push({ code: 'PACK_SCHEMA_INVALID', severity: 'error', path: manifestRel, message: `pack.yaml not found at ${packRoot}` });
    return finish(packRoot, undefined, issues);
  }
  try {
    const raw = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
    const parsed = PackManifestSchema.safeParse(raw);
    if (!parsed.success) {
      push({ code: 'PACK_SCHEMA_INVALID', severity: 'error', path: manifestRel, message: flatten(parsed.error.issues) });
      return finish(packRoot, undefined, issues);
    }
    manifest = parsed.data;
  } catch (error: any) {
    push({ code: 'PACK_SCHEMA_INVALID', severity: 'error', path: manifestRel, message: `YAML parse failed: ${error.message}` });
    return finish(packRoot, undefined, issues);
  }

  // Policy validation (dedicated code, not generic schema failure).
  if (manifest.policy) {
    const policyResult = ActionPolicySchema.safeParse(manifest.policy);
    if (!policyResult.success) {
      push({ code: 'PACK_POLICY_INVALID', severity: 'error', path: manifestRel, message: flatten(policyResult.error.issues) });
    } else {
      for (const key of Object.keys(manifest.policy)) {
        if (!KNOWN_POLICY_KEYS.includes(key)) {
          push({ code: 'PACK_POLICY_INVALID', severity: 'warning', path: manifestRel, message: `Unknown policy action key "${key}"`, context: { key } });
        }
      }
    }
  }

  const loadExport = <T>(kind: 'categories' | 'profiles' | 'skills', key: string, rel: string, schema: ZodType<T, any, any>): LoadedExport<T> => {
    const relNorm = toRel(rel);
    const contained = resolveContainedReal(packRoot, rel);
    if (!contained) {
      push({ code: 'PACK_EXPORT_OUTSIDE_ROOT', severity: 'error', path: relNorm, message: `${kind} export "${key}" resolves outside the pack root`, context: { [kind]: key } });
      return { rel: relNorm };
    }
    if (!fs.existsSync(contained)) {
      push({ code: 'PACK_EXPORT_MISSING', severity: 'error', path: relNorm, message: `${kind} export "${key}" points to a missing file`, context: { [kind]: key } });
      return { rel: relNorm };
    }
    try {
      const raw = yaml.load(fs.readFileSync(contained, 'utf8'));
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        push({ code: 'PACK_SCHEMA_INVALID', severity: 'error', path: relNorm, message: flatten(parsed.error.issues) });
        return { rel: relNorm };
      }
      return { rel: relNorm, value: parsed.data };
    } catch (error: any) {
      push({ code: 'PACK_SCHEMA_INVALID', severity: 'error', path: relNorm, message: `YAML parse failed: ${error.message}` });
      return { rel: relNorm };
    }
  };

  const categories = new Map<string, LoadedExport<CategoryContract>>();
  const profiles = new Map<string, LoadedExport<ProfileContract>>();
  const skills = new Map<string, LoadedExport<SkillManifest>>();
  for (const [key, rel] of Object.entries(manifest.categories || {})) categories.set(key, loadExport('categories', key, rel, CategoryContractSchema));
  for (const [key, rel] of Object.entries(manifest.profiles || {})) profiles.set(key, loadExport('profiles', key, rel, ProfileContractSchema));
  for (const [key, rel] of Object.entries(manifest.skills || {})) skills.set(key, loadExport('skills', key, rel, SkillManifestSchema));

  // Cross-file closure rules (only over successfully decoded files).
  for (const [name, entry] of profiles) {
    const profile = entry.value;
    if (!profile) continue;
    if (profile.skill && !skills.has(profile.skill)) {
      push({ code: 'PACK_PROFILE_SKILL_MISSING', severity: 'error', path: entry.rel, message: `Profile "${name}" references non-exported Skill "${profile.skill}"`, context: { profile: name, skill: profile.skill } });
    }
    if (profile.capability && looksConcreteModel(profile.capability)) {
      push({ code: 'PACK_CAPABILITY_CONCRETE_MODEL', severity: 'error', path: entry.rel, message: `Profile "${name}" capability "${profile.capability}" looks like a concrete provider/model key; declare an abstract capability and bind it in the project`, context: { profile: name, capability: profile.capability } });
    }
    for (const input of profile.inputs || []) {
      if (!categories.has(input.category)) {
        push({ code: 'PACK_PROFILE_INPUT_INVALID', severity: 'error', path: entry.rel, message: `Profile "${name}" input slot "${input.slot}" references non-exported Category "${input.category}"`, context: { profile: name, slot: input.slot, category: input.category } });
      }
    }
  }

  for (const [name, entry] of skills) {
    const skill = entry.value;
    if (!skill) continue;
    if (skill.profile && !profiles.has(skill.profile)) {
      push({ code: 'PACK_SKILL_PROFILE_MISSING', severity: 'error', path: entry.rel, message: `Skill "${name}" references non-exported Profile "${skill.profile}"`, context: { skill: name, profile: skill.profile } });
    }
    if (skill.category && !categories.has(skill.category)) {
      push({ code: 'PACK_SKILL_CATEGORY_MISSING', severity: 'error', path: entry.rel, message: `Skill "${name}" references non-exported Category "${skill.category}"`, context: { skill: name, category: skill.category } });
    } else if (skill.category && skill.profile) {
      const allow = categories.get(skill.category)?.value?.profiles;
      if (allow && profiles.has(skill.profile) && !allow.includes(skill.profile)) {
        push({ code: 'PACK_PROFILE_NOT_ALLOWED', severity: 'error', path: entry.rel, message: `Skill "${name}" binds Profile "${skill.profile}" which is not in Category "${skill.category}" allow-list`, context: { skill: name, profile: skill.profile, category: skill.category } });
      }
    }
  }

  for (const [name, entry] of categories) {
    const category = entry.value;
    if (!category) continue;
    if (category.default_profile) {
      if (!profiles.has(category.default_profile)) {
        push({ code: 'PACK_DEFAULT_PROFILE_INVALID', severity: 'error', path: entry.rel, message: `Category "${name}" default_profile "${category.default_profile}" is not an exported Profile`, context: { category: name, defaultProfile: category.default_profile } });
      } else if (category.profiles && !category.profiles.includes(category.default_profile)) {
        push({ code: 'PACK_DEFAULT_PROFILE_INVALID', severity: 'error', path: entry.rel, message: `Category "${name}" default_profile "${category.default_profile}" is not in its own profiles allow-list`, context: { category: name, defaultProfile: category.default_profile } });
      }
    }
    for (const allowed of category.profiles || []) {
      if (!profiles.has(allowed)) {
        push({ code: 'PACK_PROFILE_NOT_ALLOWED', severity: 'error', path: entry.rel, message: `Category "${name}" allow-list references non-exported Profile "${allowed}"`, context: { category: name, profile: allowed } });
      }
    }
  }

  // Orphan (unexported) contract files — warning only.
  const exportedRels = new Set<string>([
    ...[...categories.values()].map(e => e.rel),
    ...[...profiles.values()].map(e => e.rel),
    ...[...skills.values()].map(e => e.rel),
  ]);
  for (const rel of findContractFiles(packRoot)) {
    if (!exportedRels.has(rel)) {
      push({ code: 'PACK_ORPHAN_FILE', severity: 'warning', path: rel, message: `Contract file "${rel}" is not exported by pack.yaml and will not enter runtime resolution` });
    }
  }

  return finish(packRoot, manifest, issues);
}

function findContractFiles(packRoot: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, pred: (rel: string) => boolean) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const rel = toRel(path.relative(packRoot, abs));
      if (entry.isDirectory()) walk(abs, pred);
      else if (pred(rel)) found.push(rel);
    }
  };
  walk(path.join(packRoot, 'categories'), rel => rel.endsWith('.yaml') || rel.endsWith('.yml'));
  walk(path.join(packRoot, 'profiles'), rel => rel.endsWith('.yaml') || rel.endsWith('.yml'));
  walk(path.join(packRoot, 'skills'), rel => /(^|\/)skill\.yaml$/.test(rel));
  return found;
}

function flatten(zodIssues: Array<{ path: (string | number)[]; message: string }>): string {
  return zodIssues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function finish(packRoot: string, manifest: PackManifest | undefined, issues: PackIssue[]): PackCheckReport {
  issues.sort((a, b) => (a.path + a.code).localeCompare(b.path + b.code));
  return {
    pack: { id: manifest?.id, version: manifest?.version, root: packRoot },
    issues,
    ok: !issues.some(i => i.severity === 'error'),
  };
}

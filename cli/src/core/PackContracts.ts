import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ProfileKind, ProjectConfig, ResolvedPack, loadProjectConfig, resolvePacks } from './ProjectConfig';

export interface CategoryContract {
  default_profile?: string;
  profiles?: string[];
}

export interface ProfileContract {
  kind: ProfileKind;
  capability?: string;
  skill?: string;
  outputs?: string[];
  frame_directive?: boolean;
  materialize?: {
    clips?: { directory: string; category: string };
    shots?: { directory: string; category: string };
  };
}

export interface ResolvedDocumentContract {
  pack: ResolvedPack;
  category: CategoryContract;
  profileName: string;
  profile: ProfileContract;
  boundModel?: string;
  defaults?: Record<string, unknown>;
}

function loadYaml<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`Pack contract not found: ${filePath}`);
  const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') throw new Error(`Pack contract must be an object: ${filePath}`);
  return parsed as T;
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
  const category = loadYaml<CategoryContract>(path.join(pack.root, pack.manifest.categories![categoryName]));
  const requestedProfile = profileOverride || category.default_profile;
  if (!requestedProfile) throw new Error(`Category "${categoryName}" has no default profile`);
  const derived = effectiveConfig.profiles?.[requestedProfile];
  const profileName = derived?.extends || requestedProfile;
  if (category.profiles && !category.profiles.includes(profileName)) {
    throw new Error(`Profile "${requestedProfile}" is not allowed for category "${categoryName}"`);
  }

  const profilePath = pack.manifest.profiles?.[profileName];
  if (!profilePath) throw new Error(`Pack "${pack.manifest.id}" does not export profile "${profileName}"`);
  const profile = loadYaml<ProfileContract>(path.join(pack.root, profilePath));
  if (profile.kind !== 'workflow' && profile.kind !== 'production') {
    throw new Error(`Profile "${profileName}" must declare kind: workflow or production`);
  }
  const resolvedProfile = derived ? { ...profile, capability: derived.capability || profile.capability } : profile;
  const boundModel = resolvedProfile.capability ? effectiveConfig.bindings?.[resolvedProfile.capability] : undefined;
  if (resolvedProfile.kind === 'production' && resolvedProfile.capability && !boundModel) {
    throw new Error(`Production profile "${requestedProfile}" requires a project binding for capability "${resolvedProfile.capability}"`);
  }
  return { pack, category, profileName: requestedProfile, profile: resolvedProfile, boundModel, defaults: derived?.defaults };
}

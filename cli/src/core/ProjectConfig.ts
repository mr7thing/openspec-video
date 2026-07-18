import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export type ProfileKind = 'workflow' | 'production';

export interface PackReference {
  id: string;
  source?: string;
  version?: string;
}

export interface ActionPolicy {
  draft?: 'auto' | 'ask' | 'human';
  compile?: 'auto' | 'ask' | 'human';
  execute?: 'auto' | 'ask' | 'human';
  approve?: 'auto' | 'ask' | 'human';
  sync?: 'auto' | 'ask' | 'human';
  delete?: 'never';
}

export interface DerivedProfile {
  extends: string;
  capability?: string;
  defaults?: Record<string, unknown>;
}

export interface ProjectConfig {
  packs?: PackReference[];
  bindings?: Record<string, string>;
  profiles?: Record<string, DerivedProfile>;
  policy?: ActionPolicy;
  circle?: { dirs?: string[] };
}

export interface PackManifest {
  id: string;
  version: string;
  categories?: Record<string, string>;
  profiles?: Record<string, string>;
  skills?: Record<string, string>;
  policy?: ActionPolicy;
}

export interface ResolvedPack {
  reference: PackReference;
  root: string;
  manifest: PackManifest;
  digest: string;
}

export interface PackLock {
  version: 1;
  packs: Array<{ id: string; version: string; source: string; digest: string }>;
}

const PROJECT_CONFIG_PATH = path.join('.opsv', 'project.yaml');
const PACK_LOCK_PATH = path.join('.opsv', 'pack-lock.yaml');

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const filePath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  if (!fs.existsSync(filePath)) return {};
  const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${PROJECT_CONFIG_PATH} must contain a YAML object`);
  }
  const config = parsed as ProjectConfig;
  if (config.policy && Object.prototype.hasOwnProperty.call(config.policy, 'delete') && config.policy.delete !== 'never') {
    throw new Error('policy.delete is a Core invariant and must be "never"');
  }
  return config;
}

export function resolvePacks(projectRoot: string, config = loadProjectConfig(projectRoot)): ResolvedPack[] {
  return (config.packs || []).map((reference) => {
    if (!reference.id) throw new Error('Pack entry requires an id');
    const source = reference.source || path.join('.opsv', 'packs', reference.id);
    const root = path.resolve(projectRoot, source);
    const manifestPath = path.join(root, 'pack.yaml');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Pack "${reference.id}" has no pack.yaml at ${root}`);
    }
    const parsed = yaml.load(fs.readFileSync(manifestPath, 'utf8')) as PackManifest;
    if (!parsed?.id || !parsed?.version) {
      throw new Error(`Pack "${reference.id}" manifest requires id and version`);
    }
    if (parsed.id !== reference.id) {
      throw new Error(`Pack id mismatch: project declares "${reference.id}" but manifest declares "${parsed.id}"`);
    }
    if (reference.version && reference.version !== parsed.version) {
      throw new Error(`Pack "${reference.id}" version mismatch: expected ${reference.version}, found ${parsed.version}`);
    }
    const raw = fs.readFileSync(manifestPath);
    return {
      reference,
      root,
      manifest: parsed,
      digest: crypto.createHash('sha256').update(raw).digest('hex'),
    };
  });
}

export function writePackLock(projectRoot: string, packs: ResolvedPack[]): string {
  const lock: PackLock = {
    version: 1,
    packs: packs.map((pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      source: path.relative(projectRoot, pack.root).replace(/\\/g, '/'),
      digest: pack.digest,
    })),
  };
  const target = path.join(projectRoot, PACK_LOCK_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml.dump(lock, { lineWidth: -1 }), 'utf8');
  return target;
}

/** Create discovery-only links; Skill rules remain canonical inside each Pack. */
export function syncPackSkillShims(projectRoot: string, platform: 'agents' | 'codex', packs = resolvePacks(projectRoot)): string[] {
  const base = path.join(projectRoot, platform === 'agents' ? '.agents/skills' : '.codex/skills');
  const written: string[] = [];
  for (const pack of packs) {
    for (const [skill, manifestRelative] of Object.entries(pack.manifest.skills || {})) {
      const source = path.dirname(path.join(pack.root, manifestRelative));
      const target = path.join(base, `${pack.manifest.id}--${skill}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target) || fs.lstatSync(path.dirname(target)).isSymbolicLink()) {
        if (!fs.existsSync(target) || fs.realpathSync(target) !== fs.realpathSync(source)) {
          fs.rmSync(target, { recursive: true, force: true });
        } else { written.push(target); continue; }
      }
      fs.symlinkSync(path.relative(path.dirname(target), source), target, 'dir');
      written.push(target);
    }
  }
  return written;
}

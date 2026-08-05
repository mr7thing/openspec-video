import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { computePackContentDigest, PACK_DIGEST_ALGORITHM, PACK_DIGEST_VERSION } from './PackDigest';
import { PackManifestSchema } from '../types/PackSchemas';

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
  /** sha256 of pack.yaml bytes (v1 digest semantics). */
  digest: string;
  /** Canonical tree digest over all behavior-relevant pack files (F4). */
  contentDigest: string;
  /** Pack-relative path → file sha256, for drift diagnosis. */
  contentFiles: Record<string, string>;
}

export interface PackLockEntry {
  id: string;
  version: string;
  source: string;
  manifest_digest: string;
  content_digest: string;
  digest_algorithm: string;
  digest_version: number;
  files: Record<string, string>;
}

export interface PackLock {
  version: 2;
  packs: PackLockEntry[];
}

export interface PackLockReadResult {
  lock: PackLock | { version: 1; packs: Array<{ id: string; version: string; source: string; digest: string }> };
  /** True when the lock predates content digests and must be re-locked. */
  legacy: boolean;
  diagnostic?: { code: 'PACK_LOCK_LEGACY'; message: string };
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
    const parsed = PackManifestSchema.safeParse(yaml.load(fs.readFileSync(manifestPath, 'utf8')));
    if (!parsed.success) {
      const detail = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new Error(`Pack "${reference.id}" manifest invalid: ${detail}`);
    }
    const manifest = parsed.data;
    if (manifest.id !== reference.id) {
      throw new Error(`Pack id mismatch: project declares "${reference.id}" but manifest declares "${manifest.id}"`);
    }
    if (reference.version && reference.version !== manifest.version) {
      throw new Error(`Pack "${reference.id}" version mismatch: expected ${reference.version}, found ${manifest.version}`);
    }
    const raw = fs.readFileSync(manifestPath);
    const content = computePackContentDigest(root, manifest);
    return {
      reference,
      root,
      manifest: manifest as PackManifest,
      digest: crypto.createHash('sha256').update(raw).digest('hex'),
      contentDigest: content.contentDigest,
      contentFiles: content.files,
    };
  });
}

export function writePackLock(projectRoot: string, packs: ResolvedPack[]): string {
  const lock: PackLock = {
    version: 2,
    packs: packs.map((pack) => ({
      id: pack.manifest.id,
      version: pack.manifest.version,
      source: path.relative(projectRoot, pack.root).replace(/\\/g, '/'),
      manifest_digest: pack.digest,
      content_digest: pack.contentDigest,
      digest_algorithm: PACK_DIGEST_ALGORITHM,
      digest_version: PACK_DIGEST_VERSION,
      files: pack.contentFiles,
    })),
  };
  const target = path.join(projectRoot, PACK_LOCK_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml.dump(lock, { lineWidth: -1 }), 'utf8');
  return target;
}

/** Read the pack lock, recognizing legacy v1 locks (manifest-only digest). */
export function readPackLock(projectRoot: string): PackLockReadResult | undefined {
  const target = path.join(projectRoot, PACK_LOCK_PATH);
  if (!fs.existsSync(target)) return undefined;
  const parsed = yaml.load(fs.readFileSync(target, 'utf8')) as any;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${PACK_LOCK_PATH} must contain a YAML object`);
  }
  if (parsed.version === 2) {
    return { lock: parsed as PackLock, legacy: false };
  }
  return {
    lock: parsed as PackLockReadResult['lock'],
    legacy: true,
    diagnostic: {
      code: 'PACK_LOCK_LEGACY',
      message: 'pack-lock.yaml predates Pack content digests and cannot prove which Pack content runs. Run: opsv pack lock',
    },
  };
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

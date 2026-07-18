import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AssetManager } from './AssetManager';
import { buildAssetDocIndex } from './AssetDocIndex';
import { FrontmatterParser } from './FrontmatterParser';
import { resolveDocumentContract } from './PackContracts';
import { loadProjectConfig } from './ProjectConfig';
import { parseRefKey } from './RefSyntaxParser';
import { getProjectDir } from '../utils/configLoader';

export interface WorkPacket {
  asset: string; category?: string; status?: string;
  profile?: { name: string; kind: string; capability?: string; model?: string };
  primarySkill?: { name: string; manifest?: string; gates: string[] };
  refs: Array<{ key: string; state: 'ready' | 'missing' | 'syncing'; message?: string }>;
  circle: { available: boolean; manifests: string[] };
  policy: Record<string, string>;
  issues: Array<{ code: string; message: string }>;
  action?: string; command?: string;
}

function externalKeys(refs: any): string[] {
  const keys: string[] = [];
  for (const typeMap of Object.values(refs || {})) {
    if (!typeMap || typeof typeMap !== 'object') continue;
    for (const key of Object.keys(typeMap as object)) if (parseRefKey(key)?.kind === 'external') keys.push(key);
  }
  return [...new Set(keys)];
}

function approvedVariants(documentPath: string): string[] {
  const content = fs.readFileSync(documentPath, 'utf8');
  const section = content.match(/##\s*Approved\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!section) return [];
  return [...section[1].matchAll(/!\[([^\]]+)\]\([^)]+\)/g)].map(match => match[1]);
}

function circleManifests(root: string, asset: string): string[] {
  const queue = getProjectDir(root, 'queue');
  if (!fs.existsSync(queue)) return [];
  return fs.readdirSync(queue, { withFileTypes: true }).flatMap((entry) => {
    const manifest = path.join(queue, entry.name, '_manifest.json');
    if (!entry.isDirectory() || !fs.existsSync(manifest)) return [];
    try { return JSON.parse(fs.readFileSync(manifest, 'utf8')).assets?.[asset] ? [manifest] : []; } catch { return []; }
  });
}

export function buildWorkPacket(projectRoot: string, selector: string): WorkPacket {
  const videospec = getProjectDir(projectRoot, 'videospec');
  const filePath = fs.existsSync(path.resolve(projectRoot, selector)) ? path.resolve(projectRoot, selector) : AssetManager.findAssetFilePathUnder(videospec, selector);
  if (!filePath) throw new Error(`Asset document not found: ${selector}`);
  const asset = path.basename(filePath, '.md').replace(/^@/, '');
  const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(filePath, 'utf8'));
  const config = loadProjectConfig(projectRoot);
  const packet: WorkPacket = { asset, category: frontmatter.category, status: frontmatter.status || 'drafting', refs: [], circle: { available: false, manifests: [] }, policy: {}, issues: [] };
  if (!frontmatter.category) { packet.issues.push({ code: 'CATEGORY_MISSING', message: 'Asset document has no category' }); return packet; }
  const contract = resolveDocumentContract(projectRoot, frontmatter.category, frontmatter.profile, config);
  packet.policy = { draft: 'auto', compile: 'auto', execute: 'ask', approve: 'human', sync: 'auto', ...(contract.pack.manifest.policy || {}), ...(config.policy || {}) };
  packet.profile = { name: contract.profileName, kind: contract.profile.kind, capability: contract.profile.capability, model: contract.boundModel };
  const skillName = contract.profile.skill || contract.profileName;
  const skillPath = contract.pack.manifest.skills?.[skillName];
  let gates: string[] = [];
  if (skillPath) {
    const manifestPath = path.join(contract.pack.root, skillPath);
    const parsed = yaml.load(fs.readFileSync(manifestPath, 'utf8')) as any;
    gates = Array.isArray(parsed?.gates) ? parsed.gates : [];
    packet.primarySkill = { name: skillName, manifest: path.relative(projectRoot, manifestPath), gates };
  } else packet.primarySkill = { name: skillName, gates };
  for (const key of externalKeys(frontmatter.refs)) {
    const ref = parseRefKey(key)!;
    const entry = buildAssetDocIndex(videospec).entries.get(ref.id);
    if (!entry) { packet.refs.push({ key, state: 'missing', message: 'Referenced Asset Document is missing' }); packet.issues.push({ code: 'REF_MISSING', message: `${key}: referenced Asset Document is missing` }); continue; }
    const target = FrontmatterParser.parseRaw(fs.readFileSync(entry.filePath, 'utf8')).frontmatter;
    if (target.status === 'syncing') { packet.refs.push({ key, state: 'syncing', message: 'Referenced Asset is syncing' }); packet.issues.push({ code: 'REF_SYNCING', message: `${key}: referenced Asset must be synchronized` }); continue; }
    const variants = approvedVariants(entry.filePath);
    const duplicate = variants.find((variant, index) => variants.indexOf(variant) !== index);
    if (duplicate) { packet.refs.push({ key, state: 'missing', message: `Duplicate approved variant: ${duplicate}` }); packet.issues.push({ code: 'REF_AMBIGUOUS', message: `${key}: duplicate approved variant ${duplicate}` }); continue; }
    if (variants.length === 0 || (ref.variant && !variants.includes(ref.variant)) || (!ref.variant && variants.length > 1)) {
      const message = variants.length === 0 ? 'No approved reference' : ref.variant ? `Approved variant not found: ${ref.variant}` : 'Variant is required because multiple outputs are approved';
      packet.refs.push({ key, state: 'missing', message }); packet.issues.push({ code: 'REF_UNAVAILABLE', message: `${key}: ${message}` }); continue;
    }
    packet.refs.push({ key, state: 'ready' });
  }
  packet.circle.manifests = circleManifests(projectRoot, asset);
  packet.circle.available = packet.circle.manifests.length > 0;
  if (packet.status === 'syncing') { packet.issues.push({ code: 'SYNC_REQUIRED', message: 'Approved revision must be synchronized before use' }); packet.action = 'sync'; packet.command = `opsv sync ${asset}`; return packet; }
  if (packet.issues.length) return packet;
  if (contract.profile.kind === 'workflow') { packet.action = 'materialize'; packet.command = `opsv materialize ${asset}`; }
  else if (!packet.circle.available) { packet.action = 'circle'; packet.command = `opsv circle create --dir ${path.dirname(path.relative(projectRoot, filePath))}`; }
  else { packet.action = 'compile'; packet.command = contract.boundModel ? `opsv produce --model ${contract.boundModel}` : undefined; }
  return packet;
}

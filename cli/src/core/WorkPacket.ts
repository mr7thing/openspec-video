import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AssetManager } from './AssetManager';
import { buildAssetDocIndex } from './AssetDocIndex';
import { FrontmatterParser } from './FrontmatterParser';
import { buildNextAction, NextAction, renderNextActionCommand, WORK_PACKET_CONTRACT_VERSION } from './NextAction';
import { inputSlotIssues, missingRequiredRefCategories, resolveDocumentContract, resolvePackExportPath, ResolvedDocumentContract } from './PackContracts';
import { mergePolicies } from './PolicyLattice';
import { loadProjectConfig } from './ProjectConfig';
import { parseRefKey } from './RefSyntaxParser';
import { SkillManifestSchema } from '../types/PackSchemas';
import { getProjectDir } from '../utils/configLoader';
import { currentStateSync } from '../canonical/state/TransitionStore';

export interface WorkPacket {
  contractVersion: number;
  asset: string; category?: string; status?: string;
  profile?: { name: string; kind: string; capability?: string; model?: string };
  pack?: { id: string; version: string; contentDigest: string };
  primarySkill?: { name: string; manifest?: string; gates: string[] };
  refs: Array<{ key: string; state: 'ready' | 'missing' | 'syncing'; message?: string }>;
  circle: { available: boolean; manifests: string[] };
  policy: Record<string, string>;
  issues: Array<{ code: string; message: string }>;
  /** Structured source of truth for the next step (contract v2). */
  nextAction?: NextAction;
  /** Legacy derived fields — prefer nextAction. */
  action?: string; command?: string;
  /**
   * Artifact-side Asset State Machine view (P7): the current asset state and
   * the recorded transition count, projected from `.opsv/state/<asset>.jsonl`.
   * Distinct from the document lifecycle `status` (drafting/syncing/approved).
   */
  assetState?: { state: string; transitions: number };
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
  const packet: WorkPacket = { contractVersion: WORK_PACKET_CONTRACT_VERSION, asset, category: frontmatter.category, status: frontmatter.status || 'drafting', refs: [], circle: { available: false, manifests: [] }, policy: {}, issues: [] };
  // P7: surface the artifact-side state machine projection (best-effort).
  try {
    const { state, transitions } = currentStateSync(projectRoot, asset);
    packet.assetState = { state, transitions: transitions.length };
  } catch {
    packet.assetState = { state: 'draft', transitions: 0 };
  }
  if (!frontmatter.category) { packet.issues.push({ code: 'CATEGORY_MISSING', message: 'Asset document has no category' }); return packet; }
  let contract: ResolvedDocumentContract;
  try {
    contract = resolveDocumentContract(projectRoot, frontmatter.category, frontmatter.profile, config);
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.startsWith('CAPABILITY_BINDING_MISSING:')) {
      packet.issues.push({ code: 'CAPABILITY_BINDING_MISSING', message: error.message.slice('CAPABILITY_BINDING_MISSING: '.length) });
      packet.nextAction = { kind: 'blocked', issueCodes: packet.issues.map(i => i.code) };
      packet.action = 'blocked';
      return packet;
    }
    throw error;
  }
  const policy = mergePolicies({}, contract.pack.manifest.policy || {}, config.policy || {});
  packet.policy = policy.effective;
  packet.issues.push(...policy.issues.filter(issue => issue.severity === 'error').map(issue => ({ code: issue.code, message: issue.message })));
  packet.profile = { name: contract.profileName, kind: contract.profile.kind, capability: contract.profile.capability, model: contract.boundModel };
  packet.pack = { id: contract.pack.manifest.id, version: contract.pack.manifest.version, contentDigest: contract.pack.contentDigest };
  const skillName = contract.profile.skill || contract.profileName;
  const skillPath = contract.pack.manifest.skills?.[skillName];
  let gates: string[] = [];
  let skillAction: string | undefined;
  let skillFound = false;
  if (skillPath) {
    const manifestPath = resolvePackExportPath(contract.pack.root, skillPath);
    if (fs.existsSync(manifestPath)) {
      skillFound = true;
      const raw = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
      const parsed = SkillManifestSchema.safeParse(raw);
      if (parsed.success) {
        gates = parsed.data.gates || [];
        skillAction = parsed.data.action;
      } else {
        // Lenient fallback for legacy manifests: gates still surface, but the
        // missing/invalid action blocks workflow derivation downstream.
        gates = Array.isArray((raw as any)?.gates) ? (raw as any).gates : [];
      }
      packet.primarySkill = { name: skillName, manifest: path.relative(projectRoot, manifestPath), gates };
    }
  }
  if (!packet.primarySkill) packet.primarySkill = { name: skillName, gates };
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
  for (const category of missingRequiredRefCategories(projectRoot, contract.profile, frontmatter.refs)) {
    packet.issues.push({ code: 'PROFILE_REF_REQUIRED', message: `Profile requires an external reference to category "${category}"` });
  }
  packet.issues.push(...inputSlotIssues(projectRoot, contract.profile, frontmatter.refs));
  packet.circle.manifests = circleManifests(projectRoot, asset);
  packet.circle.available = packet.circle.manifests.length > 0;
  if (packet.status === 'syncing') {
    packet.issues.push({ code: 'SYNC_REQUIRED', message: 'Approved revision must be synchronized before use' });
    packet.nextAction = { kind: 'sync', asset };
    packet.action = 'sync';
    packet.command = renderNextActionCommand(packet.nextAction);
    return packet;
  }
  const derived = buildNextAction({
    asset,
    status: packet.status!,
    profileKind: contract.profile.kind,
    profileName: contract.profileName,
    profileHasMaterialize: !!contract.profile.materialize,
    skillName,
    skillAction,
    skillFound,
    circleManifests: packet.circle.manifests,
    circleManifestsRelative: packet.circle.manifests.map(m => path.relative(projectRoot, m).split(path.sep).join('/')),
    sourceDirRelative: path.dirname(path.relative(projectRoot, filePath)).split(path.sep).join('/'),
    issueCodes: packet.issues.map(i => i.code),
  });
  packet.issues.push(...derived.issues);
  packet.nextAction = derived.action;
  packet.action = derived.action?.kind;
  packet.command = renderNextActionCommand(derived.action);
  return packet;
}

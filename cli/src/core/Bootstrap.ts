// ============================================================================
// Bootstrap — `opsv bootstrap` core (C1).
//
// Generates `.opsv/bootstrap/manifest.json` from the Pack Stack + Project
// Config, and owns the fail-closed `bootstrap_stale` judgement consumed by
// Execution/hook preflight (checkBootstrapStale).
//
// Boundaries (analysis §6.1): no produce, no Provider resolution, no machine
// binding. Standalone: reads only .opsv/ and Pack files, never .trellis/.
// Digests: Pack tree digests come from core/PackDigest.ts (single owner);
// bootstrap adds graph.yaml + Project Config hashes on top, never
// reimplementing tree hashing.
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  loadProjectConfig,
  readPackLock,
  resolvePacks,
  PackLock,
  ResolvedPack,
} from './ProjectConfig';
import { resolvePackExportPath } from './PackContracts';
import { mergePolicies } from './PolicyLattice';
import { REF_SYNTAX_FORMS } from './WorkContext';
import { resolveContainedReal } from '../utils/pathSecurity';
import {
  CategoryContract,
  CategoryContractSchema,
  ProfileContract,
  ProfileContractSchema,
  SkillManifest,
  SkillManifestSchema,
} from '../types/PackSchemas';
import {
  BOOTSTRAP_CONTRACT_VERSION,
  BOOTSTRAP_ROLES,
  BootstrapDiagnostic,
  BootstrapManifest,
  BootstrapManifestSchema,
  BootstrapStage,
  PackWorkflowGraphFile,
  PackWorkflowGraphFileSchema,
  WorkflowGraphNode,
} from '../types/BootstrapManifest';

export const BOOTSTRAP_DIR = path.join('.opsv', 'bootstrap');
export const BOOTSTRAP_MANIFEST_REL = '.opsv/bootstrap/manifest.json';
export const BOOTSTRAP_ROLES_DIR_REL = '.opsv/bootstrap/roles';

function sha256(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Project-root-relative POSIX path; absolute when the target lives outside
 *  the project root (external Pack sources), never a `../../` escape.
 *  (Mirrors the private helper in WorkContext.ts.) */
function relativePosix(projectRoot: string, absolute: string): string {
  const rel = path.relative(projectRoot, absolute);
  const chosen = rel.startsWith('..') || path.isAbsolute(rel) ? absolute : rel;
  return chosen.split(path.sep).join('/');
}

/** graph.yaml at the Pack root, resolved with real containment. */
function graphFilePath(packRoot: string): string | undefined {
  const contained = resolveContainedReal(packRoot, 'graph.yaml');
  return contained && fs.existsSync(contained) && fs.statSync(contained).isFile() ? contained : undefined;
}

function graphDigest(packRoot: string): string | null {
  const graphPath = graphFilePath(packRoot);
  return graphPath ? sha256(fs.readFileSync(graphPath)) : null;
}

function computeProjectConfigDigest(projectRoot: string): string {
  const configPath = path.join(projectRoot, '.opsv', 'project.yaml');
  return sha256(fs.existsSync(configPath) ? fs.readFileSync(configPath) : '');
}

export interface BootstrapDigestInput {
  id: string;
  contentDigest: string;
  graphDigest: string | null;
}

/** Combined digest: Pack content digests + graph.yaml digests + Project
 *  Config hash. Sorted, NUL-separated — same inputs → same digest. */
export function computeBootstrapContentDigest(packs: BootstrapDigestInput[], projectConfigDigest: string): string {
  const entries = packs
    .map(pack => `${pack.id}\0${pack.contentDigest}\0${pack.graphDigest ?? ''}`)
    .sort()
    .join('\n');
  return sha256(`${entries}\nproject.yaml\0${projectConfigDigest}\n`);
}

// ---------------------------------------------------------------------------
// Pack export decoding (tolerant; pack check remains the validator)
// ---------------------------------------------------------------------------

interface PackDecodes {
  categories: Map<string, { path: string; contract: CategoryContract }>;
  profiles: Map<string, { path: string; contract: ProfileContract }>;
  skills: Map<string, { path: string; manifest: SkillManifest }>;
}

function flattenIssues(issues: Array<{ path: (string | number)[]; message: string }>): string {
  return issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function decodePackExports(pack: ResolvedPack, projectRoot: string, diagnostics: BootstrapDiagnostic[]): PackDecodes {
  const decodes: PackDecodes = { categories: new Map(), profiles: new Map(), skills: new Map() };
  const load = <T>(
    kind: 'categories' | 'profiles' | 'skills',
    key: string,
    rel: string,
    schema: { safeParse: (raw: unknown) => any },
    sink: Map<string, { path: string; value: T }>,
  ): void => {
    let abs: string;
    try {
      abs = resolvePackExportPath(pack.root, rel);
    } catch (error: any) {
      diagnostics.push({ code: 'BOOTSTRAP_CONTRACT_INVALID', message: error.message });
      return;
    }
    if (!fs.existsSync(abs)) {
      diagnostics.push({ code: 'BOOTSTRAP_CONTRACT_INVALID', message: `Pack "${pack.manifest.id}" ${kind} export "${key}" points to a missing file` });
      return;
    }
    try {
      const parsed = schema.safeParse(yaml.load(fs.readFileSync(abs, 'utf8')));
      if (!parsed.success) {
        diagnostics.push({ code: 'BOOTSTRAP_CONTRACT_INVALID', message: `Pack "${pack.manifest.id}" ${kind} export "${key}" invalid: ${flattenIssues(parsed.error.issues)}` });
        return;
      }
      sink.set(key, { path: relativePosix(projectRoot, abs), value: parsed.data as T });
    } catch (error: any) {
      diagnostics.push({ code: 'BOOTSTRAP_CONTRACT_INVALID', message: `Pack "${pack.manifest.id}" ${kind} export "${key}" unreadable: ${error.message}` });
    }
  };

  const categories = new Map<string, { path: string; value: CategoryContract }>();
  const profiles = new Map<string, { path: string; value: ProfileContract }>();
  const skills = new Map<string, { path: string; value: SkillManifest }>();
  for (const [key, rel] of Object.entries(pack.manifest.categories || {})) load('categories', key, rel, CategoryContractSchema, categories);
  for (const [key, rel] of Object.entries(pack.manifest.profiles || {})) load('profiles', key, rel, ProfileContractSchema, profiles);
  for (const [key, rel] of Object.entries(pack.manifest.skills || {})) load('skills', key, rel, SkillManifestSchema, skills);
  for (const [key, entry] of categories) decodes.categories.set(key, { path: entry.path, contract: entry.value });
  for (const [key, entry] of profiles) decodes.profiles.set(key, { path: entry.path, contract: entry.value });
  for (const [key, entry] of skills) decodes.skills.set(key, { path: entry.path, manifest: entry.value });
  return decodes;
}

function readWorkflowGraph(pack: ResolvedPack, diagnostics: BootstrapDiagnostic[]): PackWorkflowGraphFile['workflow'] | undefined {
  const graphPath = graphFilePath(pack.root);
  if (!graphPath) return undefined;
  try {
    const parsed = PackWorkflowGraphFileSchema.safeParse(yaml.load(fs.readFileSync(graphPath, 'utf8')));
    if (!parsed.success) {
      diagnostics.push({ code: 'BOOTSTRAP_GRAPH_INVALID', message: `Pack "${pack.manifest.id}" graph.yaml invalid: ${flattenIssues(parsed.error.issues)}` });
      return undefined;
    }
    return parsed.data.workflow;
  } catch (error: any) {
    diagnostics.push({ code: 'BOOTSTRAP_GRAPH_INVALID', message: `Pack "${pack.manifest.id}" graph.yaml unreadable: ${error.message}` });
    return undefined;
  }
}

function buildGraphNodes(
  pack: ResolvedPack,
  graph: NonNullable<PackWorkflowGraphFile['workflow']>,
  decodes: PackDecodes,
): WorkflowGraphNode[] {
  /** Enrich a stage node with the category/profile/skill declarations the
   *  Pack exports under the same id (graph.yaml + profiles derivation). */
  const enrich = (node: WorkflowGraphNode): void => {
    const category = decodes.categories.get(node.id);
    if (!category) return;
    node.category = {
      path: category.path,
      defaultProfile: category.contract.default_profile,
      profiles: category.contract.profiles,
    };
    const profileName = category.contract.default_profile;
    const profile = profileName ? decodes.profiles.get(profileName) : undefined;
    if (!profileName || !profile) return;
    const inputs = (profile.contract.inputs || []).map(input => ({
      slot: input.slot,
      category: input.category,
      refType: input.ref_type,
      required: input.required,
    }));
    node.profile = {
      name: profileName,
      kind: profile.contract.kind,
      capability: profile.contract.capability,
      skill: profile.contract.skill,
    };
    if (inputs.length > 0) node.profile.inputs = inputs;
    if (profile.contract.kind === 'production') node.profile.outputs = profile.contract.outputs;
    const skill = profile.contract.skill ? decodes.skills.get(profile.contract.skill) : undefined;
    if (skill?.manifest.gates && skill.manifest.gates.length > 0) node.gates = skill.manifest.gates;
  };

  const nodes: WorkflowGraphNode[] = [];
  for (const [id, raw] of Object.entries(graph)) {
    const node: WorkflowGraphNode = { id, pack: pack.manifest.id, dependsOn: [] };
    if (Array.isArray(raw)) {
      node.dependsOn = raw;
    } else {
      node.dependsOn = raw.depends_on || [];
      const stage: BootstrapStage = {};
      if (raw.inputs) stage.inputs = raw.inputs;
      if (raw.outputs) stage.outputs = raw.outputs;
      if (raw.completion) stage.completion = raw.completion;
      if (raw.quality_guidance) stage.qualityGuidance = raw.quality_guidance;
      if (raw.roles) stage.roles = raw.roles;
      if (raw.recommended_capabilities) stage.recommendedCapabilities = raw.recommended_capabilities;
      if (Object.keys(stage).length > 0) node.stage = stage;
    }
    enrich(node);
    nodes.push(node);
  }

  // Stages referenced only as dependencies (no own declaration) are still
  // graph nodes — they carry an empty edge list, in first-reference order.
  const declared = new Set(Object.keys(graph));
  for (const raw of Object.values(graph)) {
    for (const dep of Array.isArray(raw) ? raw : raw.depends_on || []) {
      if (declared.has(dep)) continue;
      declared.add(dep);
      const node: WorkflowGraphNode = { id: dep, pack: pack.manifest.id, dependsOn: [] };
      enrich(node);
      nodes.push(node);
    }
  }
  return nodes;
}

function roleTemplateRefs(): BootstrapManifest['roles'] {
  return BOOTSTRAP_ROLES.map(role => ({
    role,
    template: `${BOOTSTRAP_ROLES_DIR_REL}/${role}.md`,
    status: 'pending' as const,
  }));
}

// ---------------------------------------------------------------------------
// Manifest build
// ---------------------------------------------------------------------------

export function buildBootstrapManifest(projectRoot: string): BootstrapManifest {
  const config = loadProjectConfig(projectRoot);
  const packs = resolvePacks(projectRoot, config);
  const diagnostics: BootstrapDiagnostic[] = [];

  const lockResult = readPackLock(projectRoot);
  let lock: PackLock | undefined;
  if (!lockResult) {
    diagnostics.push({ code: 'PACK_LOCK_MISSING', message: 'pack-lock.yaml not found; bootstrap records live Pack digests. Run: opsv pack lock' });
  } else if (lockResult.legacy) {
    if (lockResult.diagnostic) diagnostics.push({ code: lockResult.diagnostic.code, message: lockResult.diagnostic.message });
  } else {
    lock = lockResult.lock as PackLock;
  }

  const manifest: BootstrapManifest = {
    contractVersion: BOOTSTRAP_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    digestAlgorithm: 'sha256',
    contentDigest: '',
    projectConfig: { path: '.opsv/project.yaml', digest: '' },
    packs: [],
    workflowGraph: [],
    documentContracts: [],
    promptContract: { refSyntax: [...REF_SYNTAX_FORMS] },
    io: { inputs: [], outputs: [] },
    policy: {
      project: undefined,
      packs: [],
    },
    gates: [],
    recommendedCapabilities: [],
    roles: roleTemplateRefs(),
    diagnostics,
  };

  const projectPolicy = Object.fromEntries(
    Object.entries(config.policy || {}).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
  if (Object.keys(projectPolicy).length > 0) manifest.policy.project = projectPolicy;

  const capabilities = new Map<string, { capability: string; pack: string; profiles: string[]; binding?: string }>();
  const digestInputs: BootstrapDigestInput[] = [];

  for (const pack of packs) {
    const digestInput = { id: pack.manifest.id, contentDigest: pack.contentDigest, graphDigest: graphDigest(pack.root) };
    digestInputs.push(digestInput);
    const lockEntry = lock?.packs.find(entry => entry.id === pack.manifest.id);
    const locked = !!lockEntry && lockEntry.content_digest === pack.contentDigest && lockEntry.manifest_digest === pack.digest;
    if (lock && !locked) {
      diagnostics.push({ code: 'PACK_LOCK_DRIFT', message: `Pack "${pack.manifest.id}" content differs from pack-lock.yaml; run: opsv pack lock` });
    }
    manifest.packs.push({
      id: pack.manifest.id,
      version: pack.manifest.version,
      source: (pack.reference.source || path.join('.opsv', 'packs', pack.reference.id)).split(path.sep).join('/'),
      root: relativePosix(projectRoot, pack.root),
      locked,
      manifestDigest: pack.digest,
      contentDigest: pack.contentDigest,
      graphDigest: digestInput.graphDigest,
    });

    const decodes = decodePackExports(pack, projectRoot, diagnostics);

    const graph = readWorkflowGraph(pack, diagnostics);
    if (graph) manifest.workflowGraph.push(...buildGraphNodes(pack, graph, decodes));

    for (const [name, entry] of decodes.categories) {
      manifest.documentContracts.push({
        category: name,
        pack: pack.manifest.id,
        path: entry.path,
        defaultProfile: entry.contract.default_profile,
        profiles: entry.contract.profiles,
      });
    }

    for (const [name, entry] of decodes.profiles) {
      for (const input of entry.contract.inputs || []) {
        manifest.io.inputs.push({
          pack: pack.manifest.id,
          profile: name,
          slot: input.slot,
          category: input.category,
          refType: input.ref_type,
          required: input.required,
        });
      }
      if (entry.contract.kind === 'production') {
        manifest.io.outputs.push({ pack: pack.manifest.id, profile: name, outputs: entry.contract.outputs });
      }
      if (entry.contract.capability) {
        const existing = capabilities.get(entry.contract.capability);
        if (existing) {
          if (!existing.profiles.includes(name)) existing.profiles.push(name);
        } else {
          capabilities.set(entry.contract.capability, {
            capability: entry.contract.capability,
            pack: pack.manifest.id,
            profiles: [name],
            binding: config.bindings?.[entry.contract.capability],
          });
        }
      }
    }

    for (const [name, entry] of decodes.skills) {
      manifest.gates.push({
        pack: pack.manifest.id,
        skill: name,
        action: entry.manifest.action,
        gates: entry.manifest.gates || [],
      });
    }

    const merged = mergePolicies({}, pack.manifest.policy || {}, config.policy || {});
    manifest.policy.packs.push({
      pack: pack.manifest.id,
      effective: merged.effective,
      issues: merged.issues.map(issue => ({ code: issue.code, message: issue.message })),
    });
  }

  manifest.recommendedCapabilities = [...capabilities.values()]
    .sort((a, b) => a.capability.localeCompare(b.capability));

  const projectConfigDigest = computeProjectConfigDigest(projectRoot);
  manifest.projectConfig = { path: '.opsv/project.yaml', digest: projectConfigDigest };
  manifest.contentDigest = computeBootstrapContentDigest(digestInputs, projectConfigDigest);
  return manifest;
}

export function writeBootstrap(projectRoot: string): { manifestPath: string; manifest: BootstrapManifest } {
  const manifest = buildBootstrapManifest(projectRoot);
  fs.mkdirSync(path.join(projectRoot, BOOTSTRAP_ROLES_DIR_REL), { recursive: true });
  const manifestPath = path.join(projectRoot, BOOTSTRAP_MANIFEST_REL);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { manifestPath, manifest };
}

// ---------------------------------------------------------------------------
// Stale judgement (fail-closed; analysis §6.2)
// ---------------------------------------------------------------------------

export type BootstrapIssueCode = 'BOOTSTRAP_MISSING' | 'BOOTSTRAP_INVALID' | 'BOOTSTRAP_STALE';

export interface BootstrapIssue {
  code: BootstrapIssueCode;
  message: string;
  context?: Record<string, unknown>;
}

export interface BootstrapStatus {
  status: 'fresh' | 'stale' | 'missing' | 'invalid';
  /** True whenever execution must not start (missing/invalid/stale). */
  stale: boolean;
  /** Project-root-relative POSIX manifest path. */
  manifestPath: string;
  issues: BootstrapIssue[];
  manifest?: BootstrapManifest;
}

/**
 * Programmable staleness check (Execution/hook preflight calls this; `opsv
 * exec start` wiring is B2's scope). Fail-closed: a missing or unreadable
 * manifest, unresolvable inputs, or any digest drift (pack.yaml /
 * graph.yaml / profiles / categories / Project Config) is stale.
 */
export function checkBootstrapStale(projectRoot: string): BootstrapStatus {
  const manifestAbs = path.join(projectRoot, BOOTSTRAP_MANIFEST_REL);
  if (!fs.existsSync(manifestAbs)) {
    return {
      status: 'missing',
      stale: true,
      manifestPath: BOOTSTRAP_MANIFEST_REL,
      issues: [{ code: 'BOOTSTRAP_MISSING', message: 'Bootstrap manifest not found. Run: opsv bootstrap' }],
    };
  }

  let manifest: BootstrapManifest;
  try {
    const parsed = BootstrapManifestSchema.safeParse(JSON.parse(fs.readFileSync(manifestAbs, 'utf8')));
    if (!parsed.success) throw new Error(flattenIssues(parsed.error.issues));
    manifest = parsed.data;
  } catch (error: any) {
    return {
      status: 'invalid',
      stale: true,
      manifestPath: BOOTSTRAP_MANIFEST_REL,
      issues: [{ code: 'BOOTSTRAP_INVALID', message: `Bootstrap manifest is invalid: ${error.message}` }],
    };
  }

  let livePacks: Map<string, BootstrapDigestInput>;
  let liveProjectConfigDigest: string;
  let liveContentDigest: string;
  try {
    const config = loadProjectConfig(projectRoot);
    const packs = resolvePacks(projectRoot, config);
    const inputs: BootstrapDigestInput[] = packs.map(pack => ({
      id: pack.manifest.id,
      contentDigest: pack.contentDigest,
      graphDigest: graphDigest(pack.root),
    }));
    livePacks = new Map(inputs.map(input => [input.id, input]));
    liveProjectConfigDigest = computeProjectConfigDigest(projectRoot);
    liveContentDigest = computeBootstrapContentDigest(inputs, liveProjectConfigDigest);
  } catch (error: any) {
    return {
      status: 'stale',
      stale: true,
      manifestPath: BOOTSTRAP_MANIFEST_REL,
      issues: [{ code: 'BOOTSTRAP_STALE', message: `Bootstrap inputs can no longer be resolved: ${error.message}` }],
      manifest,
    };
  }

  const issues: BootstrapIssue[] = [];
  const recorded = new Map(manifest.packs.map(pack => [pack.id, pack]));
  for (const [id, live] of livePacks) {
    const prev = recorded.get(id);
    if (!prev) {
      issues.push({ code: 'BOOTSTRAP_STALE', message: `Pack "${id}" is not covered by the bootstrap manifest`, context: { component: 'pack', pack: id } });
      continue;
    }
    if (prev.contentDigest !== live.contentDigest) {
      issues.push({ code: 'BOOTSTRAP_STALE', message: `Pack "${id}" content digest changed since bootstrap (pack.yaml/categories/profiles/skills)`, context: { component: 'pack', pack: id } });
    }
    if ((prev.graphDigest ?? null) !== live.graphDigest) {
      issues.push({ code: 'BOOTSTRAP_STALE', message: `Pack "${id}" graph.yaml changed since bootstrap`, context: { component: 'graph', pack: id } });
    }
  }
  for (const id of recorded.keys()) {
    if (!livePacks.has(id)) {
      issues.push({ code: 'BOOTSTRAP_STALE', message: `Pack "${id}" in the bootstrap manifest is no longer resolved`, context: { component: 'pack', pack: id } });
    }
  }
  if (manifest.projectConfig.digest !== liveProjectConfigDigest) {
    issues.push({ code: 'BOOTSTRAP_STALE', message: 'Project config (.opsv/project.yaml) changed since bootstrap', context: { component: 'project.yaml' } });
  }
  // Combined-digest sanity net for components not compared individually.
  if (issues.length === 0 && manifest.contentDigest !== liveContentDigest) {
    issues.push({ code: 'BOOTSTRAP_STALE', message: 'Bootstrap content digest mismatch', context: { component: 'contentDigest' } });
  }

  return {
    status: issues.length > 0 ? 'stale' : 'fresh',
    stale: issues.length > 0,
    manifestPath: BOOTSTRAP_MANIFEST_REL,
    issues,
    manifest,
  };
}

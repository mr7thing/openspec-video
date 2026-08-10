// ============================================================================
// Conformance — `opsv conformance <pack>` core (D2).
//
// Runs the six-check conformance matrix against a single Pack (analysis
// §12 Phase 4 checks 1-5 + this plan's check 6, hard/soft constraint
// layering):
//
//   1. stage-inputs             Stage inputs are obtainable from documents
//   2. stage-output-contracts   Stage outputs declare a Contract
//   3. role-context             Roles receive complete Context
//   4. review-iterate-sync      Review then iterate+sync is reachable
//   5. recommended-not-whitelist Recommended tools are not a hard whitelist
//   6. constraint-layering      Hard/soft constraints are layered
//
// Reuse boundaries: base Pack validation delegates to PackChecker.checkPack,
// Stage decoding to PackContracts.loadGraphStages, and Role template
// materialization status to Bootstrap.checkBootstrapStale — nothing here
// re-implements their rules. Standalone: reads only the Pack tree and (for
// check 3) the project's .opsv/; never .trellis/.
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { checkPack } from './PackChecker';
import { loadGraphStages, ResolvedStage, resolvePackExportPath } from './PackContracts';
import { BOOTSTRAP_MANIFEST_REL, checkBootstrapStale } from './Bootstrap';
import {
  CategoryContract,
  CategoryContractSchema,
  PackManifest,
  PackManifestSchema,
  ProfileContract,
  ProfileContractSchema,
  SkillManifest,
  SkillManifestSchema,
} from '../types/PackSchemas';

export type ConformanceStatus = 'pass' | 'fail' | 'warn';

export interface ConformanceFinding {
  /** Pack-root-relative POSIX path (project-relative for bootstrap findings). */
  file: string;
  /** 1-based line, present whenever the finding could be located. */
  line?: number;
  message: string;
}

export interface ConformanceCheckResult {
  id: string;
  title: string;
  status: ConformanceStatus;
  findings: ConformanceFinding[];
}

export interface ConformanceReport {
  pack: { id?: string; version?: string; root: string };
  checks: ConformanceCheckResult[];
  /** True when no check failed (warnings do not block). */
  ok: boolean;
}

export interface ConformanceOptions {
  /**
   * Project root used by check 3 to read Role template materialization
   * status (.opsv/bootstrap/). When omitted, that portion is skipped.
   */
  projectRoot?: string;
}

// ---------------------------------------------------------------------------
// Text indexes — locating findings to file + line
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First line containing `value` as a token (boundaries: not [A-Za-z0-9_.-]). */
function valueLine(lines: string[], value: string, from = 0, to = lines.length): number | undefined {
  const re = new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(value)}([^A-Za-z0-9_.-]|$)`);
  for (let i = Math.max(0, from); i < Math.min(to, lines.length); i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return undefined;
}

/** First top-level (`^key:`) line of a YAML mapping. */
function topKeyLine(lines: string[], key: string): number | undefined {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const index = lines.findIndex(line => re.test(line));
  return index >= 0 ? index + 1 : undefined;
}

interface StageBlock {
  name: string;
  /** 1-based line of the stage key. */
  line: number;
  /** 0-based exclusive end of the stage block. */
  end: number;
}

/**
 * Structural index over graph.yaml's `workflow:` mapping: stage key lines
 * plus block extents, so findings can point at the exact Stage / field /
 * list item instead of just the file.
 */
function stageBlocks(lines: string[]): StageBlock[] {
  const blocks: StageBlock[] = [];
  let workflowSeen = false;
  let stageIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    if (!workflowSeen) {
      if (indent === 0 && /^workflow\s*:/.test(trimmed)) workflowSeen = true;
      continue;
    }
    if (indent === 0) break; // dedented out of the workflow mapping
    const match = trimmed.match(/^(['"]?)([A-Za-z0-9_.-]+)\1\s*:/);
    if (!match) continue;
    if (stageIndent === -1) stageIndent = indent;
    if (indent === stageIndent) {
      blocks.push({ name: match[2], line: i + 1, end: lines.length });
      if (blocks.length > 1) blocks[blocks.length - 2].end = i;
    }
  }
  return blocks;
}

/** First `key:` line inside a stage block (0-based scope [block.line, block.end)). */
function keyLineInBlock(lines: string[], block: StageBlock, key: string): number | undefined {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  for (let i = block.line; i < block.end; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tolerant Pack decoding (pack check remains the validator)
// ---------------------------------------------------------------------------

function readText(filePath: string): string | undefined {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? fs.readFileSync(filePath, 'utf8')
    : undefined;
}

interface DecodedExport<T> {
  rel: string;
  value?: T;
  lines: string[];
}

function decodeExports<T>(
  packRoot: string,
  exports: Record<string, string> | undefined,
  schema: { safeParse: (raw: unknown) => any },
): Map<string, DecodedExport<T>> {
  const decoded = new Map<string, DecodedExport<T>>();
  for (const [key, rel] of Object.entries(exports || {})) {
    let abs: string | undefined;
    try {
      abs = resolvePackExportPath(packRoot, rel);
    } catch {
      abs = undefined;
    }
    const text = abs ? readText(abs) : undefined;
    const entry: DecodedExport<T> = {
      rel: rel.split(path.sep).join('/'),
      lines: text ? text.split('\n') : [],
    };
    if (text !== undefined) {
      try {
        const parsed = schema.safeParse(yaml.load(text));
        if (parsed.success) entry.value = parsed.data as T;
      } catch {
        // undecodable export — pack check already reports it
      }
    }
    decoded.set(key, entry);
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Check assembly helpers
// ---------------------------------------------------------------------------

class CheckBuilder {
  private failFindings: ConformanceFinding[] = [];
  private warnFindings: ConformanceFinding[] = [];

  constructor(private readonly id: string, private readonly title: string) {}

  fail(finding: ConformanceFinding): void {
    this.failFindings.push(finding);
  }

  warn(finding: ConformanceFinding): void {
    this.warnFindings.push(finding);
  }

  result(): ConformanceCheckResult {
    const status: ConformanceStatus = this.failFindings.length > 0 ? 'fail' : this.warnFindings.length > 0 ? 'warn' : 'pass';
    return { id: this.id, title: this.title, status, findings: [...this.failFindings, ...this.warnFindings] };
  }
}

interface ConformanceContext {
  packRoot: string;
  options: ConformanceOptions;
  manifest?: PackManifest;
  packYamlLines: string[];
  graphRaw?: string;
  graphLines: string[];
  blocks: StageBlock[];
  stages: Map<string, ResolvedStage>;
  categories: Map<string, DecodedExport<CategoryContract>>;
  profiles: Map<string, DecodedExport<ProfileContract>>;
  skills: Map<string, DecodedExport<SkillManifest>>;
}

const WORKFLOW_STAGE_FIELDS = new Set(['depends_on', 'inputs', 'outputs', 'completion', 'quality_guidance', 'roles']);
const TOOLSET_STAGE_FIELDS = new Set(['recommended_capabilities']);
const RESOLVED_STAGE_META = new Set(['name', 'dependsOn']);
const KNOWN_PACK_KEYS = new Set(['id', 'version', 'dependencies', 'policy', 'categories', 'profiles', 'skills']);

function stageBlockOf(ctx: ConformanceContext, stageName: string): StageBlock | undefined {
  return ctx.blocks.find(block => block.name === stageName);
}

function stageLineOf(ctx: ConformanceContext, stageName: string): number | undefined {
  return stageBlockOf(ctx, stageName)?.line;
}

// ---------------------------------------------------------------------------
// The six checks
// ---------------------------------------------------------------------------

/** Guard shared by checks that need decodable workflow stages. */
function requireStages(ctx: ConformanceContext, check: CheckBuilder): boolean {
  if (ctx.graphRaw === undefined) {
    check.fail({ file: 'pack.yaml', line: 1, message: 'Pack declares no graph.yaml — no workflow Stages to check' });
    return false;
  }
  if (ctx.stages.size === 0) {
    check.fail({ file: 'graph.yaml', line: 1, message: 'graph.yaml has no decodable workflow Stages (run `opsv pack check` for the schema error)' });
    return false;
  }
  return true;
}

/**
 * Stage-input vocabulary normalization. Analysis §5.1 sanctions descriptive
 * input names (`scene_document`, `approved_character_refs`): Stage inputs
 * declare goals, not implementations. So reachability is judged on the
 * normalized stem — lowercase, `-`/`_` equivalent, a trailing doc suffix on
 * the input and a `-vN` version suffix on contract names are ignored:
 * `shotlist_doc` resolves to the `shotlist` Category/Stage, `shotref_doc`
 * to the `shotref-doc-v1` outputs.contract.
 */
function normalizeVocab(value: string): string {
  return value.toLowerCase().replace(/-/g, '_');
}

function stripInputDocSuffix(value: string): string {
  return value.replace(/(_doc|_document)$/, '');
}

function contractStem(contract: string): string {
  return stripInputDocSuffix(normalizeVocab(contract).replace(/_v\d+$/, ''));
}

/** 1. Stage inputs are obtainable from documents (contract/refs reachability). */
function checkStageInputs(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('stage-inputs', 'Stage inputs are obtainable from documents');
  if (!requireStages(ctx, check)) return check.result();

  const categoryNames = new Set(Object.keys(ctx.manifest?.categories || {}).map(normalizeVocab));
  const stageNames = new Set([...ctx.stages.keys()].map(normalizeVocab));
  // outputs.contract stems are a reachability source: the PRD phrasing is
  // "stage inputs ↔ document contract/refs 可达性" — a document is identified
  // by the Contract its producing Stage declares.
  const contractStemsByStage = new Map<string, string>();
  for (const stage of ctx.stages.values()) {
    if (stage.outputs?.contract) contractStemsByStage.set(stage.name, contractStem(stage.outputs.contract));
  }
  for (const stage of ctx.stages.values()) {
    const block = stageBlockOf(ctx, stage.name);
    const inputs = stage.inputs || [];
    if (inputs.length === 0) {
      check.warn({
        file: 'graph.yaml',
        line: block?.line,
        message: `Stage "${stage.name}" declares no inputs — document reachability cannot be verified`,
      });
      continue;
    }
    // Profile input slots of the Profile bound to the Stage's Category (the
    // C2 convention: the graph node is named after the Category).
    const category = ctx.categories.get(stage.name)?.value;
    const profile = category?.default_profile ? ctx.profiles.get(category.default_profile)?.value : undefined;
    const slots = new Set((profile?.inputs || []).flatMap(slot => [normalizeVocab(slot.slot), normalizeVocab(slot.category)]));
    const requiredRefCategories = new Set((profile?.required_ref_categories || []).map(normalizeVocab));
    const selfContractStem = contractStemsByStage.get(stage.name);
    for (const input of inputs) {
      const normalized = normalizeVocab(input);
      const candidates = [normalized, stripInputDocSuffix(normalized)];
      const reachable = candidates.some(
        candidate =>
          categoryNames.has(candidate) ||
          requiredRefCategories.has(candidate) ||
          (stageNames.has(candidate) && candidate !== normalizeVocab(stage.name)) ||
          slots.has(candidate) ||
          [...contractStemsByStage.values()].some(stem => stem === candidate && stem !== selfContractStem),
      );
      if (reachable) continue;
      let line: number | undefined;
      if (block) {
        const inputsKeyLine = keyLineInBlock(ctx.graphLines, block, 'inputs');
        line = valueLine(ctx.graphLines, input, (inputsKeyLine ?? block.line + 1) - 1, block.end) ?? block.line;
      }
      // Warn, not fail: an unresolved name is not provably wrong. User-provided
      // or externally produced inputs (stage-inputs.md: "User-provided script
      // text") are legitimate Stage goals that no Pack document can provide;
      // the warning pressures document inputs toward the declared vocabulary.
      check.warn({
        file: 'graph.yaml',
        line,
        message:
          `Stage "${stage.name}" input "${input}" does not resolve to the document vocabulary ` +
          `(exported Category, Stage, Profile input slot, required_ref_categories, or outputs.contract) — ` +
          `acceptable for user-provided/external inputs; if it names a document, align it to that vocabulary`,
      });
    }
  }
  return check.result();
}

/** 2. Stage outputs declare a Contract (outputs.contract). */
function checkStageOutputContracts(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('stage-output-contracts', 'Stage outputs declare a Contract');
  if (!requireStages(ctx, check)) return check.result();
  for (const stage of ctx.stages.values()) {
    if (stage.outputs?.contract) continue;
    check.fail({
      file: 'graph.yaml',
      line: stageLineOf(ctx, stage.name),
      message: `Stage "${stage.name}" has no outputs.contract declaration`,
    });
  }
  return check.result();
}

/** 3. Roles receive complete Context (roles declaration + template materialization). */
function checkRoleContext(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('role-context', 'Roles receive complete Context');
  if (requireStages(ctx, check)) {
    for (const stage of ctx.stages.values()) {
      const block = stageBlockOf(ctx, stage.name);
      if (!stage.roles) {
        check.fail({
          file: 'graph.yaml',
          line: block?.line,
          message: `Stage "${stage.name}" declares no roles — Role applicability is undeclared`,
        });
        continue;
      }
      const values = Object.values(stage.roles);
      if (values.length === 0) {
        check.warn({ file: 'graph.yaml', line: block?.line, message: `Stage "${stage.name}" declares an empty roles mapping` });
      } else if (values.every(value => value === 'not_applicable')) {
        check.warn({
          file: 'graph.yaml',
          line: block ? keyLineInBlock(ctx.graphLines, block, 'roles') ?? block.line : undefined,
          message: `Stage "${stage.name}" marks every Role not_applicable — no Role receives Context for it`,
        });
      }
    }
  }

  // Role Context template materialization status (C1/C3) — project-level,
  // reused from Bootstrap; skipped when no project root is given.
  if (ctx.options.projectRoot) {
    const status = checkBootstrapStale(ctx.options.projectRoot);
    if (status.status === 'missing') {
      check.warn({
        file: BOOTSTRAP_MANIFEST_REL,
        message: 'Current project has no bootstrap manifest — run `opsv bootstrap` to materialize Role Context templates',
      });
    } else {
      for (const issue of status.issues) {
        check.warn({ file: BOOTSTRAP_MANIFEST_REL, message: `${issue.code}: ${issue.message}` });
      }
      for (const role of status.manifest?.roles || []) {
        if (role.status !== 'materialized') {
          check.fail({ file: role.template, message: `Role Context template for "${role.role}" is not materialized (status: ${role.status})` });
        }
      }
    }
  }
  return check.result();
}

/** 4. Review then iterate+sync is reachable on the Pack's Categories. */
function checkReviewIterateSync(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('review-iterate-sync', 'Review then iterate+sync is reachable');
  const categoryNames = Object.keys(ctx.manifest?.categories || {});
  const reviewSkills = [...ctx.skills.entries()].filter(([, entry]) => entry.value?.action === 'review');
  const approvalStages = [...ctx.stages.values()].filter(stage => (stage.completion || []).includes('document_status_approved'));
  const hasReviewPath = reviewSkills.length > 0 || approvalStages.length > 0;
  if (categoryNames.length === 0) {
    // Category-less Packs are legal (PackChecker passes them): a production-
    // only Pack has no documents to review — its produced artifacts go
    // through the artifact review path (a review-action Skill such as
    // mv-3d-previs clay-previs, or the downstream Pack's review). Without
    // any review surface, flag a warning rather than a fail.
    if (!hasReviewPath) {
      check.warn({
        file: 'pack.yaml',
        line: topKeyLine(ctx.packYamlLines, 'categories') ?? 1,
        message: 'Pack exports no Categories and declares no review path — review/iterate/sync is not applicable to its documents',
      });
    }
    return check.result();
  }
  if (!hasReviewPath) {
    check.fail({
      file: ctx.graphRaw !== undefined ? 'graph.yaml' : 'pack.yaml',
      line: ctx.graphRaw !== undefined ? (topKeyLine(ctx.graphLines, 'workflow') ?? 1) : (topKeyLine(ctx.packYamlLines, 'skills') ?? 1),
      message: 'No review path: declare a review-action Skill or a Stage completion "document_status_approved" so users can Review then iterate+sync',
    });
  }
  return check.result();
}

/** 5. Recommended tools are not misused as a hard whitelist. */
function checkRecommendedNotWhitelist(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('recommended-not-whitelist', 'Recommended tools are not a hard whitelist');

  // Hard surfaces: Skill gates/completion and Stage completion rules.
  const hardSurfaces: Array<{ file: string; line?: number; describe: string; tokens: string[]; lines: string[] }> = [];
  for (const [name, entry] of ctx.skills) {
    if (entry.value?.gates?.length) {
      hardSurfaces.push({ file: entry.rel, describe: `Skill "${name}" gates`, tokens: entry.value.gates, lines: entry.lines });
    }
    if (entry.value?.completion) {
      hardSurfaces.push({ file: entry.rel, describe: `Skill "${name}" completion`, tokens: [entry.value.completion], lines: entry.lines });
    }
  }
  for (const stage of ctx.stages.values()) {
    if (stage.completion?.length) {
      hardSurfaces.push({ file: 'graph.yaml', describe: `Stage "${stage.name}" completion`, tokens: stage.completion, lines: ctx.graphLines });
    }
  }

  for (const stage of ctx.stages.values()) {
    for (const capability of stage.recommended_capabilities || []) {
      for (const surface of hardSurfaces) {
        if (!surface.tokens.includes(capability)) continue;
        check.fail({
          file: surface.file,
          line: valueLine(surface.lines, capability),
          message: `recommended_capability "${capability}" (Stage "${stage.name}") appears in ${surface.describe} — a soft recommendation must never become a hard gate/completion rule`,
        });
      }
    }
  }
  return check.result();
}

/** 6. Hard/soft constraints are layered (workflow / toolset / spec constraints). */
function checkConstraintLayering(ctx: ConformanceContext): ConformanceCheckResult {
  const check = new CheckBuilder('constraint-layering', 'Hard/soft constraints are layered');

  // Unattributable fields: stage keys outside the workflow/toolset field
  // sets, and pack.yaml top-level keys outside the known manifest keys.
  for (const stage of ctx.stages.values()) {
    const block = stageBlockOf(ctx, stage.name);
    for (const key of Object.keys(stage)) {
      if (WORKFLOW_STAGE_FIELDS.has(key) || TOOLSET_STAGE_FIELDS.has(key) || RESOLVED_STAGE_META.has(key)) continue;
      check.warn({
        file: 'graph.yaml',
        line: block ? keyLineInBlock(ctx.graphLines, block, key) ?? block.line : undefined,
        message: `Stage "${stage.name}" field "${key}" cannot be attributed to the workflow / toolset / spec-constraint layers`,
      });
    }
  }
  for (const key of Object.keys(ctx.manifest || {})) {
    if (KNOWN_PACK_KEYS.has(key)) continue;
    check.warn({
      file: 'pack.yaml',
      line: topKeyLine(ctx.packYamlLines, key),
      message: `pack.yaml field "${key}" cannot be attributed to the workflow / toolset / spec-constraint layers`,
    });
  }

  // Layer presence: each layer should have at least one attributable declaration.
  const hasWorkflow = ctx.stages.size > 0;
  const hasToolset = ctx.skills.size > 0 || [...ctx.stages.values()].some(stage => (stage.recommended_capabilities || []).length > 0);
  const hasSpecConstraints =
    Object.keys(ctx.manifest?.categories || {}).length > 0 ||
    [...ctx.skills.values()].some(entry => (entry.value?.gates || []).length > 0);
  if (!hasWorkflow) {
    check.warn({ file: 'graph.yaml', line: 1, message: 'Workflow layer has no attributable declaration (no decodable graph.yaml Stages)' });
  }
  if (!hasToolset) {
    check.warn({ file: 'pack.yaml', line: topKeyLine(ctx.packYamlLines, 'skills') ?? 1, message: 'Toolset layer has no attributable declaration (no Skills or recommended_capabilities)' });
  }
  if (!hasSpecConstraints) {
    check.warn({ file: 'pack.yaml', line: topKeyLine(ctx.packYamlLines, 'categories') ?? 1, message: 'Spec-constraint layer has no attributable declaration (no Categories or gates)' });
  }
  return check.result();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function checkConformance(packRoot: string, options: ConformanceOptions = {}): ConformanceReport {
  const absRoot = path.resolve(packRoot);
  // Base validation is reused from PackChecker; conformance never re-derives
  // schema/cross-file rules, it only adds the six matrix judgements.
  const packReport = checkPack(absRoot);

  const packYamlRaw = readText(path.join(absRoot, 'pack.yaml'));
  let manifest: PackManifest | undefined;
  if (packYamlRaw !== undefined) {
    try {
      const parsed = PackManifestSchema.safeParse(yaml.load(packYamlRaw));
      if (parsed.success) manifest = parsed.data;
    } catch {
      manifest = undefined;
    }
  }

  const graphRaw = readText(path.join(absRoot, 'graph.yaml'));
  const graphLines = graphRaw !== undefined ? graphRaw.split('\n') : [];

  const ctx: ConformanceContext = {
    packRoot: absRoot,
    options,
    manifest,
    packYamlLines: packYamlRaw !== undefined ? packYamlRaw.split('\n') : [],
    graphRaw,
    graphLines,
    blocks: stageBlocks(graphLines),
    stages: loadGraphStages(absRoot),
    categories: decodeExports(absRoot, manifest?.categories, CategoryContractSchema),
    profiles: decodeExports(absRoot, manifest?.profiles, ProfileContractSchema),
    skills: decodeExports(absRoot, manifest?.skills, SkillManifestSchema),
  };

  if (!manifest) {
    // pack.yaml missing/undecodable: no layer can be attributed. Report one
    // located failure per check instead of a cascade of secondary noise.
    const message = packReport.issues.find(issue => issue.path === 'pack.yaml')?.message || 'pack.yaml is missing or undecodable';
    const finding: ConformanceFinding = { file: 'pack.yaml', line: 1, message };
    const checks = [
      new CheckBuilder('stage-inputs', 'Stage inputs are obtainable from documents'),
      new CheckBuilder('stage-output-contracts', 'Stage outputs declare a Contract'),
      new CheckBuilder('role-context', 'Roles receive complete Context'),
      new CheckBuilder('review-iterate-sync', 'Review then iterate+sync is reachable'),
      new CheckBuilder('recommended-not-whitelist', 'Recommended tools are not a hard whitelist'),
      new CheckBuilder('constraint-layering', 'Hard/soft constraints are layered'),
    ];
    for (const check of checks) check.fail(finding);
    return { pack: packReport.pack, checks: checks.map(check => check.result()), ok: false };
  }

  const checks = [
    checkStageInputs(ctx),
    checkStageOutputContracts(ctx),
    checkRoleContext(ctx),
    checkReviewIterateSync(ctx),
    checkRecommendedNotWhitelist(ctx),
    checkConstraintLayering(ctx),
  ];
  return {
    pack: packReport.pack,
    checks,
    ok: checks.every(check => check.status !== 'fail'),
  };
}

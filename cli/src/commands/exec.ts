// ============================================================================
// opsv exec — Execution Record command surface (B2 + B3).
//
// Minimal command face over `.opsv/execution/<id>/`:
//   create   — snapshot plan.json + append execution/plan events
//   validate — validate the current plan (bootstrap freshness + graph
//              coverage) and record it (planning → validate → start, §8.1)
//   start    — append the start event (fail-closed on bootstrap staleness, C1)
//   complete — close the execution (fail-closed unless every stage completed)
//   block    — park the execution with an explicit reason
//   revise   — Plan Revision (B3): plan-v<N> → plan-v<N+1> with declared-rule
//              impact analysis + reopened-stage list; appends plan_revision
//              (references the revised-from version; plan.json history is
//              immutable, never silently rewritten)
//   status   — reconcile the projection from events.jsonl and print it,
//              including the ReadyActionSet (analysis §8.4)
//   next     — the ReadyActionSet alone
//   resume   — interrupt recovery: reconcile (torn tail / seq sidecar / state
//              rebuild), NEVER replay external side effects (analysis §8.5)
//   event    — append a reference-only event; step/produce_run attempts are
//              auto-derived so a retry is a NEW attempt, never an overwrite
//
// Contracts:
//   - Asset-level judgement ("what is legal for this asset") is owned
//     exclusively by buildNextAction (via buildWorkPacket). This command never
//     re-implements that judgement and never parses rendered command strings.
//   - Plan Revision impact analysis consumes ONLY declared structure: the
//     plan diff, plan dependsOn edges, the Pack Workflow Graph (bootstrap
//     manifest), profile input relations, and Pack/Bootstrap digest changes.
//     An unresolvable impact scope blocks the revision unless a human
//     confirms it (--allow-unresolved) — never guessed from prose or "the
//     newest file".
//   - Plan Revision does NOT bypass the Asset Document lifecycle: concrete
//     changes still land through the document workflow or the short-range
//     iterate + review + syncing loop (analysis §8.2), which never emits
//     plan_revision events.
//   - Queries (status/next/resume) only refresh the derivable state.json;
//     events.jsonl stays the untouched source of truth.
//   - Standalone: reads .opsv/ + project docs only, never .trellis/.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { checkBootstrapStale, BootstrapStatus } from '../core/Bootstrap';
import {
  assertValidExecutionId,
  dropTornTail,
  EventStore,
  eventsPath,
  executionDir,
  executionRoot,
} from '../core/execution';
import { buildWorkPacket } from '../core/WorkPacket';
import { ExecutionError, OpsVErrorCode, ValidationError } from '../errors/OpsVError';
import {
  ExecutionEventDraft,
  ExecutionPlan,
  ExecutionPlanSchema,
  ExecutionState,
  ExecutionStatus,
} from '../types/ExecutionRecord';

const DEFAULT_BY = 'opsv-cli';

// ---------------------------------------------------------------------------
// ReadyActionSet (analysis §8.4): multiple mutually-independent legal actions
// ---------------------------------------------------------------------------

export interface ReadyAction {
  kind: string;
  assetId?: string;
  stageId?: string;
  stepId?: string;
  attempt?: number;
  reason?: string;
}

export interface ReadyActionSet {
  executionId: string;
  status: ExecutionStatus;
  ready: ReadyAction[];
  blocked: ReadyAction[];
  /** Started-but-never-closed work; external side effects are ambiguous. */
  inFlight: ReadyAction[];
}

/**
 * Derive the legal action set from (plan, projection). Stage/step traversal
 * only reads the projection; every asset-level decision delegates to
 * buildNextAction through buildWorkPacket (Go-frozen contract).
 */
export function computeReadyActions(
  projectRoot: string,
  plan: ExecutionPlan,
  state: ExecutionState,
): ReadyActionSet {
  const result: ReadyActionSet = {
    executionId: state.executionId,
    status: state.status,
    ready: [],
    blocked: [],
    inFlight: [],
  };

  // In-flight items: a start event with no terminal event. After an
  // interruption their external side effects may or may not have happened —
  // surface them for human confirmation, never silently replay (§8.5).
  for (const [stageId, stage] of Object.entries(state.stages)) {
    for (const [stepId, step] of Object.entries(stage.steps)) {
      if (step.status === 'running') {
        result.inFlight.push({
          kind: 'step_in_flight',
          stageId,
          stepId,
          attempt: step.attempt,
          reason: 'Step has a start event but no terminal event; confirm the outcome before retrying',
        });
      }
    }
  }
  for (const [runId, run] of Object.entries(state.runs)) {
    if (run.status === 'submitted') {
      result.inFlight.push({
        kind: 'run_in_flight',
        stageId: run.stageId,
        stepId: run.stepId,
        attempt: run.attempt,
        reason: `produce_run '${runId}' was submitted but has no terminal event; confirm the provider outcome before resubmitting`,
      });
    }
  }

  if (state.status === 'planning') {
    const validated = state.planValidatedVersion !== null && state.planValidatedVersion === state.planVersion;
    result.ready.push({
      kind: 'start_execution',
      reason: validated
        ? 'Execution is planned and validated; run: opsv exec start'
        : 'Execution is planned; run: opsv exec validate, then opsv exec start',
    });
    return result;
  }
  if (state.status !== 'running') return result;

  const stageStatus = (id: string): string => state.stages[id]?.status ?? 'open';

  // Every stage completed while the execution is still open → the legal next
  // action is to close it (running → completed, analysis §8.1).
  if (plan.stages.length > 0 && plan.stages.every((planStage) => stageStatus(planStage.id) === 'completed')) {
    result.ready.push({ kind: 'complete_execution', reason: 'All plan stages are completed; run: opsv exec complete' });
    return result;
  }

  for (const planStage of plan.stages) {
    const status = stageStatus(planStage.id);
    if (status === 'completed') continue;
    if (status === 'blocked') {
      result.blocked.push({ kind: 'stage_blocked', stageId: planStage.id, reason: 'Stage is blocked' });
      continue;
    }
    // Unmet dependencies are normal sequencing — nothing legal here yet.
    const unmet = (planStage.dependsOn ?? []).filter((dep) => stageStatus(dep) !== 'completed');
    if (unmet.length > 0) continue;

    const stage = state.stages[planStage.id];
    for (const planStep of planStage.steps) {
      const stepState = stage?.steps[planStep.id];
      const stepStatus = stepState?.status ?? 'pending';
      if (stepStatus === 'completed' || stepStatus === 'skipped' || stepStatus === 'running') continue;
      // pending | failed → legal to (re)start. A retry begins a NEW attempt
      // (previous attempt history is never overwritten, §8.4).
      const attempt = (stepState?.attempt ?? 0) + 1;
      if (!planStep.refs || planStep.refs.length === 0) {
        result.ready.push({ kind: 'step', stageId: planStage.id, stepId: planStep.id, attempt, reason: planStep.label });
        continue;
      }
      for (const assetId of planStep.refs) {
        let packet;
        try {
          packet = buildWorkPacket(projectRoot, assetId);
        } catch (error: any) {
          result.blocked.push({
            kind: 'asset_unresolved',
            assetId,
            stageId: planStage.id,
            stepId: planStep.id,
            attempt,
            reason: error?.message ?? String(error),
          });
          continue;
        }
        const action = packet.nextAction;
        if (!action || action.kind === 'blocked') {
          const codes = action?.kind === 'blocked' ? action.issueCodes : packet.issues.map((issue) => issue.code);
          result.blocked.push({
            kind: 'blocked',
            assetId,
            stageId: planStage.id,
            stepId: planStep.id,
            attempt,
            reason: codes.join(', ') || 'Asset is blocked',
          });
          continue;
        }
        result.ready.push({ kind: action.kind, assetId, stageId: planStage.id, stepId: planStep.id, attempt });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ReadyActionSet persistence (B4)
//
// The A3 breadcrumb hook reads ready-actions.json directly from disk — no
// CLI call — which is how the per-turn ~300ms budget is met. Like state.json
// this is a derivable sidecar; events.jsonl stays the source of truth and the
// `lastSeq` field lets readers detect a stale projection and fall back
// VISIBLY to the disk-derived path.
// ---------------------------------------------------------------------------

/** File holding the last computed ReadyActionSet, next to state.json. */
export function readyActionsPath(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'ready-actions.json');
}

export interface PersistedReadyActions extends ReadyActionSet {
  /** events.jsonl seq at compute time; readers treat a mismatch as stale. */
  lastSeq: number;
  computedAt: string;
}

/** Persist the ReadyActionSet (atomic tmp+rename) for projection readers. */
export async function persistReadyActions(
  projectRoot: string,
  state: ExecutionState,
  set: ReadyActionSet,
): Promise<void> {
  const file = readyActionsPath(projectRoot, state.executionId);
  const persisted: PersistedReadyActions = {
    ...set,
    lastSeq: state.lastSeq,
    computedAt: new Date().toISOString(),
  };
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fs.promises.writeFile(tmp, JSON.stringify(persisted, null, 2) + '\n', 'utf-8');
  await fs.promises.rename(tmp, file);
}

/**
 * Best-effort persist for the query commands: a sidecar write failure must
 * never fail status/next/resume — the breadcrumb simply falls back to the
 * disk path (visibly) until the next successful reconcile.
 */
async function persistReadyActionsQuietly(projectRoot: string, state: ExecutionState, set: ReadyActionSet): Promise<void> {
  try {
    await persistReadyActions(projectRoot, state, set);
  } catch (error: any) {
    console.error(
      chalk.yellow(
        `warning: could not persist ready-actions.json (${error?.message ?? error}); ` +
          'the breadcrumb hook falls back to the disk-derived path',
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Execution resolution
// ---------------------------------------------------------------------------

export function resolveExecutionId(projectRoot: string, idOption?: string): string {
  if (idOption) {
    assertValidExecutionId(idOption);
    return idOption;
  }
  const rootDir = executionRoot(projectRoot);
  const ids = fs.existsSync(rootDir)
    ? fs.readdirSync(rootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  if (ids.length === 0) {
    throw new ExecutionError(
      OpsVErrorCode.EXECUTION_NOT_FOUND,
      'No execution found under .opsv/execution/. Create one first: opsv exec create --plan <plan.json>',
    );
  }
  if (ids.length > 1) {
    throw new ValidationError(
      OpsVErrorCode.VALIDATION_TYPE_ERROR,
      `Multiple executions exist (${ids.join(', ')}); pass --id <execution-id>`,
    );
  }
  return ids[0];
}

/** Resolve the execution id and require an initialized event log. */
function openStore(projectRoot: string, idOption?: string): EventStore {
  const executionId = resolveExecutionId(projectRoot, idOption);
  if (!fs.existsSync(eventsPath(projectRoot, executionId))) {
    throw new ExecutionError(
      OpsVErrorCode.EXECUTION_NOT_FOUND,
      `Execution '${executionId}' has no event log. Create it first: opsv exec create --plan <plan.json>`,
    );
  }
  return new EventStore(projectRoot, executionId);
}

/** Reconcile the projection from events.jsonl and load the CURRENT plan
 *  (plan.json for v1; the latest plan.v<N>.json snapshot after revisions). */
async function loadProjection(store: EventStore): Promise<{ state: ExecutionState; plan: ExecutionPlan }> {
  const state = await store.projectState();
  const plan = await store.readCurrentPlan();
  if (!plan) {
    throw new ExecutionError(
      OpsVErrorCode.EXECUTION_NOT_FOUND,
      `Execution '${store.executionId}' has no plan.json; the record is incomplete`,
    );
  }
  return { state, plan };
}

// ---------------------------------------------------------------------------
// Plan Revision impact analysis (B3; analysis §8.2)
//
// Declared-rule bases ONLY:
//   1. structural plan diff (removed/changed stages — steps/refs/roles/gates/
//      dependsOn compared verbatim);
//   2. plan dependsOn edges of the OLD plan (execution history ran under it);
//   3. the Pack Workflow Graph (bootstrap manifest nodes, dependsOn edges);
//   4. explicit action input relations (profile input slots by category);
//   5. Pack/Contract/Bootstrap digest changes (checkBootstrapStale).
// Anything that cannot be resolved through these is `unresolved` — the caller
// blocks the revision or requires explicit human confirmation. Asset-document
// content drift is deliberately NOT analyzed here: it belongs to the
// short-range iterate + review + syncing loop (§8.2).
// ---------------------------------------------------------------------------

export interface RevisionImpact {
  /** Plan stages whose executed work is (transitively) affected. */
  affectedStages: string[];
  /** Affected stages with recorded progress — reopened by the revision. */
  reopenedStages: string[];
  /** Impact scopes no declared rule can resolve (human confirmation needed). */
  unresolved: string[];
}

/** Key-order-stable stringify for structural stage comparison. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function computeRevisionImpact(
  oldPlan: ExecutionPlan,
  newPlan: ExecutionPlan,
  state: ExecutionState,
  bootstrap: BootstrapStatus,
): RevisionImpact {
  const oldStageIds = new Set(oldPlan.stages.map((stage) => stage.id));
  const newStages = new Map(newPlan.stages.map((stage) => [stage.id, stage]));

  // Seed set in the shared plan/graph id space.
  const seeds = new Set<string>();
  for (const stage of oldPlan.stages) {
    const next = newStages.get(stage.id);
    if (!next || stableStringify(next) !== stableStringify(stage)) seeds.add(stage.id);
  }

  const unresolved: string[] = [];
  const graphNodes = bootstrap.manifest?.workflowGraph ?? [];

  // Pack/Bootstrap changes as impact sources (fail-closed when unmappable).
  if (bootstrap.status === 'missing' || bootstrap.status === 'invalid') {
    // Without a manifest the Pack-side propagation rules are unreadable.
    unresolved.push('bootstrap');
  } else if (bootstrap.status === 'stale' && bootstrap.manifest) {
    for (const issue of bootstrap.issues) {
      const component = issue.context?.component;
      const packId = typeof issue.context?.pack === 'string' ? issue.context.pack : undefined;
      if ((component === 'graph' || component === 'pack') && packId) {
        // The Pack's declared workflow/contracts changed: every stage mapped
        // to one of its graph nodes is suspect. A changed Pack with NO graph
        // nodes in the manifest declares no mapping rule → unresolvable.
        const nodes = graphNodes.filter((node) => node.pack === packId);
        if (nodes.length === 0) unresolved.push(`pack:${packId}`);
        for (const node of nodes) seeds.add(node.id);
      } else {
        // project.yaml / combined-digest drift: impact scope is not derivable
        // from declared rules.
        unresolved.push(typeof component === 'string' ? component : 'contentDigest');
      }
    }
  }

  // Transitive closure over plan edges (old plan) + Pack graph edges and
  // profile input relations — one fixpoint in the shared id space.
  const affectedIds = new Set(seeds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const stage of oldPlan.stages) {
      if (!affectedIds.has(stage.id) && (stage.dependsOn ?? []).some((dep) => affectedIds.has(dep))) {
        affectedIds.add(stage.id);
        grew = true;
      }
    }
    for (const node of graphNodes) {
      if (affectedIds.has(node.id)) continue;
      const viaDeps = node.dependsOn.some((dep) => affectedIds.has(dep));
      const viaInputs = (node.profile?.inputs ?? []).some((input) => affectedIds.has(input.category));
      if (viaDeps || viaInputs) {
        affectedIds.add(node.id);
        grew = true;
      }
    }
  }

  const affectedStages = [...affectedIds].filter((id) => oldStageIds.has(id)).sort();
  // Reopen only stages with recorded progress; untouched stages need no
  // reopen (they are still open/pending by definition).
  const reopenedStages = affectedStages.filter((id) => {
    const stage = state.stages[id];
    if (!stage) return false;
    if (stage.status !== 'open') return true;
    return Object.values(stage.steps).some((step) => step.status !== 'pending' || step.attempt > 0);
  });

  return { affectedStages, reopenedStages, unresolved: [...new Set(unresolved)].sort() };
}

/**
 * Attempt defaults derived from the CURRENT projection: starting new work
 * begins attempt N+1; terminal events attach to the open attempt N. Explicit
 * payload.attempt always wins (adapter authority).
 */
async function withAutoAttempt(store: EventStore, draft: ExecutionEventDraft): Promise<ExecutionEventDraft> {
  if (draft.kind === 'step' && draft.payload.attempt === undefined) {
    const state = await store.projectState();
    const prev = state.stages[draft.payload.stageId]?.steps[draft.payload.stepId];
    const attempt = draft.payload.action === 'start' ? (prev?.attempt ?? 0) + 1 : prev?.attempt ?? 1;
    return { ...draft, payload: { ...draft.payload, attempt } };
  }
  if (draft.kind === 'produce_run' && draft.payload.attempt === undefined) {
    const state = await store.projectState();
    const prev = state.runs[draft.payload.runId];
    const attempt = draft.payload.status === 'submitted' ? (prev?.attempt ?? 0) + 1 : prev?.attempt ?? 1;
    return { ...draft, payload: { ...draft.payload, attempt } };
  }
  return draft;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatAction(action: ReadyAction): string {
  const parts = [action.kind];
  if (action.assetId) parts.push(`asset=${action.assetId}`);
  if (action.stageId) parts.push(`stage=${action.stageId}`);
  if (action.stepId) parts.push(`step=${action.stepId}`);
  if (action.attempt !== undefined) parts.push(`attempt=${action.attempt}`);
  if (action.reason) parts.push(`(${action.reason})`);
  return parts.join(' ');
}

function printReadyActions(set: ReadyActionSet): void {
  console.log(`Ready: ${set.ready.length}  Blocked: ${set.blocked.length}  In-flight: ${set.inFlight.length}`);
  for (const action of set.ready) console.log(`  [ready] ${formatAction(action)}`);
  for (const action of set.blocked) console.log(chalk.yellow(`  [blocked] ${formatAction(action)}`));
  for (const action of set.inFlight) console.log(chalk.yellow(`  [in-flight] ${formatAction(action)}`));
}

function printStatus(state: ExecutionState, set: ReadyActionSet): void {
  console.log(`${state.executionId}: ${state.status} (plan v${state.planVersion ?? '-'}, seq ${state.lastSeq})`);
  for (const [stageId, stage] of Object.entries(state.stages)) {
    console.log(`  Stage ${stageId} [${stage.status}]`);
    for (const [stepId, step] of Object.entries(stage.steps)) {
      console.log(`    ${stepId}: ${step.status} (attempt ${step.attempt})`);
    }
  }
  printReadyActions(set);
}

function fail(error: any): void {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerExecCommand(program: Command): void {
  const exec = program
    .command('exec')
    .description('Execution Record: event-sourced project execution (.opsv/execution/)');

  exec
    .command('create')
    .description('Create an execution from a plan JSON (snapshots plan.json + appends execution/plan events)')
    .requiredOption('--plan <file>', 'Path to the plan JSON file')
    .option('--id <execution-id>', 'Execution id (defaults to plan.executionId)')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { plan: string; id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const planFile = path.resolve(root, options.plan);
        if (!fs.existsSync(planFile)) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Plan file not found: ${options.plan}`);
        }
        let raw: unknown;
        try {
          raw = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
        } catch (error: any) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Plan file is not valid JSON: ${error.message}`);
        }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, 'Plan file must contain a JSON object');
        }
        const declared = (raw as { executionId?: unknown }).executionId;
        if (options.id && typeof declared === 'string' && declared !== options.id) {
          throw new ValidationError(
            OpsVErrorCode.VALIDATION_TYPE_ERROR,
            `Plan executionId '${declared}' does not match --id '${options.id}'`,
          );
        }
        const executionId = options.id ?? declared;
        if (typeof executionId !== 'string' || executionId.length === 0) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, 'Plan has no executionId; pass --id <execution-id>');
        }
        assertValidExecutionId(executionId);

        const store = new EventStore(root, executionId);
        // init validates the plan against ExecutionPlanSchema and writes the
        // immutable plan.json snapshot into the execution dir.
        await store.init({ ...(raw as object), executionId } as ExecutionPlan);
        const plan = await store.readPlan();
        await store.append({ kind: 'execution', by: DEFAULT_BY, payload: { action: 'create' } });
        await store.append({
          kind: 'plan',
          by: DEFAULT_BY,
          payload: { action: 'set', planVersion: plan!.version, planPath: 'plan.json', title: plan!.title },
        });
        const state = await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, executionId, state }, null, 2));
        } else {
          console.log(chalk.green(`Execution '${executionId}' created (${plan!.stages.length} stage(s), plan v${plan!.version})`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('start')
    .description('Start a created execution (fail-closed when the bootstrap is stale)')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        // Fail-closed preflight (C1 wiring): missing/invalid/stale bootstrap
        // refuses to start the execution.
        const bootstrap = checkBootstrapStale(root);
        if (bootstrap.stale) {
          if (options.json) {
            console.log(JSON.stringify({ ok: false, bootstrap: { status: bootstrap.status, issues: bootstrap.issues } }, null, 2));
          } else {
            for (const issue of bootstrap.issues) console.error(chalk.red(`${issue.code}: ${issue.message}`));
          }
          process.exitCode = 1;
          return;
        }
        const store = openStore(root, options.id);
        const state = await store.projectState();
        if (state.status === 'completed') {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_INVALID_TRANSITION,
            `Execution '${store.executionId}' is already completed; a closed execution cannot be started`,
          );
        }
        if (state.status === 'running') {
          // Idempotent: a second start does not duplicate the start event.
          if (options.json) {
            console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: 'running', alreadyRunning: true }, null, 2));
          } else {
            console.log(`Execution '${store.executionId}' is already running (seq ${state.lastSeq})`);
          }
          return;
        }
        const event = await store.append({ kind: 'execution', by: DEFAULT_BY, payload: { action: 'start' } });
        const next = await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: next.status, seq: event.seq }, null, 2));
        } else {
          console.log(chalk.green(`Execution '${store.executionId}' started (seq ${event.seq})`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('status')
    .description('Reconcile the projection from events.jsonl and print the state + ReadyActionSet')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const { state, plan } = await loadProjection(store);
        const readyActions = computeReadyActions(root, plan, state);
        await persistReadyActionsQuietly(root, state, readyActions);
        if (options.json) {
          console.log(JSON.stringify({ ...state, readyActions }, null, 2));
        } else {
          printStatus(state, readyActions);
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('next')
    .description('Print the ReadyActionSet: the legal actions derived from the projection')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const { state, plan } = await loadProjection(store);
        const readyActions = computeReadyActions(root, plan, state);
        await persistReadyActionsQuietly(root, state, readyActions);
        if (options.json) {
          console.log(JSON.stringify(readyActions, null, 2));
        } else {
          console.log(`${readyActions.executionId}: ${readyActions.status}`);
          printReadyActions(readyActions);
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('resume')
    .description('Rebuild state from events.jsonl after an interruption (reconcile; never replays external side effects)')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const jsonl = eventsPath(root, store.executionId);

        // Torn tail = bytes from a crash mid-append; never committed, so they
        // are dropped, never replayed.
        let tornTailDropped = false;
        const stat = fs.statSync(jsonl);
        if (stat.size > 0) {
          const fd = fs.openSync(jsonl, 'r');
          try {
            const last = Buffer.alloc(1);
            fs.readSync(fd, last, 0, 1, stat.size - 1);
            if (last[0] !== 0x0a) {
              await dropTornTail(jsonl);
              tornTailDropped = true;
            }
          } finally {
            fs.closeSync(fd);
          }
        }

        // Repairs a missing/corrupt seq sidecar against the JSONL tail.
        const lastSeq = await store.readLastSeq();
        let previousStateSeq: number | null = null;
        try {
          previousStateSeq = (await store.readState())?.lastSeq ?? null;
        } catch {
          // A corrupt state.json is replaced by the rebuild below — it is a
          // derivable projection, never the source of truth.
        }
        const { state, plan } = await loadProjection(store);
        const readyActions = computeReadyActions(root, plan, state);
        await persistReadyActionsQuietly(root, state, readyActions);
        const confirmationRequired = readyActions.inFlight.length > 0;
        const report = {
          executionId: store.executionId,
          status: state.status,
          recovered: { events: lastSeq, lastSeq, tornTailDropped, previousStateSeq, stateRebuilt: true },
          confirmationRequired,
          readyActions,
        };
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        console.log(
          `Execution '${store.executionId}' recovered from ${lastSeq} event(s)` +
            `${tornTailDropped ? ' (torn tail dropped)' : ''}; state.json rebuilt.`,
        );
        if (confirmationRequired) {
          console.log(
            chalk.yellow(
              'blocked: in-flight items need human confirmation before retrying ' +
                '(their external side effects are unknown):',
            ),
          );
        }
        printReadyActions(readyActions);
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('event <kind>')
    .description('Append an execution event (payload JSON; reference-only, schema-validated by the store)')
    .requiredOption('--payload <json>', 'Event payload as a JSON object')
    .option('--id <execution-id>')
    .option('--by <actor>', 'Event actor recorded on the event', DEFAULT_BY)
    .option('--idempotency-key <key>', 'Idempotency key (same key + same kind dedups)')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (kind: string, options: { payload: string; id?: string; by: string; idempotencyKey?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        let payload: unknown;
        try {
          payload = JSON.parse(options.payload);
        } catch (error: any) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `--payload is not valid JSON: ${error.message}`);
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, '--payload must be a JSON object');
        }
        let draft = { kind, by: options.by, payload } as ExecutionEventDraft;
        if (options.idempotencyKey) draft = { ...draft, idempotencyKey: options.idempotencyKey };
        // Retry semantics: a new attempt is appended, never an overwrite of
        // the failed one. The store schema carries the `attempt` field.
        draft = await withAutoAttempt(store, draft);
        const event = await store.append(draft);
        const state = await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, event, status: state.status }, null, 2));
        } else {
          console.log(chalk.green(`seq ${event.seq}: ${event.kind} recorded`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('validate')
    .description('Validate the current plan (fail-closed on a stale bootstrap) and record the validation')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const { state, plan } = await loadProjection(store);

        const issues: { code: string; message: string }[] = [];
        const warnings: { code: string; message: string }[] = [];

        // Fail-closed (C1): a missing/invalid/stale bootstrap means the Pack
        // contracts the plan was derived from can no longer be trusted.
        const bootstrap = checkBootstrapStale(root);
        for (const issue of bootstrap.issues) issues.push({ code: issue.code, message: issue.message });

        // Plan structural integrity (duplicate ids / unknown deps / cycles) is
        // enforced by ExecutionPlanSchema at write time; validate re-checks
        // the CURRENT plan file against the same schema.
        const reparsed = ExecutionPlanSchema.safeParse(plan);
        if (!reparsed.success) issues.push({ code: 'PLAN_INVALID', message: reparsed.error.message });

        // Coverage against the Pack Workflow Graph is informational: plans
        // may declare stages beyond the Pack's domain workflow.
        const graphNodes = bootstrap.manifest?.workflowGraph ?? [];
        if (graphNodes.length > 0) {
          const nodeIds = new Set(graphNodes.map((node) => node.id));
          for (const stage of plan.stages) {
            if (!nodeIds.has(stage.id)) {
              warnings.push({ code: 'STAGE_NOT_IN_GRAPH', message: `Stage '${stage.id}' has no Pack Workflow Graph node; Pack propagation rules do not cover it` });
            }
          }
        }

        if (issues.length > 0) {
          if (options.json) {
            console.log(JSON.stringify({ ok: false, executionId: store.executionId, planVersion: plan.version, issues, warnings }, null, 2));
          } else {
            for (const issue of issues) console.error(chalk.red(`${issue.code}: ${issue.message}`));
            for (const warning of warnings) console.log(chalk.yellow(`${warning.code}: ${warning.message}`));
          }
          process.exitCode = 1;
          return;
        }

        const planPath = state.planPath ?? 'plan.json';
        const note = warnings.length > 0 ? `ok (${warnings.length} coverage warning(s))` : 'ok';
        const event = await store.append({
          kind: 'plan',
          by: DEFAULT_BY,
          payload: { action: 'validate', planVersion: plan.version, planPath, note },
        });
        await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, executionId: store.executionId, planVersion: plan.version, warnings, seq: event.seq }, null, 2));
        } else {
          console.log(chalk.green(`Execution '${store.executionId}' plan v${plan.version} validated (seq ${event.seq})`));
          for (const warning of warnings) console.log(chalk.yellow(`${warning.code}: ${warning.message}`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('complete')
    .description('Complete a running execution (fail-closed unless every plan stage is completed)')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const { state, plan } = await loadProjection(store);
        if (state.status === 'completed') {
          // Idempotent: a second complete does not duplicate the event.
          if (options.json) {
            console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: 'completed', alreadyCompleted: true }, null, 2));
          } else {
            console.log(`Execution '${store.executionId}' is already completed (seq ${state.lastSeq})`);
          }
          return;
        }
        if (state.status !== 'running') {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_INVALID_TRANSITION,
            `Execution '${store.executionId}' is ${state.status}; only a running execution can complete`,
          );
        }
        const incomplete = plan.stages
          .filter((stage) => (state.stages[stage.id]?.status ?? 'open') !== 'completed')
          .map((stage) => stage.id);
        if (incomplete.length > 0) {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_INVALID_TRANSITION,
            `Execution '${store.executionId}' cannot complete; incomplete stage(s): ${incomplete.join(', ')}`,
          );
        }
        const event = await store.append({ kind: 'execution', by: DEFAULT_BY, payload: { action: 'complete' } });
        await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: 'completed', seq: event.seq }, null, 2));
        } else {
          console.log(chalk.green(`Execution '${store.executionId}' completed (seq ${event.seq})`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('block')
    .description('Block an execution with an explicit reason (running/blocked lifecycle)')
    .requiredOption('--reason <text>', 'Why the execution is blocked (short annotation)')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { reason: string; id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const state = await store.projectState();
        if (state.status === 'blocked') {
          if (options.json) {
            console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: 'blocked', alreadyBlocked: true }, null, 2));
          } else {
            console.log(`Execution '${store.executionId}' is already blocked (seq ${state.lastSeq})`);
          }
          return;
        }
        if (state.status !== 'running' && state.status !== 'planning') {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_INVALID_TRANSITION,
            `Execution '${store.executionId}' is ${state.status}; only a planning/running execution can be blocked`,
          );
        }
        const event = await store.append({ kind: 'execution', by: DEFAULT_BY, payload: { action: 'block', reason: options.reason } });
        await store.projectState();
        if (options.json) {
          console.log(JSON.stringify({ ok: true, executionId: store.executionId, status: 'blocked', seq: event.seq }, null, 2));
        } else {
          console.log(chalk.green(`Execution '${store.executionId}' blocked (seq ${event.seq}): ${options.reason}`));
        }
      } catch (error: any) {
        fail(error);
      }
    });

  exec
    .command('revise')
    .description(
      'Revise the plan (plan-v<N> → plan-v<N+1>): declared-rule impact analysis, ' +
        'reopened-stage list, appended plan_revision event. plan-v<N> history is never rewritten',
    )
    .requiredOption('--plan <file>', 'Path to the revised plan JSON (version must be current + 1)')
    .option('--reason <text>', 'Why the plan is revised (short annotation)')
    .option('--allow-unresolved', 'Human confirmation for impact scopes no declared rule can resolve')
    .option('--id <execution-id>')
    .option('--json', 'Print machine JSON on stdout')
    .action(async (options: { plan: string; reason?: string; allowUnresolved?: boolean; id?: string; json?: boolean }) => {
      try {
        const root = process.cwd();
        const store = openStore(root, options.id);
        const { state, plan: currentPlan } = await loadProjection(store);

        if (state.status === 'completed' || state.status === 'failed') {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_INVALID_TRANSITION,
            `Execution '${store.executionId}' is ${state.status} (closed); a closed execution cannot be revised`,
          );
        }

        const planFile = path.resolve(root, options.plan);
        if (!fs.existsSync(planFile)) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Plan file not found: ${options.plan}`);
        }
        let raw: unknown;
        try {
          raw = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
        } catch (error: any) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Plan file is not valid JSON: ${error.message}`);
        }
        const parsed = ExecutionPlanSchema.safeParse(raw);
        if (!parsed.success) {
          throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `Invalid revised plan: ${parsed.error.message}`, {
            issues: parsed.error.issues,
          });
        }
        const newPlan = parsed.data;
        if (newPlan.executionId !== store.executionId) {
          throw new ValidationError(
            OpsVErrorCode.VALIDATION_TYPE_ERROR,
            `Revised plan executionId '${newPlan.executionId}' does not match execution '${store.executionId}'`,
          );
        }
        const fromVersion = state.planVersion ?? currentPlan.version;
        const toVersion = fromVersion + 1;
        if (newPlan.version !== toVersion) {
          throw new ValidationError(
            OpsVErrorCode.VALIDATION_TYPE_ERROR,
            `Revised plan version must be ${toVersion} (current plan is v${fromVersion}); got v${newPlan.version}. ` +
              'Revisions are linear and reference the revised-from version explicitly',
          );
        }

        // Declared-rule impact analysis; unresolvable scopes block the
        // revision unless a human confirms them (--allow-unresolved).
        const impact = computeRevisionImpact(currentPlan, newPlan, state, checkBootstrapStale(root));
        if (impact.unresolved.length > 0 && !options.allowUnresolved) {
          throw new ExecutionError(
            OpsVErrorCode.EXECUTION_PLAN_REVISION_UNRESOLVED,
            `Impact scope cannot be resolved from declared rules: ${impact.unresolved.join(', ')}. ` +
              'Re-run with --allow-unresolved to confirm these scopes manually',
            { unresolved: impact.unresolved },
          );
        }

        // Immutable snapshot: plan.v<N>.json joins the record; plan.json
        // (v1) and earlier snapshots stay byte-identical.
        const planPath = await store.writePlanSnapshot(newPlan, `plan.v${toVersion}.json`);
        const event = await store.append({
          kind: 'plan_revision',
          by: DEFAULT_BY,
          payload: {
            fromVersion,
            toVersion,
            planPath,
            ...(options.reason ? { reason: options.reason } : {}),
            affectedStages: impact.affectedStages,
            reopenedStages: impact.reopenedStages,
            ...(impact.unresolved.length > 0 ? { unresolved: impact.unresolved } : {}),
          },
        });
        await store.projectState();
        const report = {
          ok: true,
          executionId: store.executionId,
          fromVersion,
          toVersion,
          planPath,
          impact,
          seq: event.seq,
        };
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(
            chalk.green(
              `Execution '${store.executionId}' revised: plan v${fromVersion} → v${toVersion} (seq ${event.seq}); ` +
                `affected stage(s): [${impact.affectedStages.join(', ')}], reopened: [${impact.reopenedStages.join(', ')}]`,
            ),
          );
          if (impact.unresolved.length > 0) {
            console.log(chalk.yellow(`Confirmed unresolved impact scope(s): ${impact.unresolved.join(', ')}`));
          }
        }
      } catch (error: any) {
        fail(error);
      }
    });
}

// ============================================================================
// Execution state reducer — PURE projection, no I/O.
//
// events.jsonl is the source of truth; state.json is this function's output.
// Guarantees:
//   - order-independent: input is sorted by seq on a copy, so replaying a
//     shuffled log yields an identical projection;
//   - idempotent: an idempotencyKey takes effect once (first seq wins);
//   - non-mutating: the input array and events are never modified.
// ============================================================================

import {
  ExecutionEvent,
  ExecutionState,
  ExecutionStatus,
  StageState,
  StageStatus,
  StepStatus,
} from '../../types/ExecutionRecord';

export function createInitialState(executionId: string): ExecutionState {
  return {
    executionId,
    status: 'planning',
    planVersion: null,
    revisions: [],
    stages: {},
    roles: {},
    contexts: {},
    runs: {},
    artifacts: {},
    gates: {},
    reviews: [],
    syncings: [],
    nextActions: null,
    lastSeq: 0,
    counts: {},
  };
}

const EXECUTION_ACTION_TO_STATUS: Record<string, ExecutionStatus> = {
  create: 'planning',
  start: 'running',
  complete: 'completed',
  block: 'blocked',
  fail: 'failed',
};

const STAGE_ACTION_TO_STATUS: Record<string, StageStatus> = {
  open: 'open',
  start: 'running',
  complete: 'completed',
  reopen: 'open',
  block: 'blocked',
};

const STEP_ACTION_TO_STATUS: Record<string, StepStatus> = {
  start: 'running',
  complete: 'completed',
  fail: 'failed',
  skip: 'skipped',
  reopen: 'pending',
};

function ensureStage(state: ExecutionState, stageId: string): StageState {
  let stage = state.stages[stageId];
  if (!stage) {
    stage = { status: 'open', steps: {} };
    state.stages[stageId] = stage;
  }
  return stage;
}

function applyEvent(state: ExecutionState, ev: ExecutionEvent): void {
  switch (ev.kind) {
    case 'execution': {
      const status = EXECUTION_ACTION_TO_STATUS[ev.payload.action];
      if (status) state.status = status;
      break;
    }
    case 'plan': {
      state.planVersion = ev.payload.planVersion;
      state.planPath = ev.payload.planPath;
      break;
    }
    case 'plan_revision': {
      state.revisions.push({
        fromVersion: ev.payload.fromVersion,
        toVersion: ev.payload.toVersion,
        ts: ev.ts,
      });
      state.planVersion = ev.payload.toVersion;
      state.planPath = ev.payload.planPath;
      for (const stageId of ev.payload.reopenedStages ?? []) {
        const stage = ensureStage(state, stageId);
        stage.status = 'open';
        for (const step of Object.values(stage.steps)) {
          step.status = 'pending';
        }
      }
      break;
    }
    case 'stage': {
      const stage = ensureStage(state, ev.payload.stageId);
      const status = STAGE_ACTION_TO_STATUS[ev.payload.action];
      if (status) stage.status = status;
      if (ev.payload.label !== undefined) stage.label = ev.payload.label;
      break;
    }
    case 'step': {
      const stage = ensureStage(state, ev.payload.stageId);
      const prev = stage.steps[ev.payload.stepId];
      const status = STEP_ACTION_TO_STATUS[ev.payload.action] ?? prev?.status ?? 'pending';
      stage.steps[ev.payload.stepId] = {
        status,
        attempt: ev.payload.attempt ?? prev?.attempt ?? 0,
      };
      break;
    }
    case 'role': {
      const status =
        ev.payload.action === 'assign'
          ? 'assigned'
          : ev.payload.action === 'start'
            ? 'running'
            : 'completed';
      state.roles[ev.payload.role] = {
        status,
        stageId: ev.payload.stageId,
        stepId: ev.payload.stepId,
      };
      break;
    }
    case 'context': {
      if (ev.payload.action === 'attach') {
        state.contexts[ev.payload.contextId] = {
          path: ev.payload.path,
          hash: ev.payload.hash,
          attached: true,
          stageId: ev.payload.stageId,
        };
      } else {
        const existing = state.contexts[ev.payload.contextId];
        state.contexts[ev.payload.contextId] = {
          path: existing?.path ?? ev.payload.path,
          hash: existing?.hash ?? ev.payload.hash,
          attached: false,
          stageId: existing?.stageId ?? ev.payload.stageId,
        };
      }
      break;
    }
    case 'produce_run': {
      const prev = state.runs[ev.payload.runId];
      state.runs[ev.payload.runId] = {
        status: ev.payload.status,
        attempt: ev.payload.attempt ?? prev?.attempt ?? 0,
        stageId: ev.payload.stageId ?? prev?.stageId,
        stepId: ev.payload.stepId ?? prev?.stepId,
        taskId: ev.payload.taskId ?? prev?.taskId,
        taskPath: ev.payload.taskPath ?? prev?.taskPath,
        provider: ev.payload.provider ?? prev?.provider,
        outputIds: ev.payload.outputIds ?? prev?.outputIds,
      };
      break;
    }
    case 'artifact': {
      state.artifacts[ev.payload.artifactId] = {
        path: ev.payload.path,
        hash: ev.payload.hash,
        producedBy: ev.payload.producedBy,
        supersededBy: state.artifacts[ev.payload.artifactId]?.supersededBy,
      };
      if (ev.payload.supersedes) {
        const old = state.artifacts[ev.payload.supersedes];
        if (old) old.supersededBy = ev.payload.artifactId;
      }
      break;
    }
    case 'gate': {
      state.gates[ev.payload.gateId] = {
        result: ev.payload.result,
        stageId: ev.payload.stageId,
        stepId: ev.payload.stepId,
        ts: ev.ts,
      };
      break;
    }
    case 'review': {
      state.reviews.push({
        action: ev.payload.action,
        assetId: ev.payload.assetId,
        artifactId: ev.payload.artifactId,
        ts: ev.ts,
      });
      break;
    }
    case 'syncing': {
      state.syncings.push({
        action: ev.payload.action,
        assetId: ev.payload.assetId,
        variant: ev.payload.variant,
        ts: ev.ts,
      });
      break;
    }
    case 'next_action': {
      state.nextActions = ev.payload.actions.map((a) => ({ ...a }));
      break;
    }
  }
  state.lastSeq = Math.max(state.lastSeq, ev.seq);
  state.counts[ev.kind] = (state.counts[ev.kind] ?? 0) + 1;
}

/**
 * Project events into state. Pure: no I/O, no input mutation, deterministic
 * under arbitrary input ordering (events are applied in seq order).
 */
export function reduceEvents(
  events: readonly ExecutionEvent[],
  initial?: ExecutionState,
): ExecutionState {
  const state: ExecutionState = initial
    ? (JSON.parse(JSON.stringify(initial)) as ExecutionState)
    : createInitialState('');

  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const seenIdempotencyKeys = new Set<string>();
  for (const ev of sorted) {
    if (ev.idempotencyKey !== undefined) {
      if (seenIdempotencyKeys.has(ev.idempotencyKey)) continue;
      seenIdempotencyKeys.add(ev.idempotencyKey);
    }
    applyEvent(state, ev);
  }
  return state;
}

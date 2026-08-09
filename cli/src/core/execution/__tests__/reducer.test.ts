import { createInitialState, reduceEvents } from '../reducer';
import { ExecutionEvent } from '../../../types/ExecutionRecord';

let seq = 0;
function ev(kind: ExecutionEvent['kind'], payload: Record<string, unknown>, idempotencyKey?: string): ExecutionEvent {
  seq += 1;
  return {
    seq,
    ts: `2026-08-09T00:00:${String(seq).padStart(2, '0')}.000Z`,
    by: 'tester',
    kind,
    payload,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  } as ExecutionEvent;
}

/** Deterministic LCG shuffle so permutations are reproducible. */
function shuffled<T>(input: readonly T[], seed: number): T[] {
  const arr = [...input];
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleEvents(): ExecutionEvent[] {
  seq = 0;
  return [
    ev('execution', { action: 'create' }, 'k-create'),
    ev('plan', { action: 'set', planVersion: 1, planPath: 'plan.json' }),
    ev('stage', { stageId: 'script', action: 'open', label: 'Script' }),
    ev('step', { stageId: 'script', stepId: 'draft', action: 'start', attempt: 1 }),
    ev('role', { role: 'document-author', action: 'assign', stageId: 'script' }),
    ev('context', { contextId: 'ctx-1', action: 'attach', path: 'contexts/ctx-1.md', hash: 'sha256:abc' }),
    ev('produce_run', { runId: 'run-1', status: 'submitted', taskId: 'task-9', attempt: 1 }),
    ev('artifact', { artifactId: 'art-0', action: 'register', path: 'output/a.mp4' }),
    ev('artifact', { artifactId: 'art-1', action: 'register', path: 'output/b.mp4', supersedes: 'art-0' }),
    ev('gate', { gateId: 'work-check', result: 'pass', stageId: 'script' }),
    ev('review', { action: 'approved', assetId: 'shot-01' }),
    ev('syncing', { action: 'mark', assetId: 'shot-01' }),
    ev('next_action', { actions: [{ kind: 'compile', assetId: 'shot-02' }] }),
    ev('plan_revision', { fromVersion: 1, toVersion: 2, planPath: 'plan.json', reopenedStages: ['script'] }),
    ev('execution', { action: 'start' }),
  ];
}

describe('execution reducer', () => {
  it('projects a deterministic state from an in-order log', () => {
    const state = reduceEvents(sampleEvents(), createInitialState('exec-1'));
    expect(state.executionId).toBe('exec-1');
    expect(state.status).toBe('running');
    expect(state.planVersion).toBe(2);
    expect(state.revisions).toEqual([{ fromVersion: 1, toVersion: 2, ts: expect.any(String) }]);
    // plan_revision reopened 'script' → stage back to open, its steps pending
    expect(state.stages.script.status).toBe('open');
    expect(state.stages.script.steps.draft.status).toBe('pending');
    expect(state.roles['document-author'].status).toBe('assigned');
    expect(state.contexts['ctx-1'].attached).toBe(true);
    expect(state.runs['run-1'].status).toBe('submitted');
    expect(state.artifacts['art-0'].supersededBy).toBe('art-1');
    expect(state.gates['work-check'].result).toBe('pass');
    expect(state.reviews).toHaveLength(1);
    expect(state.syncings).toHaveLength(1);
    expect(state.nextActions).toEqual([{ kind: 'compile', assetId: 'shot-02' }]);
    expect(state.lastSeq).toBe(15);
    expect(state.counts.plan).toBe(1);
    expect(state.counts.artifact).toBe(2);
  });

  it('yields an identical projection under out-of-order replay', () => {
    const events = sampleEvents();
    const baseline = reduceEvents(events, createInitialState('exec-1'));
    for (const seed of [1, 7, 42, 1337, 999983]) {
      const replayed = reduceEvents(shuffled(events, seed), createInitialState('exec-1'));
      expect(replayed).toEqual(baseline);
    }
    // reversed log as well
    expect(reduceEvents([...events].reverse(), createInitialState('exec-1'))).toEqual(baseline);
  });

  it('applies an idempotencyKey only once', () => {
    seq = 0;
    const events = [
      ev('execution', { action: 'start' }, 'dup-key'),
      ev('execution', { action: 'start' }, 'dup-key'),
    ];
    const state = reduceEvents(events, createInitialState('exec-1'));
    expect(state.counts.execution).toBe(1);
    expect(state.status).toBe('running');
  });

  it('is pure: input array, events, and initial state are not mutated', () => {
    const events = sampleEvents();
    const snapshot = JSON.stringify(events);
    const initial = createInitialState('exec-1');
    const initialSnapshot = JSON.stringify(initial);
    const out = reduceEvents(events, initial);
    expect(JSON.stringify(events)).toBe(snapshot);
    expect(JSON.stringify(initial)).toBe(initialSnapshot);
    // mutating the output must not leak into a re-reduction
    out.stages.script.status = 'completed';
    expect(reduceEvents(events, initial)).not.toEqual(out);
  });

  it('handles an empty log', () => {
    const state = reduceEvents([], createInitialState('exec-1'));
    expect(state.lastSeq).toBe(0);
    expect(state.status).toBe('planning');
    expect(state.counts).toEqual({});
  });
});

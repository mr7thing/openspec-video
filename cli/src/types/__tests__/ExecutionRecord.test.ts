import {
  ExecutionEventDraftSchema,
  ExecutionEventSchema,
  ExecutionPlanSchema,
  ExecutionStateSchema,
  SHORT_TEXT_MAX,
} from '../ExecutionRecord';

const BASE = { by: 'tester' };

describe('ExecutionRecord schema', () => {
  it('accepts a valid reference-only event of every kind', () => {
    const drafts = [
      { kind: 'execution', payload: { action: 'start' } },
      { kind: 'plan', payload: { action: 'set', planVersion: 1, planPath: 'plan.json' } },
      { kind: 'stage', payload: { stageId: 'script', action: 'start' } },
      { kind: 'step', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } },
      { kind: 'role', payload: { role: 'document-author', action: 'assign', stageId: 'script' } },
      { kind: 'context', payload: { contextId: 'ctx-1', action: 'attach', path: 'contexts/ctx-1.md', hash: 'sha256:abc' } },
      { kind: 'produce_run', payload: { runId: 'run-1', status: 'submitted', taskId: 'task-9', taskPath: '.opsv/tasks/task-9/rev.json', taskRevision: 'sha256:abc', taskDigest: 'sha256:def', attempt: 2 } },
      { kind: 'artifact', payload: { artifactId: 'art-1', action: 'register', path: 'output/shot-01.mp4', hash: 'sha256:def', producedBy: 'run-1' } },
      { kind: 'gate', payload: { gateId: 'work-check', result: 'pass', note: 'ok' } },
      { kind: 'review', payload: { action: 'approved', assetId: 'shot-01', outputRefs: ['output/shot-01.mp4'] } },
      { kind: 'syncing', payload: { action: 'mark', assetId: 'shot-01', refs: ['shots/shot-01.md'] } },
      { kind: 'next_action', payload: { actions: [{ kind: 'compile', assetId: 'shot-02' }] } },
      { kind: 'plan_revision', payload: { fromVersion: 1, toVersion: 2, planPath: 'plan.json', reopenedStages: ['script'] } },
    ];
    for (const draft of drafts) {
      const result = ExecutionEventDraftSchema.safeParse({ ...BASE, ...draft });
      expect(result.success).toBe(true);
    }
  });

  it('rejects document-body keys (content/body/text/markdown) at the schema layer', () => {
    const bodyCarrying = [
      { kind: 'review', payload: { action: 'approved', content: '# Full markdown body...' } },
      { kind: 'artifact', payload: { artifactId: 'a', action: 'register', path: 'p', body: 'doc body' } },
      { kind: 'context', payload: { contextId: 'c', action: 'attach', path: 'p', text: 'full text' } },
      { kind: 'plan', payload: { action: 'set', planVersion: 1, planPath: 'plan.json', markdown: '# plan' } },
    ];
    for (const draft of bodyCarrying) {
      const result = ExecutionEventDraftSchema.safeParse({ ...BASE, ...(draft as object) });
      expect(result.success).toBe(false);
    }
  });

  it('rejects unknown top-level keys on the event envelope', () => {
    const result = ExecutionEventDraftSchema.safeParse({
      ...BASE,
      kind: 'stage',
      payload: { stageId: 's', action: 'open' },
      document: 'should not be here',
    });
    expect(result.success).toBe(false);
  });

  it('caps free-text annotations so document bodies cannot smuggle through note fields', () => {
    const longNote = 'x'.repeat(SHORT_TEXT_MAX + 1);
    const result = ExecutionEventDraftSchema.safeParse({
      ...BASE,
      kind: 'gate',
      payload: { gateId: 'g', result: 'pass', note: longNote },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty idempotencyKey', () => {
    const result = ExecutionEventDraftSchema.safeParse({
      ...BASE,
      idempotencyKey: '',
      kind: 'execution',
      payload: { action: 'start' },
    });
    expect(result.success).toBe(false);
  });

  it('validates full events (seq/ts) and minimal plans', () => {
    const event = ExecutionEventSchema.safeParse({
      ...BASE,
      seq: 1,
      ts: '2026-08-09T00:00:00.000Z',
      kind: 'execution',
      payload: { action: 'create' },
    });
    expect(event.success).toBe(true);

    const plan = ExecutionPlanSchema.safeParse({
      version: 1,
      executionId: 'exec-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      stages: [{ id: 'script', steps: [{ id: 'draft', refs: ['assets/script.md'] }] }],
    });
    expect(plan.success).toBe(true);
    if (plan.success) expect(plan.data.stages[0].steps).toHaveLength(1);
  });

  it('validates the projected state shape', () => {
    const state = ExecutionStateSchema.safeParse({
      executionId: 'exec-1',
      status: 'running',
      planVersion: 1,
      planValidatedVersion: 1,
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
      lastSeq: 3,
      counts: { execution: 2, plan: 1 },
    });
    expect(state.success).toBe(true);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventStore } from '../EventStore';
import { createInitialState, reduceEvents } from '../reducer';
import {
  contextsDir,
  eventsPath,
  lockPath,
  planPath,
  receiptsDir,
  runtimeDir,
  seqSidecarPath,
  statePath,
} from '../paths';
import { OpsVErrorCode } from '../../../errors/OpsVError';
import {
  ExecutionEvent,
  ExecutionEventDraft,
  ExecutionEventSchema,
  ExecutionPlan,
  ExecutionStateSchema,
} from '../../../types/ExecutionRecord';

let tmpRoot: string;

function makePlan(executionId: string): ExecutionPlan {
  return {
    version: 1,
    executionId,
    createdAt: '2026-08-10T00:00:00.000Z',
    stages: [{ id: 'script', steps: [{ id: 'draft' }] }],
  };
}

function makeStore(executionId = 'exec-1'): EventStore {
  return new EventStore(tmpRoot, executionId);
}

async function initStore(executionId = 'exec-1'): Promise<EventStore> {
  const store = makeStore(executionId);
  await store.init(makePlan(executionId));
  return store;
}

function readJsonl(file: string): unknown[] {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-exec-store-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('EventStore layout', () => {
  it('init writes plan.json and the full directory layout', async () => {
    const store = await initStore();
    expect(fs.existsSync(planPath(tmpRoot, 'exec-1'))).toBe(true);
    expect(fs.existsSync(contextsDir(tmpRoot, 'exec-1'))).toBe(true);
    expect(fs.existsSync(receiptsDir(tmpRoot, 'exec-1'))).toBe(true);
    // lock + seq sidecar live in the git-ignored runtime tree, not the record
    expect(runtimeDir(tmpRoot, 'exec-1')).toContain(path.join('.opsv', 'runtime'));
    const plan = await store.readPlan();
    expect(plan?.executionId).toBe('exec-1');
    expect(await store.readState()).toBeNull();
  });

  it('refuses to initialize twice with a stable error code', async () => {
    const store = await initStore();
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'start' } });
    await expect(store.init(makePlan('exec-1'))).rejects.toMatchObject({
      code: OpsVErrorCode.EXECUTION_ALREADY_INITIALIZED,
    });
  });

  it('rejects path-traversal execution ids', () => {
    expect(() => new EventStore(tmpRoot, '../evil')).toThrow();
    expect(() => new EventStore(tmpRoot, 'a/b')).toThrow();
  });

  it('rejects an invalid plan with E6001', async () => {
    const store = makeStore();
    await expect(store.init({ version: 0 } as unknown as ExecutionPlan)).rejects.toMatchObject({
      code: OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
    });
  });
});

describe('EventStore append', () => {
  it('appends schema-valid events with monotonic seq starting at 1', async () => {
    const store = await initStore();
    const drafts: ExecutionEventDraft[] = [
      { kind: 'execution', by: 'tester', payload: { action: 'create' } },
      { kind: 'plan', by: 'tester', payload: { action: 'set', planVersion: 1, planPath: 'plan.json' } },
      { kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'start' } },
    ];
    const appended: ExecutionEvent[] = [];
    for (const draft of drafts) appended.push(await store.append(draft));

    expect(appended.map((ev) => ev.seq)).toEqual([1, 2, 3]);
    for (const ev of appended) expect(ev.ts).toBeTruthy();

    const lines = readJsonl(eventsPath(tmpRoot, 'exec-1'));
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(ExecutionEventSchema.safeParse(line).success).toBe(true);

    const reread = await store.readEvents();
    expect(reread.map((ev) => ev.seq)).toEqual([1, 2, 3]);
    expect((await store.readEvents(1)).map((ev) => ev.seq)).toEqual([2, 3]);
    expect(await store.readLastSeq()).toBe(3);
  });

  it('rejects an invalid draft with E6001 and appends nothing', async () => {
    const store = await initStore();
    await expect(
      store.append({ kind: 'stage', by: 'tester', payload: { stageId: 's' } } as unknown as ExecutionEventDraft),
    ).rejects.toMatchObject({ code: OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH });
    expect(await store.readLastSeq()).toBe(0);
  });

  it('rejects document-body payloads at the store boundary', async () => {
    const store = await initStore();
    await expect(
      store.append({
        kind: 'review',
        by: 'tester',
        payload: { action: 'approved', content: '# full markdown body' },
      } as unknown as ExecutionEventDraft),
    ).rejects.toMatchObject({ code: OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH });
  });
});

describe('EventStore idempotency', () => {
  it('same idempotencyKey + same kind returns the existing event without re-appending', async () => {
    const store = await initStore();
    const draft: ExecutionEventDraft = {
      kind: 'execution',
      by: 'tester',
      idempotencyKey: 'start-1',
      payload: { action: 'start' },
    };
    const first = await store.append(draft);
    const second = await store.append(draft);
    expect(second.seq).toBe(first.seq);
    expect(readJsonl(eventsPath(tmpRoot, 'exec-1'))).toHaveLength(1);
    expect(await store.readLastSeq()).toBe(1);
  });

  it('same idempotencyKey + different kind fails with a stable error code', async () => {
    const store = await initStore();
    await store.append({
      kind: 'execution',
      by: 'tester',
      idempotencyKey: 'dup',
      payload: { action: 'start' },
    });
    await expect(
      store.append({
        kind: 'stage',
        by: 'tester',
        idempotencyKey: 'dup',
        payload: { stageId: 's', action: 'open' },
      }),
    ).rejects.toMatchObject({ code: OpsVErrorCode.EXECUTION_IDEMPOTENCY_CONFLICT });
    expect(readJsonl(eventsPath(tmpRoot, 'exec-1'))).toHaveLength(1);
  });

  it('concurrent appends get unique, gap-free seqs under the lock', async () => {
    const store = await initStore();
    const n = 25;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        store.append({
          kind: 'step',
          by: 'tester',
          idempotencyKey: `step-${i}`,
          payload: { stageId: 'script', stepId: `s-${i}`, action: 'start' },
        }),
      ),
    );
    const seqs = results.map((ev) => ev.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(await store.readLastSeq()).toBe(n);
    expect(fs.readFileSync(seqSidecarPath(tmpRoot, 'exec-1'), 'utf-8').trim()).toBe(String(n));

    // the projection counts every event exactly once
    const state = await store.projectState();
    expect(state.counts.step).toBe(n);
    expect(state.lastSeq).toBe(n);
  });
});

describe('EventStore recovery', () => {
  it('skips a torn tail line and continues seq from the last valid event', async () => {
    const store = await initStore();
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'create' } });
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'start' } });

    // simulate an interrupted append: partial JSON, no newline, sidecar stale
    fs.appendFileSync(eventsPath(tmpRoot, 'exec-1'), '{"seq":3,"kind":"sta');

    const third = await store.append({
      kind: 'stage',
      by: 'tester',
      payload: { stageId: 'script', action: 'open' },
    });
    expect(third.seq).toBe(3);
    const events = await store.readEvents();
    expect(events.map((ev) => ev.seq)).toEqual([1, 2, 3]);
    // torn fragment was dropped, not glued onto the new event
    const raw = fs.readFileSync(eventsPath(tmpRoot, 'exec-1'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).not.toContain('"kind":"sta{');
  });

  it('repairs a corrupt sidecar instead of trusting it', async () => {
    const store = await initStore();
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'create' } });
    fs.writeFileSync(seqSidecarPath(tmpRoot, 'exec-1'), 'not-a-number\n');
    const ev = await store.append({ kind: 'execution', by: 'tester', payload: { action: 'start' } });
    expect(ev.seq).toBe(2);
    expect(fs.readFileSync(seqSidecarPath(tmpRoot, 'exec-1'), 'utf-8').trim()).toBe('2');
  });

  it('does not honor a stale sidecar reservation ahead of the log (no seq holes)', async () => {
    const store = await initStore();
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'create' } });
    await store.append({ kind: 'execution', by: 'tester', payload: { action: 'start' } });
    fs.writeFileSync(seqSidecarPath(tmpRoot, 'exec-1'), '50\n');
    const ev = await store.append({
      kind: 'stage',
      by: 'tester',
      payload: { stageId: 'script', action: 'open' },
    });
    expect(ev.seq).toBe(3);
  });

  it('steals a lock left behind by a dead holder', async () => {
    const store = await initStore();
    fs.mkdirSync(path.dirname(lockPath(tmpRoot, 'exec-1')), { recursive: true });
    fs.writeFileSync(lockPath(tmpRoot, 'exec-1'), 'not-a-pid');
    const ev = await store.append({ kind: 'execution', by: 'tester', payload: { action: 'start' } });
    expect(ev.seq).toBe(1);
    // lock released after the critical section
    expect(fs.existsSync(lockPath(tmpRoot, 'exec-1'))).toBe(false);
  });
});

describe('EventStore projection', () => {
  it('state.json matches a re-reduction of the log, including shuffled replay', async () => {
    const store = await initStore();
    const drafts: ExecutionEventDraft[] = [
      { kind: 'execution', by: 'tester', payload: { action: 'create' } },
      { kind: 'plan', by: 'tester', payload: { action: 'set', planVersion: 1, planPath: 'plan.json' } },
      { kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'start', label: 'Script' } },
      { kind: 'step', by: 'tester', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } },
      { kind: 'artifact', by: 'tester', payload: { artifactId: 'art-1', action: 'register', path: 'output/a.mp4', hash: 'sha256:x' } },
      { kind: 'gate', by: 'tester', payload: { gateId: 'work-check', result: 'pass', stageId: 'script' } },
      { kind: 'next_action', by: 'tester', payload: { actions: [{ kind: 'compile', assetId: 'shot-01' }] } },
    ];
    for (const draft of drafts) await store.append(draft);

    const state = await store.projectState();
    expect(fs.existsSync(statePath(tmpRoot, 'exec-1'))).toBe(true);
    expect(ExecutionStateSchema.safeParse(JSON.parse(fs.readFileSync(statePath(tmpRoot, 'exec-1'), 'utf-8'))).success).toBe(true);

    const events = await store.readEvents();
    expect(state).toEqual(reduceEvents(events, createInitialState('exec-1')));
    const shuffledReplay = reduceEvents([...events].reverse(), createInitialState('exec-1'));
    expect(shuffledReplay).toEqual(state);

    const reread = await store.readState();
    expect(reread).toEqual(state);
  });
});

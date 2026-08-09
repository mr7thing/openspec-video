// ============================================================================
// opsv exec (B2) — command-level fixture tests.
//
// Proves the acceptance criteria:
//   1. create → start → events → status/next matches a hand-driven reducer.
//   2. Interrupt (deleted state.json / torn tail) → resume rebuilds state and
//      gives continuable actions or blocked-needs-confirmation; external side
//      effects are never replayed.
//   3. A failed step retry produces a NEW attempt (events carry `attempt`),
//      never overwriting history.
// Plus: fail-closed bootstrap wiring on `exec start` (C1) and standalone
// operation (fixtures never create .trellis/).
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerExecCommand } from '../exec';
import { writeBootstrap } from '../../core/Bootstrap';
import { EventStore } from '../../core/execution/EventStore';
import { createInitialState, reduceEvents } from '../../core/execution/reducer';
import { eventsPath, statePath } from '../../core/execution/paths';
import { ExecutionEvent } from '../../types/ExecutionRecord';

process.env.FORCE_COLOR = '0';

// ---------------------------------------------------------------------------
// Fixtures (a minimal Pack project; buildWorkPacket resolves `hero` to a
// production profile with no circle → nextAction kind 'circle')
// ---------------------------------------------------------------------------

const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: ready',
    'version: 1.0.0',
    'policy:',
    '  sync: human',
    'categories:',
    '  shot: categories/shot.yaml',
    'profiles:',
    '  i2v: profiles/i2v.yaml',
    'skills:',
    '  create-shot: skills/create-shot/skill.yaml',
    '',
  ].join('\n'),
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check]\n',
  'skills/create-shot/SKILL.md': '# Create Shot\n',
};

const HERO_DOC = [
  '---',
  'category: shot',
  'status: drafting',
  'prompt: A hero standing in the rain',
  'brief: hero shot',
  '---',
  '',
  'Hero body',
  '',
].join('\n');

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function writeBaseProject(root: string): void {
  writeFiles(root, {
    '.opsv/project.yaml': 'packs:\n  - id: ready\nbindings:\n  continuous-i2v: test.model\n',
    'videospec/shots/hero.md': HERO_DOC,
  });
  writeFiles(path.join(root, '.opsv', 'packs', 'ready'), PACK_FILES);
}

function makePlan(executionId = 'exec-1'): string {
  return JSON.stringify({
    version: 1,
    executionId,
    title: 'Demo execution',
    createdAt: '2026-08-10T00:00:00.000Z',
    stages: [
      { id: 'script', label: 'Script', steps: [{ id: 'draft', refs: ['hero'] }] },
      { id: 'shoot', dependsOn: ['script'], steps: [{ id: 'compile', refs: ['hero'] }, { id: 'upload', label: 'Upload outputs' }] },
    ],
  });
}

function readJsonl(file: string): ExecutionEvent[] {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ExecutionEvent);
}

// ---------------------------------------------------------------------------
// Command runner (process.exitCode based; stdout/stderr captured)
// ---------------------------------------------------------------------------

describe('opsv exec (B2)', () => {
  let root: string;
  let previousCwd: string;
  let logs: string[];
  let errors: string[];
  let spyLog: jest.SpyInstance;
  let spyErr: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-exec-cmd-'));
    previousCwd = process.cwd();
    process.chdir(root);
    logs = [];
    errors = [];
    spyLog = jest.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
    spyErr = jest.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')); });
    process.exitCode = 0;
  });

  afterEach(() => {
    spyLog.mockRestore();
    spyErr.mockRestore();
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  async function run(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerExecCommand(program);
    await program.parseAsync(['node', 'opsv', ...args]);
  }

  function stdoutJson(): any {
    return JSON.parse(logs.join('\n'));
  }

  async function createExecution(planContent = makePlan()): Promise<void> {
    writeFiles(root, { 'plan.demo.json': planContent });
    await run(['exec', 'create', '--plan', 'plan.demo.json', '--json']);
    expect(process.exitCode).toBe(0);
  }

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  it('create snapshots plan.json and appends execution/plan events', async () => {
    writeBaseProject(root);
    await createExecution();

    const report = stdoutJson();
    expect(report.ok).toBe(true);
    expect(report.executionId).toBe('exec-1');
    expect(report.state.status).toBe('planning');

    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events.map((ev) => ev.kind)).toEqual(['execution', 'plan']);
    expect(events.map((ev) => ev.seq)).toEqual([1, 2]);
    expect(events[0].payload).toEqual({ action: 'create' });
    expect(events[1].payload).toMatchObject({ action: 'set', planVersion: 1, planPath: 'plan.json', title: 'Demo execution' });

    const plan = JSON.parse(fs.readFileSync(path.join(root, '.opsv', 'execution', 'exec-1', 'plan.json'), 'utf-8'));
    expect(plan.executionId).toBe('exec-1');
    expect(plan.stages).toHaveLength(2);
  });

  it('create rejects an --id that mismatches plan.executionId', async () => {
    writeBaseProject(root);
    writeFiles(root, { 'plan.demo.json': makePlan() });
    await run(['exec', 'create', '--plan', 'plan.demo.json', '--id', 'other']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('does not match');
  });

  // -------------------------------------------------------------------------
  // start — fail-closed bootstrap wiring (C1)
  // -------------------------------------------------------------------------

  it('start refuses when the bootstrap is missing (fail-closed) and appends nothing', async () => {
    writeBaseProject(root);
    await createExecution();
    logs = [];

    await run(['exec', 'start']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('BOOTSTRAP_MISSING');
    // No start event leaked into the log.
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(2);
  });

  it('start appends the start event when the bootstrap is fresh; second start is idempotent', async () => {
    writeBaseProject(root);
    writeBootstrap(root); // fresh .opsv/bootstrap/manifest.json
    await createExecution();
    logs = [];

    await run(['exec', 'start', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.ok).toBe(true);
    expect(report.status).toBe('running');

    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events.map((ev) => ev.kind)).toEqual(['execution', 'plan', 'execution']);
    expect(events[2].payload).toEqual({ action: 'start' });

    logs = [];
    await run(['exec', 'start', '--json']);
    expect(process.exitCode).toBe(0);
    expect(stdoutJson().alreadyRunning).toBe(true);
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(3);
  });

  it('start refuses when the bootstrap went stale (graph.yaml drift)', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    // Drift a digest-covered input after bootstrapping.
    writeFiles(path.join(root, '.opsv', 'packs', 'ready'), { 'graph.yaml': 'workflow:\n  shot: []\n' });
    logs = [];

    await run(['exec', 'start', '--json']);
    expect(process.exitCode).toBe(1);
    const report = stdoutJson();
    expect(report.ok).toBe(false);
    expect(report.bootstrap.issues.some((issue: any) => issue.code === 'BOOTSTRAP_STALE')).toBe(true);
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // event — retry produces a NEW attempt, history preserved
  // -------------------------------------------------------------------------

  it('step retry auto-derives a new attempt; events carry attempt and never overwrite history', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    logs = [];

    const stepEvent = (action: string) =>
      run(['exec', 'event', 'step', '--payload', JSON.stringify({ stageId: 'script', stepId: 'draft', action }), '--json']);

    await stepEvent('start');
    expect(stdoutJson().event.payload.attempt).toBe(1);
    logs = [];
    await stepEvent('fail');
    expect(stdoutJson().event.payload.attempt).toBe(1); // attaches to the open attempt
    logs = [];
    await stepEvent('start'); // retry → NEW attempt
    expect(stdoutJson().event.payload.attempt).toBe(2);

    const events = readJsonl(eventsPath(root, 'exec-1'));
    const stepEvents = events.filter((ev) => ev.kind === 'step');
    // History preserved: fail(attempt 1) still present; retry is attempt 2.
    expect(stepEvents.map((ev) => [ev.payload.action, ev.payload.attempt])).toEqual([
      ['start', 1],
      ['fail', 1],
      ['start', 2],
    ]);
    for (const ev of stepEvents) expect(typeof ev.payload.attempt).toBe('number');

    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.stages.script.steps.draft).toEqual({ status: 'running', attempt: 2 });
  });

  // -------------------------------------------------------------------------
  // status / next — projection matches a hand-driven reducer (AC #1)
  // -------------------------------------------------------------------------

  it('status/next output matches reduceEvents over the log, with the ReadyActionSet from buildNextAction', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);

    // Several events appended through the store (adapter channel).
    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'start', label: 'Script' } });
    logs = [];

    await run(['exec', 'status', '--json']);
    expect(process.exitCode).toBe(0);
    const statusReport = stdoutJson();
    const events = await store.readEvents();
    const expected = reduceEvents(events, createInitialState('exec-1'));
    const { readyActions: statusReady, ...stateFromCli } = statusReport;
    expect(stateFromCli).toEqual(expected);

    // ReadyActionSet: script/draft is pending → hero's buildNextAction says
    // 'circle' (production profile, no circle). shoot waits on script (deps).
    expect(statusReady.ready).toEqual([
      { kind: 'circle', assetId: 'hero', stageId: 'script', stepId: 'draft', attempt: 1 },
    ]);
    expect(statusReady.blocked).toEqual([]);

    logs = [];
    await run(['exec', 'next', '--json']);
    expect(stdoutJson()).toEqual(statusReady);

    // Complete script → shoot's two independent steps both become ready.
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'complete' } });
    logs = [];
    await run(['exec', 'next', '--json']);
    const next = stdoutJson();
    expect(next.ready).toEqual([
      { kind: 'circle', assetId: 'hero', stageId: 'shoot', stepId: 'compile', attempt: 1 },
      { kind: 'step', stageId: 'shoot', stepId: 'upload', attempt: 1, reason: 'Upload outputs' },
    ]);
  });

  it('next surfaces unresolved assets as blocked without inventing judgement', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution(makePlan().replace('"refs":["hero"]', '"refs":["hero","ghost"]'));
    await run(['exec', 'start']);
    logs = [];

    await run(['exec', 'next', '--json']);
    const next = stdoutJson();
    expect(next.ready).toEqual([{ kind: 'circle', assetId: 'hero', stageId: 'script', stepId: 'draft', attempt: 1 }]);
    expect(next.blocked).toHaveLength(1);
    expect(next.blocked[0]).toMatchObject({ kind: 'asset_unresolved', assetId: 'ghost', stageId: 'script', stepId: 'draft' });
    expect(next.blocked[0].reason).toContain('Asset document not found');
  });

  // -------------------------------------------------------------------------
  // resume — interrupt recovery (AC #2)
  // -------------------------------------------------------------------------

  it('resume rebuilds a deleted state.json from events.jsonl and reports continuable actions', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'start' } });

    // Interrupt artifact: projection lost.
    fs.rmSync(statePath(root, 'exec-1'));
    logs = [];

    await run(['exec', 'resume', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.recovered).toMatchObject({ tornTailDropped: false, stateRebuilt: true, previousStateSeq: null });
    expect(report.confirmationRequired).toBe(false);

    // state.json rebuilt and identical to a hand-driven reduction.
    const events = await store.readEvents();
    const expected = reduceEvents(events, createInitialState('exec-1'));
    expect(JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'))).toEqual(expected);
    expect(report.readyActions.ready).toEqual([
      { kind: 'circle', assetId: 'hero', stageId: 'script', stepId: 'draft', attempt: 1 },
    ]);
  });

  it('resume after a torn tail drops the fragment, flags in-flight work for human confirmation, and replays nothing', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);

    // Step started but never closed, then a crash mid-append.
    await run(['exec', 'event', 'step', '--payload', JSON.stringify({ stageId: 'script', stepId: 'draft', action: 'start' })]);
    fs.appendFileSync(eventsPath(root, 'exec-1'), '{"seq":5,"kind":"sta');
    logs = [];

    await run(['exec', 'resume', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.recovered.tornTailDropped).toBe(true);
    expect(report.confirmationRequired).toBe(true);
    expect(report.readyActions.inFlight).toEqual([
      expect.objectContaining({ kind: 'step_in_flight', stageId: 'script', stepId: 'draft', attempt: 1 }),
    ]);
    // Nothing is continuable while the only step is in-flight: blocked.
    expect(report.readyActions.ready).toEqual([]);

    // No replay: the log holds exactly the committed events, torn bytes gone.
    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events).toHaveLength(4);
    expect(fs.readFileSync(eventsPath(root, 'exec-1'), 'utf-8').endsWith('\n')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // plan schema integrity (B3) — hard gate at write time
  // -------------------------------------------------------------------------

  it('create rejects plans with duplicate stage ids, unknown dependencies, or dependency cycles', async () => {
    writeBaseProject(root);

    const duplicate = JSON.parse(makePlan());
    duplicate.stages.push({ id: 'script', steps: [] });
    writeFiles(root, { 'plan.bad.json': JSON.stringify(duplicate) });
    await run(['exec', 'create', '--plan', 'plan.bad.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('Duplicate stage id');

    process.exitCode = 0;
    errors = [];
    const unknownDep = JSON.parse(makePlan());
    unknownDep.stages[0].dependsOn = ['ghost'];
    writeFiles(root, { 'plan.bad.json': JSON.stringify(unknownDep) });
    await run(['exec', 'create', '--plan', 'plan.bad.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('depends on unknown stage');

    process.exitCode = 0;
    errors = [];
    const cyclic = JSON.parse(makePlan());
    cyclic.stages[0].dependsOn = ['shoot']; // shoot already depends on script
    writeFiles(root, { 'plan.bad.json': JSON.stringify(cyclic) });
    await run(['exec', 'create', '--plan', 'plan.bad.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('cycle');
  });

  // -------------------------------------------------------------------------
  // validate (B3) — planning → validate → start
  // -------------------------------------------------------------------------

  it('validate records the validation event and sets planValidatedVersion', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    logs = [];

    await run(['exec', 'validate', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.ok).toBe(true);
    expect(report.planVersion).toBe(1);

    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events.map((ev) => ev.kind)).toEqual(['execution', 'plan', 'plan']);
    expect(events[2].payload).toMatchObject({ action: 'validate', planVersion: 1, planPath: 'plan.json' });

    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.planValidatedVersion).toBe(1);
  });

  it('validate is fail-closed on a stale bootstrap and appends nothing', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    writeFiles(path.join(root, '.opsv', 'packs', 'ready'), { 'graph.yaml': 'workflow:\n  shot: []\n' });
    logs = [];

    await run(['exec', 'validate', '--json']);
    expect(process.exitCode).toBe(1);
    const report = stdoutJson();
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue: any) => issue.code === 'BOOTSTRAP_STALE')).toBe(true);
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // complete / block (B3) — running → completed/blocked transitions
  // -------------------------------------------------------------------------

  it('complete refuses while stages are incomplete; succeeds once all stages completed; next hints complete_execution', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    logs = [];

    await run(['exec', 'complete']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('incomplete stage(s): script, shoot');

    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'complete' } });
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'shoot', stepId: 'compile', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'shoot', stepId: 'upload', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'shoot', action: 'complete' } });

    process.exitCode = 0;
    logs = [];
    await run(['exec', 'next', '--json']);
    expect(stdoutJson().ready).toEqual([
      { kind: 'complete_execution', reason: 'All plan stages are completed; run: opsv exec complete' },
    ]);

    logs = [];
    await run(['exec', 'complete', '--json']);
    expect(process.exitCode).toBe(0);
    expect(stdoutJson().status).toBe('completed');

    // A completed execution has no legal actions.
    logs = [];
    await run(['exec', 'next', '--json']);
    expect(stdoutJson().ready).toEqual([]);

    // Idempotent: a second complete appends nothing.
    logs = [];
    const before = readJsonl(eventsPath(root, 'exec-1')).length;
    await run(['exec', 'complete', '--json']);
    expect(stdoutJson().alreadyCompleted).toBe(true);
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(before);
  });

  it('block parks a running execution with a reason; blocking a completed one is an invalid transition', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    logs = [];

    await run(['exec', 'block', '--reason', 'waiting on music licensing', '--json']);
    expect(process.exitCode).toBe(0);
    expect(stdoutJson().status).toBe('blocked');

    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.status).toBe('blocked');

    // A blocked execution surfaces no ready actions.
    logs = [];
    await run(['exec', 'next', '--json']);
    expect(stdoutJson().ready).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // revise (B3) — plan-v1 → plan-v2 with impact analysis + reopened stages
  // -------------------------------------------------------------------------

  /** v2: structurally changes the script stage (step label). */
  function makePlanV2(executionId = 'exec-1'): string {
    const plan = JSON.parse(makePlan(executionId));
    plan.version = 2;
    plan.stages[0].steps[0].label = 'Draft v2';
    return JSON.stringify(plan);
  }

  it('revise appends plan_revision referencing v1, reopens affected stages, and never rewrites v1 history', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);

    // v1 execution history: script stage completed.
    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'complete' } });

    const planJsonBefore = fs.readFileSync(path.join(root, '.opsv', 'execution', 'exec-1', 'plan.json'), 'utf-8');
    const eventsBefore = readJsonl(eventsPath(root, 'exec-1'));

    writeFiles(root, { 'plan.v2.json': makePlanV2() });
    logs = [];
    await run(['exec', 'revise', '--plan', 'plan.v2.json', '--reason', 'scope change', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.ok).toBe(true);
    expect(report.fromVersion).toBe(1);
    expect(report.toVersion).toBe(2);
    expect(report.planPath).toBe('plan.v2.json');
    // Impact: script changed; shoot depends on script (plan v1 edges) → both
    // affected. Only script had recorded progress → only script reopens.
    expect(report.impact.affectedStages).toEqual(['script', 'shoot']);
    expect(report.impact.reopenedStages).toEqual(['script']);
    expect(report.impact.unresolved).toEqual([]);

    // The plan_revision event explicitly references the revised-from version.
    const events = readJsonl(eventsPath(root, 'exec-1'));
    const revision = events[events.length - 1];
    expect(revision.kind).toBe('plan_revision');
    expect(revision.payload).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      planPath: 'plan.v2.json',
      affectedStages: ['script', 'shoot'],
      reopenedStages: ['script'],
    });

    // v1 history is untouched: the log only grew by appending, plan.json is
    // byte-identical, and the v2 snapshot landed next to it.
    expect(events.slice(0, eventsBefore.length)).toEqual(eventsBefore);
    expect(fs.readFileSync(path.join(root, '.opsv', 'execution', 'exec-1', 'plan.json'), 'utf-8')).toBe(planJsonBefore);
    const v2 = JSON.parse(fs.readFileSync(path.join(root, '.opsv', 'execution', 'exec-1', 'plan.v2.json'), 'utf-8'));
    expect(v2.version).toBe(2);

    // Projection: plan advanced to v2, validation reset, script reopened.
    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.planVersion).toBe(2);
    expect(state.planValidatedVersion).toBeNull();
    expect(state.revisions).toEqual([{ fromVersion: 1, toVersion: 2, ts: expect.any(String) }]);
    expect(state.stages.script.status).toBe('open');
    expect(state.stages.script.steps.draft.status).toBe('pending');

    // status/next compute against the REVISED plan: script/draft is legal
    // again as a NEW attempt (2); shoot waits on the reopened script.
    logs = [];
    await run(['exec', 'next', '--json']);
    const next = stdoutJson();
    expect(next.ready).toEqual([{ kind: 'circle', assetId: 'hero', stageId: 'script', stepId: 'draft', attempt: 2 }]);
  });

  it('revise requires version current+1 and refuses a closed (completed) execution', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    logs = [];

    const v3 = JSON.parse(makePlanV2());
    v3.version = 3;
    writeFiles(root, { 'plan.v3.json': JSON.stringify(v3) });
    await run(['exec', 'revise', '--plan', 'plan.v3.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('version must be 2');

    // Complete the execution, then revising the closed record is refused.
    const store = new EventStore(root, 'exec-1');
    for (const [stageId, stepId] of [['script', 'draft'], ['shoot', 'compile'], ['shoot', 'upload']] as const) {
      await store.append({ kind: 'step', by: 'tester', payload: { stageId, stepId, action: 'complete', attempt: 1 } });
      await store.append({ kind: 'stage', by: 'tester', payload: { stageId, action: 'complete' } });
    }
    process.exitCode = 0;
    errors = [];
    await run(['exec', 'complete']);
    expect(process.exitCode).toBe(0);

    writeFiles(root, { 'plan.v2.json': makePlanV2() });
    await run(['exec', 'revise', '--plan', 'plan.v2.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('closed');
  });

  it('revise resumes a blocked execution when the revision reopens stages', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);
    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'step', by: 'tester', payload: { stageId: 'script', stepId: 'draft', action: 'complete', attempt: 1 } });
    await store.append({ kind: 'stage', by: 'tester', payload: { stageId: 'script', action: 'complete' } });
    await run(['exec', 'block', '--reason', 'direction changed']);
    writeFiles(root, { 'plan.v2.json': makePlanV2() });
    logs = [];

    await run(['exec', 'revise', '--plan', 'plan.v2.json', '--json']);
    expect(process.exitCode).toBe(0);
    expect(stdoutJson().impact.reopenedStages).toEqual(['script']);

    // Projection semantics: revision with reopened stages → blocked → running.
    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.status).toBe('running');
  });

  it('revise propagates impact through the Pack Workflow Graph (not only plan edges)', async () => {
    writeBaseProject(root);
    // The Pack declares the domain transfer rule: shoot follows script.
    writeFiles(path.join(root, '.opsv', 'packs', 'ready'), { 'graph.yaml': 'workflow:\n  script: []\n  shoot: [script]\n' });
    writeBootstrap(root);

    // The plan itself declares NO dependency between script and shoot.
    const plan = JSON.parse(makePlan());
    delete plan.stages[1].dependsOn;
    plan.stages[0].steps[0] = { id: 'draft', label: 'Draft' }; // no refs: keeps next trivial
    plan.stages[1].steps = [{ id: 'assemble', label: 'Assemble' }];
    writeFiles(root, { 'plan.demo.json': JSON.stringify(plan) });
    await run(['exec', 'create', '--plan', 'plan.demo.json', '--json']);
    expect(process.exitCode).toBe(0);
    await run(['exec', 'start']);

    const v2 = JSON.parse(JSON.stringify(plan));
    v2.version = 2;
    v2.stages[0].steps[0].label = 'Draft v2';
    writeFiles(root, { 'plan.v2.json': JSON.stringify(v2) });
    logs = [];

    await run(['exec', 'revise', '--plan', 'plan.v2.json', '--json']);
    expect(process.exitCode).toBe(0);
    // shoot is affected via the Pack graph edge shoot → script, even though
    // the plan never declared that dependency.
    expect(stdoutJson().impact.affectedStages).toEqual(['script', 'shoot']);
  });

  it('revise blocks on unresolvable impact scope unless a human confirms (--allow-unresolved)', async () => {
    writeBaseProject(root);
    // NO bootstrap manifest: Pack-side propagation rules are unreadable.
    await createExecution();
    writeFiles(root, { 'plan.v2.json': makePlanV2() });
    logs = [];

    await run(['exec', 'revise', '--plan', 'plan.v2.json']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('cannot be resolved from declared rules: bootstrap');
    // Nothing appended while blocked.
    expect(readJsonl(eventsPath(root, 'exec-1'))).toHaveLength(2);
    expect(fs.existsSync(path.join(root, '.opsv', 'execution', 'exec-1', 'plan.v2.json'))).toBe(false);

    // Human confirmation proceeds AND records the confirmed scope.
    process.exitCode = 0;
    logs = [];
    await run(['exec', 'revise', '--plan', 'plan.v2.json', '--allow-unresolved', '--json']);
    expect(process.exitCode).toBe(0);
    const report = stdoutJson();
    expect(report.impact.unresolved).toEqual(['bootstrap']);
    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events[events.length - 1].payload).toMatchObject({ fromVersion: 1, toVersion: 2, unresolved: ['bootstrap'] });
  });

  it('the short-range review/syncing loop never produces plan_revision events', async () => {
    writeBaseProject(root);
    writeBootstrap(root);
    await createExecution();
    await run(['exec', 'start']);

    // Short-range loop facts (iterate + review + syncing), appended through
    // the same store an adapter would use.
    const store = new EventStore(root, 'exec-1');
    await store.append({ kind: 'review', by: 'tester', payload: { action: 'approved', assetId: 'hero' } });
    await store.append({ kind: 'syncing', by: 'tester', payload: { action: 'mark', assetId: 'hero' } });
    await store.append({ kind: 'syncing', by: 'tester', payload: { action: 'confirm', assetId: 'hero' } });

    const events = readJsonl(eventsPath(root, 'exec-1'));
    expect(events.some((ev) => ev.kind === 'plan_revision')).toBe(false);
    const state = JSON.parse(fs.readFileSync(statePath(root, 'exec-1'), 'utf-8'));
    expect(state.counts.plan_revision ?? 0).toBe(0);
    expect(state.revisions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // execution resolution
  // -------------------------------------------------------------------------

  it('status without --id fails when multiple executions exist', async () => {
    writeBaseProject(root);
    await createExecution(makePlan('exec-a'));
    logs = [];
    await createExecution(makePlan('exec-b'));
    logs = [];

    await run(['exec', 'status']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('Multiple executions');

    process.exitCode = 0;
    await run(['exec', 'status', '--id', 'exec-b', '--json']);
    expect(process.exitCode).toBe(0);
    expect(stdoutJson().executionId).toBe('exec-b');
  });

  it('status fails with EXECUTION_NOT_FOUND when no execution exists', async () => {
    writeBaseProject(root);
    await run(['exec', 'status']);
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('No execution found');
  });

  it('runs standalone: fixtures never create .trellis/', () => {
    expect(fs.existsSync(path.join(root, '.trellis'))).toBe(false);
  });
});

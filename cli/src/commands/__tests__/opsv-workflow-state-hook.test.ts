// ============================================================================
// opsv-inject-workflow-state.py (A3) contract tests.
// Runs the real hook template as a subprocess against .trellis-free fixture
// projects, with a shim `opsv` CLI serving real Core output (buildWorkContext
// / buildWorkPacket) so the hook's rendering is tested against the same JSON
// the installed CLI would produce.
// Contract under test: exit 0 on every path; visibility via the
// <opsv-workflow-state> block (additionalContext), never via exit codes.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import { buildWorkContext } from '../../core/WorkContext';
import { buildWorkPacket } from '../../core/WorkPacket';
import { EventStore } from '../../core/execution/EventStore';
import { computeReadyActions, persistReadyActions, readyActionsPath, ReadyActionSet } from '../exec';
import { ExecutionPlan } from '../../types/ExecutionRecord';

const HOOK_SCRIPT = path.join(__dirname, '..', '..', '..', 'templates', 'hooks', 'opsv-inject-workflow-state.py');
const PYTHON = execSync('command -v python3', { encoding: 'utf8' }).trim();

// One pack with a workflow category (doc/author, draft skill) and a
// production category (shot/i2v, compile skill) — mirrors the manual fixture.
const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: fx',
    'version: 1',
    'categories:',
    '  doc: categories/doc.yaml',
    '  shot: categories/shot.yaml',
    'profiles:',
    '  author: profiles/author.yaml',
    '  i2v: profiles/i2v.yaml',
    'skills:',
    '  write-doc: skills/write-doc/skill.yaml',
    '  create-shot: skills/create-shot/skill.yaml',
    '',
  ].join('\n'),
  'categories/doc.yaml': 'default_profile: author\nprofiles: [author]\n',
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/author.yaml': 'kind: workflow\nskill: write-doc\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/write-doc/skill.yaml': 'action: draft\ncategory: doc\nprofile: author\ncompletion: doc-drafted\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check]\n',
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

/** Fixture project root (deliberately no .trellis/ — standalone is the contract). */
function seedProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-hook-'));
  writeFiles(path.join(root, '.opsv', 'packs', 'fx'), PACK_FILES);
  fs.mkdirSync(path.join(root, 'videospec', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'videospec', 'shots'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: fx\nbindings:\n  continuous-i2v: test.model\n');
  fs.writeFileSync(path.join(root, 'videospec', 'docs', 'hero.md'), '---\nid: hero\ncategory: doc\nstatus: drafting\n---\n');
  fs.writeFileSync(path.join(root, 'videospec', 'shots', 'shot1.md'), '---\nid: shot1\ncategory: shot\nstatus: drafting\n---\n');
  fs.writeFileSync(
    path.join(root, 'videospec', 'shots', 'needref.md'),
    '---\nid: needref\ncategory: shot\nstatus: drafting\nrefs:\n  image:\n    "@ghost": [x]\n---\n',
  );
  return root;
}

/** Shim bin dir whose `opsv` serves canned JSON files via OPSV_SHIM_DIR. */
function makeShim(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-shim-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  const script = [
    '#!/bin/sh',
    'case "$1 $2" in',
    '  "work context") cat "$OPSV_SHIM_DIR/context.json" ;;',
    '  "work next") cat "$OPSV_SHIM_DIR/next.json" ;;',
    '  *) exit 1 ;;',
    'esac',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'opsv'), script, { mode: 0o755 });
  return dir;
}

const cleanupDirs: string[] = [];
function track<T extends string>(dir: T): T {
  cleanupDirs.push(dir);
  return dir;
}

interface HookResult {
  stdout: string;
  block: string;
}

function runHook(root: string, shimDir: string | null, extraEnv: Record<string, string> = {}): HookResult {
  const env: Record<string, string> = { ...process.env, ...extraEnv } as Record<string, string>;
  delete env.OPSV_CLI;
  delete env.OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS;
  if (shimDir) {
    env.PATH = `${shimDir}:${process.env.PATH}`;
    env.OPSV_SHIM_DIR = shimDir;
  } else {
    // An empty dir: `opsv` is unresolvable even though python runs by absolute path.
    const empty = track(fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-nopath-')));
    env.PATH = empty;
  }
  // execFileSync throws on non-zero exit — reaching the return proves exit 0.
  const stdout = execFileSync(PYTHON, [HOOK_SCRIPT], {
    input: JSON.stringify({ cwd: root }),
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
  const parsed = JSON.parse(stdout);
  expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  return { stdout, block: parsed.hookSpecificOutput.additionalContext };
}

describe('opsv-inject-workflow-state.py (A3)', () => {
  afterEach(() => {
    while (cleanupDirs.length) fs.rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  });

  it('drafting workflow asset pinned via active-asset: block shows draft, exit 0', () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('<opsv-workflow-state>');
    expect(block).toContain('Asset: hero (status: drafting)');
    expect(block).toContain('NextAction: draft');
    expect(block).toContain('write-doc');
  });

  it('missing ref: block shows blocked + REF_* issue codes, exit 0', () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'needref\n');
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'needref', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Asset: needref');
    expect(block).toContain('NextAction: blocked');
    expect(block).toMatch(/Issues: .*REF_MISSING/);
  });

  it('no active-asset file: falls back to the first production asset of `work next`', () => {
    const root = track(seedProject());
    const groups = {
      blocked: [JSON.parse(JSON.stringify(buildWorkPacket(root, 'needref')))],
      production: [JSON.parse(JSON.stringify(buildWorkPacket(root, 'shot1')))],
      workflow: [JSON.parse(JSON.stringify(buildWorkPacket(root, 'hero')))],
    };
    const shim = track(makeShim({
      'next.json': JSON.stringify(groups),
      'context.json': JSON.stringify(buildWorkContext(root, 'shot1', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Asset: shot1 (status: drafting)');
    expect(block).toContain('NextAction: circle');
    expect(block).toContain('Command: opsv circle create --dir videospec/shots');
  });

  it('no active asset anywhere: visible "Refer to `opsv work next`" line, exit 0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-empty-'));
    track(root);
    fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs: []\n');
    const shim = track(makeShim({ 'next.json': '{"blocked": [], "production": [], "workflow": []}' }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Refer to `opsv work next`');
  });

  it('opsv CLI missing from PATH: visible state-unknown line, exit 0', () => {
    const root = track(seedProject());

    const { block } = runHook(root, null);

    expect(block).toContain('state unknown');
    expect(block).toContain('opsv work check');
  });

  it('CLI timeout: visible state-unknown line, exit 0', () => {
    const root = track(seedProject());
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-slow-'));
    track(shim);
    fs.writeFileSync(path.join(shim, 'opsv'), '#!/bin/sh\nsleep 10\n', { mode: 0o755 });

    const { block } = runHook(root, shim, { OPSV_WORKFLOW_STATE_CLI_TIMEOUT_MS: '300' });

    expect(block).toContain('state unknown');
    expect(block).toContain('opsv work check');
  });

  it('not an OPSV project (no .opsv/project.yaml): silent, empty stdout, exit 0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-wfs-foreign-'));
    track(root);
    const shim = track(makeShim({}));

    const stdout = execFileSync(PYTHON, [HOOK_SCRIPT], {
      input: JSON.stringify({ cwd: root }),
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 30000,
    });

    expect(stdout).toBe('');
  });

  it('malformed stdin payload never breaks the hook (exit 0)', () => {
    const shim = track(makeShim({}));

    execFileSync(PYTHON, [HOOK_SCRIPT], {
      input: 'not json at all',
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, OPSV_SHIM_DIR: shim },
      encoding: 'utf8',
      timeout: 30000,
    });
  });

  it('standalone: output is identical whether or not a .trellis dir is present', () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const before = runHook(root, shim).stdout;
    fs.mkdirSync(path.join(root, '.trellis'), { recursive: true });
    fs.writeFileSync(path.join(root, '.trellis', 'workflow.md'), '# workflow\n');
    const after = runHook(root, shim).stdout;

    expect(after).toBe(before);
  });
});

// ============================================================================
// B4: execution projection source. The hook reads
// .opsv/execution/<id>/ready-actions.json (+ state.json / events.jsonl
// cross-check) directly — no CLI call — when an active execution exists, and
// degrades VISIBLY to the disk path (with a Note line) on any projection
// problem. Fixtures persist the projection through the same code path as
// `opsv exec status` (computeReadyActions + persistReadyActions).
// ============================================================================

const EXEC_PLAN: ExecutionPlan = {
  version: 1,
  executionId: 'exec-demo',
  title: 'Demo',
  createdAt: '2026-08-10T00:00:00.000Z',
  stages: [
    { id: 'docs', label: 'Docs', steps: [{ id: 'write', refs: ['hero'] }] },
    { id: 'shots', label: 'Shots', dependsOn: ['docs'], steps: [{ id: 'render', refs: ['shot1'] }, { id: 'fix', refs: ['needref'] }] },
  ],
};

/** Create + start an execution and persist the ReadyActionSet projection
 *  exactly as `opsv exec status` does. */
async function seedExecution(root: string): Promise<ReadyActionSet> {
  const store = new EventStore(root, 'exec-demo');
  await store.init(EXEC_PLAN);
  await store.append({ kind: 'execution', by: 'test', payload: { action: 'create' } });
  await store.append({ kind: 'plan', by: 'test', payload: { action: 'set', planVersion: 1, planPath: 'plan.json', title: 'Demo' } });
  await store.append({ kind: 'execution', by: 'test', payload: { action: 'start' } });
  return reconcileProjection(root, store);
}

/** Replay what `opsv exec status/next` does: project + persist the sidecar. */
async function reconcileProjection(root: string, store: EventStore): Promise<ReadyActionSet> {
  const state = await store.projectState();
  const plan = (await store.readPlan())!;
  const set = computeReadyActions(root, plan, state);
  await persistReadyActions(root, state, set);
  return set;
}

describe('opsv-inject-workflow-state.py (B4: execution projection source)', () => {
  afterEach(() => {
    while (cleanupDirs.length) fs.rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  });

  it('active execution with fresh projection: Source: execution, matches exec next, no CLI call, ≤300ms', async () => {
    const root = track(seedProject());
    const set = await seedExecution(root);

    // Empty PATH: the opsv CLI is unresolvable — reaching a block here proves
    // the execution path makes no CLI call at all.
    const startedAt = performance.now();
    const { block } = runHook(root, null);
    const elapsedMs = performance.now() - startedAt;

    expect(set.ready).toEqual([{ kind: 'draft', assetId: 'hero', stageId: 'docs', stepId: 'write', attempt: 1 }]);
    expect(block).toContain('Source: execution');
    expect(block).toContain('Execution: exec-demo (status: running');
    expect(block).toContain('NextAction: draft');
    // Same ReadyActionSet lines as `opsv exec next` (formatAction mirror).
    expect(block).toContain('[ready] draft asset=hero stage=docs step=write attempt=1');
    // Difference annotated: the derived command/skill is not in the projection.
    expect(block).toMatch(/Note: derived command\/skill for 'draft' is not part of the execution projection/);
    expect(elapsedMs).toBeLessThan(300);
  });

  it('stale projection (event appended after the last status run): visible degradation + disk fallback', async () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    await seedExecution(root);
    // A new event advances events.jsonl beyond the persisted projection
    // (state.json is rebuilt by the appending command; ready-actions.json is
    // only refreshed by status/next → stale).
    const store = new EventStore(root, 'exec-demo');
    await store.append({ kind: 'stage', by: 'test', payload: { stageId: 'docs', action: 'start' } });
    await store.projectState();
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Source: disk');
    expect(block).toMatch(/Note: execution projection unavailable \(.*stale/);
    expect(block).toContain('NextAction: draft'); // disk-derived answer still shown
  });

  it('corrupt ready-actions.json: visible degradation + disk fallback', async () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    await seedExecution(root);
    fs.writeFileSync(readyActionsPath(root, 'exec-demo'), 'not json{');
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Source: disk');
    expect(block).toMatch(/Note: execution projection unavailable \(.*ready-actions\.json missing or corrupt/);
    expect(block).toContain('NextAction: draft');
  });

  it('terminal (completed) execution is not active: plain disk source, no degradation note', async () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    await seedExecution(root);
    const store = new EventStore(root, 'exec-demo');
    await store.append({ kind: 'execution', by: 'test', payload: { action: 'complete' } });
    await reconcileProjection(root, store); // a fresh `exec status` on the closed record
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Source: disk');
    expect(block).not.toContain('Note: execution projection unavailable');
    expect(block).toContain('NextAction: draft');
  });

  it('multiple executions: projection source ambiguous, visible degradation + disk fallback', async () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    await seedExecution(root);
    const other = new EventStore(root, 'exec-other');
    await other.init({ ...EXEC_PLAN, executionId: 'exec-other' });
    await other.append({ kind: 'execution', by: 'test', payload: { action: 'create' } });
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Source: disk');
    expect(block).toMatch(/Note: execution projection unavailable \(.*multiple executions/);
    expect(block).toContain('NextAction: draft');
  });

  it('no execution: disk path is annotated Source: disk', () => {
    const root = track(seedProject());
    fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');
    const shim = track(makeShim({
      'context.json': JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')),
    }));

    const { block } = runHook(root, shim);

    expect(block).toContain('Source: disk');
    expect(block).not.toContain('Source: execution');
    expect(block).toContain('NextAction: draft');
  });
});

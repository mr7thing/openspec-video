// ============================================================================
// opsv-inject-session-start.py (A4) contract tests.
// Covers: Pack stack injection (pack-lock preferred, `opsv pack list`
// fallback), active asset summary from `opsv work next --json`, bootstrap
// presence hint, `.opsv/runtime/active-asset` side effect, visible
// degradation on CLI failure/timeout, exit 0 on every path, and standalone
// operation in a .trellis-free project.
//
// The hook shells out to the `opsv` CLI; tests point the OPSV_CLI env
// override at a canned shim so the suite stays hermetic (no dist build).
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, ExecFileSyncOptions } from 'child_process';

const HOOK_SCRIPT = path.resolve(__dirname, '../../../templates/hooks/opsv-inject-session-start.py');

const PACK_LOCK = [
  'version: 2',
  'packs:',
  '  - id: test',
  '    version: 1.0.0',
  '    source: .opsv/packs/test',
  '    manifest_digest: aaa',
  '    content_digest: bbb',
  '    digest_algorithm: sha256',
  '    digest_version: 1',
  '    files: {}',
  '',
].join('\n');

const WORK_NEXT = {
  blocked: [
    {
      asset: 'target',
      issues: [{ code: 'REF_UNAVAILABLE', message: 'ref missing' }],
      nextAction: { kind: 'blocked', issueCodes: ['REF_UNAVAILABLE'] },
    },
  ],
  production: [
    {
      asset: 'hero',
      status: 'drafting',
      nextAction: { kind: 'compile', asset: 'hero', manifest: 'opsv-queue/assets_circle1/_manifest.json' },
      command: 'opsv run --manifest opsv-queue/assets_circle1/_manifest.json',
    },
    { asset: 'b-roll', status: 'approved', nextAction: { kind: 'sync', asset: 'b-roll' } },
  ],
  workflow: [],
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

interface RunResult {
  stdout: string;
  context: string;
}

function runHook(root: string, opts: { env?: Record<string, string>; input?: string } = {}): RunResult {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  // Ambient session vars must not leak into the hook under test.
  delete env.CLAUDE_PROJECT_DIR;
  delete env.OPSV_CLI;
  Object.assign(env, opts.env || {});
  const execOpts: ExecFileSyncOptions = {
    input: opts.input ?? JSON.stringify({ cwd: root, source: 'startup' }),
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    env,
  };
  // execFileSync throws on non-zero exit, so returning means exit 0.
  const stdout = execFileSync('python3', [HOOK_SCRIPT], execOpts) as unknown as string;
  const parsed = JSON.parse(stdout);
  return { stdout, context: parsed.hookSpecificOutput.additionalContext };
}

describe('opsv-inject-session-start.py (A4)', () => {
  let root: string;
  let shimDir: string;
  let shim: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-session-start-'));
    shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-fake-cli-'));
    shim = path.join(shimDir, 'opsv');
    // Deliberately no .trellis/ anywhere — standalone operation is the contract.
    writeFiles(root, { '.opsv/project.yaml': 'packs:\n  - id: test\n' });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(shimDir, { recursive: true, force: true });
  });

  function writeShim(script: string): void {
    fs.writeFileSync(shim, script, { mode: 0o755 });
  }

  function writeHealthyShim(): void {
    const workNextFile = path.join(shimDir, 'work-next.json');
    fs.writeFileSync(workNextFile, JSON.stringify(WORK_NEXT));
    writeShim(
      [
        '#!/bin/sh',
        'if [ "$1 $2" = "work next" ]; then cat "' + workNextFile + '"; exit 0; fi',
        'if [ "$1 $2" = "pack list" ]; then echo "test@1.0.0  .opsv/packs/test"; exit 0; fi',
        'echo "unexpected args: $@" >&2; exit 1',
        '',
      ].join('\n'),
    );
  }

  it('injects pack stack (from pack-lock), active assets, bootstrap hint; writes active-asset', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });
    writeHealthyShim();

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('<opsv-session-context>');
    // Pack id from the lock file.
    expect(context).toContain('- test@1.0.0');
    expect(context).toContain('source: .opsv/pack-lock.yaml');
    // Production asset listed with its next action kind.
    expect(context).toContain('- hero -> compile');
    expect(context).toContain('- b-roll -> sync');
    // Blocked asset visible with issue codes.
    expect(context).toContain('- target -> blocked [REF_UNAVAILABLE]');
    // Bootstrap missing -> visible non-blocking hint.
    expect(context).toContain('Bootstrap: .opsv/bootstrap/ not generated yet');
    // Side effect: first production asset id persisted for the breadcrumb hook.
    expect(fs.readFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'utf8').trim()).toBe('hero');
    expect(context).toContain('Active asset: hero');
  });

  it('falls back to `opsv pack list` when no pack-lock.yaml exists', () => {
    writeHealthyShim();

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('- test@1.0.0');
    expect(context).toContain('source: opsv pack list');
  });

  it('reports bootstrap as present when .opsv/bootstrap/ exists', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK, '.opsv/bootstrap/.keep': '' });
    writeHealthyShim();

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('Bootstrap: .opsv/bootstrap/ present.');
  });

  it('degrades visibly (not silently) when the opsv CLI is missing; still exit 0', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });

    const { context } = runHook(root, { env: { OPSV_CLI: path.join(shimDir, 'no-such-opsv') } });

    expect(context).toContain('Active assets: unknown (opsv work next failed:');
    expect(context).toContain('<opsv-session-context>');
    // No active asset file written when work next is unavailable.
    expect(fs.existsSync(path.join(root, '.opsv', 'runtime', 'active-asset'))).toBe(false);
  });

  it('degrades visibly when `opsv work next` exits non-zero', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });
    writeShim('#!/bin/sh\necho "boom" >&2\nexit 1\n');

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('Active assets: unknown (opsv work next failed: boom)');
    expect(context).toContain('Active asset: none');
  });

  it('times out a hung CLI within the latency budget and degrades visibly', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });
    writeShim('#!/bin/sh\nsleep 10\n');

    const started = Date.now();
    const { context } = runHook(root, { env: { OPSV_CLI: shim } });
    const elapsed = Date.now() - started;

    expect(context).toContain('timed out');
    // 2s CLI timeout + startup overhead must stay well under the 10s sleep.
    expect(elapsed).toBeLessThan(8000);
  }, 15000);

  it('exits 0 with a visible line when no OPSV project is found', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-nonproject-'));
    try {
      const { context } = runHook(outside);
      expect(context).toContain('No OPSV project found');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('survives malformed stdin and still emits the block', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });
    writeHealthyShim();

    const execOpts: ExecFileSyncOptions = {
      input: 'not json at all',
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, OPSV_CLI: shim, CLAUDE_PROJECT_DIR: root },
    };
    const stdout = execFileSync('python3', [HOOK_SCRIPT], execOpts) as unknown as string;
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('- test@1.0.0');
  });

  it('treats a failed active-asset write as non-fatal with a visible warning', () => {
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });
    writeHealthyShim();
    // `.opsv/runtime` exists as a *file* so makedirs fails.
    fs.writeFileSync(path.join(root, '.opsv', 'runtime'), 'occupied');

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('WARNING: could not write .opsv/runtime/active-asset');
    expect(context).toContain('- hero -> compile');
  });

  it('folds long group lists and keeps the block compact', () => {
    const many = {
      blocked: [],
      workflow: [],
      production: Array.from({ length: 8 }, (_, i) => ({
        asset: `asset-${i}`,
        nextAction: { kind: 'sync', asset: `asset-${i}` },
      })),
    };
    const workNextFile = path.join(shimDir, 'work-next.json');
    fs.writeFileSync(workNextFile, JSON.stringify(many));
    writeShim('#!/bin/sh\ncat "' + workNextFile + '"\n');
    writeFiles(root, { '.opsv/pack-lock.yaml': PACK_LOCK });

    const { context } = runHook(root, { env: { OPSV_CLI: shim } });

    expect(context).toContain('production (8):');
    expect(context).toContain('- asset-4 -> sync');
    expect(context).not.toContain('- asset-5 -> sync');
    expect(context).toContain('- ... and 3 more');
    // First production asset still persisted.
    expect(fs.readFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'utf8').trim()).toBe('asset-0');
  });

  it('hook source never references .trellis paths (standalone rule)', () => {
    const source = fs.readFileSync(HOOK_SCRIPT, 'utf8');
    expect(source).not.toMatch(/\.trellis\/\w/);
  });
});

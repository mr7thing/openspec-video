// ============================================================================
// opsv-inject-subagent-context.py (A5) contract tests.
// Drives the hook template as a subprocess with a stubbed `opsv` CLI
// (OPSV_CLI override) and asserts: action/asset detection, Context Manifest
// injection (Document Contract + Approved References + Pack guidance),
// byte-budget degradation to path lines, silent pass-through for unrelated
// calls, and fail-visible degradation that never blocks a dispatch.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const SCRIPT = path.join(__dirname, '..', '..', '..', 'templates', 'hooks', 'opsv-inject-subagent-context.py');

const MANIFEST = {
  contractVersion: 1,
  asset: 'hero',
  role: 'production-dispatcher',
  nextAction: { kind: 'compile', asset: 'hero', manifest: 'opsv-queue/c1/_manifest.json' },
  documentContract: {
    category: 'shot',
    path: '.opsv/packs/ctx/categories/shot.yaml',
    contract: { default_profile: 'i2v', profiles: ['i2v'] },
    profile: {
      name: 'i2v',
      kind: 'production',
      capability: 'continuous-i2v',
      model: 'test.model',
      contract: { outputs: ['video'] },
    },
  },
  promptContract: { refSyntax: ['@id — external Asset Document reference'], completion: 'task-compiled' },
  refs: [
    { key: 'bg', state: 'ready' },
    { key: 'ghost', state: 'missing', message: 'Referenced Asset Document is missing' },
  ],
  policy: { execute: 'human' },
  issues: [{ code: 'REF_MISSING', message: 'ghost: referenced Asset Document is missing' }],
  guidanceRefs: ['.opsv/packs/ctx/skills/create-shot/SKILL.md', '.opsv/packs/ctx/SKILL.md'],
};

function payload(prompt: string): unknown {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    cwd: process.cwd(),
    tool_input: { subagent_type: 'general-purpose', prompt },
  };
}

describe('opsv-inject-subagent-context hook (A5)', () => {
  let dir: string;
  let stubLog: string;
  let manifestFile: string;
  let stubCli: string;

  function runHook(input: unknown, rawStdin?: string): { stdout: string; argv: string } {
    const env = {
      ...process.env,
      OPSV_CLI: stubCli,
      OPSV_STUB_LOG: stubLog,
      OPSV_STUB_MANIFEST: manifestFile,
    };
    const stdout = execFileSync('python3', [SCRIPT], {
      input: rawStdin ?? JSON.stringify(input),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const argv = fs.existsSync(stubLog) ? fs.readFileSync(stubLog, 'utf8') : '';
    return { stdout, argv };
  }

  beforeEach(() => {
    // Deliberately no .trellis/ anywhere — standalone operation is the contract.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-subagent-hook-'));
    stubLog = path.join(dir, 'argv.log');
    manifestFile = path.join(dir, 'manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify(MANIFEST));
    stubCli = path.join(dir, 'opsv-stub');
    fs.writeFileSync(
      stubCli,
      [
        '#!/bin/sh',
        'printf \'%s\\n\' "$*" >> "$OPSV_STUB_LOG"',
        'role=""',
        'for a in "$@"; do',
        '  if [ "$a" = "ghost" ]; then echo "ASSET_UNKNOWN: ghost" >&2; exit 1; fi',
        '  if [ "$prev" = "--role" ]; then role="$a"; fi',
        '  prev="$a"',
        'done',
        'sed "s/\\"role\\": *\\"[a-z-]*\\"/\\"role\\": \\"$role\\"/" "$OPSV_STUB_MANIFEST"',
        '',
      ].join('\n'),
    );
    fs.chmodSync(stubCli, 0o755);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('injects documentContract, refs and guidance for an `opsv produce` dispatch', () => {
    const prompt = 'Spawn an agent to opsv produce the asset `hero` (videospec/shots/hero.md).';
    const { stdout, argv } = runHook(payload(prompt));

    const out = JSON.parse(stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    const updated = out.hookSpecificOutput.updatedInput;
    expect(updated.subagent_type).toBe('general-purpose'); // original input preserved
    const newPrompt: string = updated.prompt;

    // Append-only: the original prompt survives verbatim (Trellis coexistence).
    expect(newPrompt.startsWith(prompt)).toBe(true);
    expect(newPrompt).toContain('<!-- opsv-hook-injected -->');
    // Document Contract inlined.
    expect(newPrompt).toContain('## Document Contract');
    expect(newPrompt).toContain('"category": "shot"');
    expect(newPrompt).toContain('"default_profile": "i2v"');
    // Approved References: name + state only.
    expect(newPrompt).toContain('## Approved References');
    expect(newPrompt).toContain('- bg (ready)');
    expect(newPrompt).toContain('- ghost (missing)');
    // Pack guidance as path lines.
    expect(newPrompt).toContain('## Pack Guidance');
    expect(newPrompt).toContain('- .opsv/packs/ctx/skills/create-shot/SKILL.md');
    // Issues stay visible.
    expect(newPrompt).toContain('- REF_MISSING: ghost: referenced Asset Document is missing');

    // The hook materialized via the real command surface with the mapped role.
    expect(argv).toContain('work context hero --role production-dispatcher --json');
  });

  it('maps actions to roles and never matches the NextAction kind `compile`', () => {
    const cases: Array<[string, string]> = [
      ['run opsv run opsv-queue/c1 for asset hero', 'production-dispatcher'],
      ['approve the output: opsv approve asset hero', 'asset-quality-reviewer'],
      ['sync via opsv sync for asset hero', 'document-author'],
    ];
    for (const [prompt, role] of cases) {
      fs.rmSync(stubLog, { force: true });
      const { argv } = runHook(payload(prompt));
      expect(argv).toContain(`work context hero --role ${role} --json`);
    }
    // `compile` is a NextAction kind, not a CLI command: no asset ref => no call.
    fs.rmSync(stubLog, { force: true });
    const { stdout, argv } = runHook(payload('Next step: compile the hero asset.'));
    expect(stdout).toBe('');
    expect(argv).toBe('');
  });

  it('covers the document-author scenario via an explicit asset reference (no action)', () => {
    const prompt = 'Revise the copy in videospec/shots/hero.md and tighten the visual_brief.';
    const { stdout, argv } = runHook(payload(prompt));

    const out = JSON.parse(stdout);
    const newPrompt: string = out.hookSpecificOutput.updatedInput.prompt;
    expect(newPrompt).toContain('<opsv-subagent-context asset="hero" role="document-author">');
    expect(argv).toContain('work context hero --role document-author --json');
  });

  it('extracts the asset id from an external @ref (variant suffix stripped)', () => {
    fs.rmSync(stubLog, { force: true });
    const { argv } = runHook(payload('Run opsv produce with @hero:v2 as the lead shot.'));
    expect(argv).toContain('work context hero --role production-dispatcher --json');
  });

  it('degrades an over-budget Document Contract to a path line', () => {
    const big = {
      ...MANIFEST,
      documentContract: {
        ...MANIFEST.documentContract,
        contract: { default_profile: 'i2v', notes: 'x'.repeat(40000) },
      },
    };
    fs.writeFileSync(manifestFile, JSON.stringify(big));

    const { stdout } = runHook(payload('opsv produce asset hero'));
    const out = JSON.parse(stdout);
    const newPrompt: string = out.hookSpecificOutput.updatedInput.prompt;

    expect(newPrompt).not.toContain('x'.repeat(1000));
    expect(newPrompt).toMatch(/Document Contract not inlined \(4\d{4} bytes > 32768 byte budget\) — read: \.opsv\/packs\/ctx\/categories\/shot\.yaml/);
    // The rest of the manifest still lands.
    expect(newPrompt).toContain('## Approved References');
    expect(newPrompt).toContain('- bg (ready)');
    expect(Buffer.byteLength(newPrompt, 'utf8')).toBeLessThan(131072 + 4096);
  });

  it('passes unrelated dispatches through silently (zero output, no CLI call)', () => {
    const { stdout, argv } = runHook(payload('Summarize the repository layout.'));
    expect(stdout).toBe('');
    expect(argv).toBe('');
  });

  it('passes non-Task tools and malformed payloads through silently', () => {
    expect(runHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'opsv produce asset hero' } }).stdout).toBe('');
    expect(runHook({}, 'not json at all').stdout).toBe('');
    expect(runHook({}, '').stdout).toBe('');
  });

  it('degrades visibly when an OPSV action has no identifiable asset', () => {
    const { stdout, argv } = runHook(payload('After the circle completes, run opsv produce.'));
    const out = JSON.parse(stdout);
    expect(out.systemMessage).toMatch(/no asset reference found/);
    expect(out.hookSpecificOutput).toBeUndefined(); // original call untouched
    expect(argv).toBe('');
  });

  it('degrades visibly when the CLI fails, without blocking the dispatch', () => {
    const { stdout } = runHook(payload('opsv produce asset ghost (videospec/shots/ghost.md).'));
    const out = JSON.parse(stdout);
    expect(out.systemMessage).toMatch(/opsv work context ghost.*failed/);
    expect(out.systemMessage).toMatch(/ASSET_UNKNOWN/);
    expect(out.hookSpecificOutput).toBeUndefined();
  });

  it('degrades visibly when the opsv CLI is missing', () => {
    const env = { ...process.env, OPSV_CLI: path.join(dir, 'no-such-opsv') };
    const stdout = execFileSync('python3', [SCRIPT], {
      input: JSON.stringify(payload('opsv produce asset hero')),
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = JSON.parse(stdout);
    expect(out.systemMessage).toMatch(/`opsv` CLI not found/);
    expect(out.hookSpecificOutput).toBeUndefined();
  });

  it('keeps every path at exit 0 and never reads .trellis/', () => {
    // execFileSync throws on non-zero exit, so every case above already proves
    // exit 0. The template must not reference .trellis paths.
    const content = fs.readFileSync(SCRIPT, 'utf8');
    expect(content).not.toMatch(/\.trellis\/\w/);
  });
});

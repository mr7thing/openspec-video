// ============================================================================
// Hook / Dispatcher readiness contract (T11).
// Proves Core+Pack can act as a trustworthy control plane for future Hook
// adapters and the AgentRouter. These tests freeze what adapters may consume:
// typed pack validation, versioned Work Packet, structured NextAction, stable
// issue codes, pack content digest, effective policy, path canonicalization.
// Router tests must rely on structured fields only — never parse commands.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { checkPack } from '../PackChecker';
import { resolvePacks, loadProjectConfig } from '../ProjectConfig';
import { buildWorkPacket } from '../WorkPacket';
import { buildWorkContext } from '../WorkContext';
import { renderNextActionCommand, WORK_PACKET_CONTRACT_VERSION } from '../NextAction';
import { ManifestReader } from '../ManifestReader';
import { writeBootstrap } from '../Bootstrap';
import { EventStore } from '../execution/EventStore';
import { computeReadyActions, persistReadyActions } from '../../commands/exec';

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
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check, refs-valid, circle]\ncompletion: task-compiled\n',
  'skills/create-shot/SKILL.md': '# Create Shot\n',
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

describe('Hook/Dispatcher readiness contract', () => {
  let root: string;
  let pack: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-readiness-'));
    pack = path.join(root, '.opsv', 'packs', 'ready');
    writeFiles(pack, PACK_FILES);
    fs.mkdirSync(path.join(root, 'videospec', 'shots'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: ready\nbindings:\n  continuous-i2v: test.model\n');
    fs.writeFileSync(path.join(root, 'videospec', 'shots', 'hero.md'), '---\nid: hero\ncategory: shot\nstatus: drafting\n---\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('1: contract-invalid packs fail closed (checker errors, runtime decode rejects)', () => {
    fs.writeFileSync(path.join(pack, 'profiles', 'i2v.yaml'), 'kind: nonsense\n');
    const report = checkPack(pack);
    expect(report.ok).toBe(false);
    expect(report.issues.some(i => i.code === 'PACK_SCHEMA_INVALID')).toBe(true);
    expect(() => buildWorkPacket(root, 'hero')).toThrow(/Pack contract invalid/);
  });

  it('2: valid pack yields skill, gates, binding and structured next action', () => {
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.primarySkill?.name).toBe('create-shot');
    expect(packet.primarySkill?.gates.length).toBeGreaterThan(0);
    expect(packet.profile?.model).toBe('test.model');
    expect(packet.nextAction).toEqual({ kind: 'circle', asset: 'hero', sourceDir: 'videospec/shots' });
    expect(packet.pack?.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('3: behavior-file changes invalidate the content digest fingerprint', () => {
    const before = resolvePacks(root, loadProjectConfig(root))[0].contentDigest;
    fs.appendFileSync(path.join(pack, 'skills', 'create-shot', 'SKILL.md'), 'more rules\n');
    const after = resolvePacks(root, loadProjectConfig(root))[0].contentDigest;
    expect(after).not.toBe(before);
  });

  it('4: policy loosening attempts are blocked with a stable code', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: ready\nbindings:\n  continuous-i2v: test.model\npolicy:\n  sync: auto\n');
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROJECT_POLICY_LOOSENS_PACK' })]));
    expect(packet.policy.sync).toBe('human');
    expect(packet.nextAction?.kind).toBe('blocked');
  });

  it('5: unique circle compiles deterministically; multiple circles are ambiguous', () => {
    const writeCircle = (name: string) => {
      const dir = path.join(root, 'opsv-queue', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({ circle: name, assets: { hero: { status: 'pending', index: 0, category: 'shot' } } }));
    };
    writeCircle('shots_circle1');
    const unique = buildWorkPacket(root, 'hero');
    expect(unique.nextAction).toEqual({ kind: 'compile', asset: 'hero', manifest: 'opsv-queue/shots_circle1/_manifest.json' });

    writeCircle('shots_circle2');
    const ambiguous = buildWorkPacket(root, 'hero');
    expect(ambiguous.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CIRCLE_AMBIGUOUS' })]));
    expect(ambiguous.nextAction?.kind).toBe('blocked');
  });

  it('6: work packet is versioned and command is a derived display only', () => {
    const dir = path.join(root, 'opsv-queue', 'shots_circle1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({ circle: 'shots_circle1', assets: { hero: { status: 'pending', index: 0, category: 'shot' } } }));
    const packet = buildWorkPacket(root, 'hero');
    expect(packet.contractVersion).toBe(WORK_PACKET_CONTRACT_VERSION);
    expect(packet.command).toBe(renderNextActionCommand(packet.nextAction));
    expect(packet.action).toBe(packet.nextAction?.kind);
    // JSON surface adapters consume: structured, no parsing required.
    const json = JSON.parse(JSON.stringify(packet));
    expect(json.nextAction.kind).toBe('compile');
    expect(json.nextAction.manifest).toBe('opsv-queue/shots_circle1/_manifest.json');
  });

  it('7: rendered compile command resolves from the project root', () => {
    const dir = path.join(root, 'opsv-queue', 'shots_circle1');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({ circle: 'shots_circle1', assets: { hero: { status: 'pending', index: 0, category: 'shot' } } }));
    const packet = buildWorkPacket(root, 'hero');
    const manifestArg = packet.command!.match(/--manifest (\S+)/)![1];
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      const resolved = new ManifestReader().resolveForProduce(root, manifestArg);
      expect(fs.existsSync(resolved)).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('8: workflow-state hook block reports the same nextAction.kind as buildNextAction (A3 invariant)', async () => {
    // The hook renders Core-produced JSON (fed here through a shim opsv CLI);
    // the breadcrumb kind must equal buildNextAction's result for the asset.
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-readiness-shim-'));
    try {
      fs.writeFileSync(path.join(shim, 'context.json'), JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')));
      fs.writeFileSync(path.join(shim, 'opsv'), '#!/bin/sh\ncat "$OPSV_SHIM_DIR/context.json"\n', { mode: 0o755 });
      fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
      fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');

      const hook = path.join(__dirname, '..', '..', '..', 'templates', 'hooks', 'opsv-inject-workflow-state.py');
      const hookEnv = { ...process.env, PATH: `${shim}:${process.env.PATH}`, OPSV_SHIM_DIR: shim };
      const stdout = execFileSync('python3', [hook], {
        input: JSON.stringify({ cwd: root }),
        env: hookEnv,
        encoding: 'utf8',
        timeout: 30000,
      });
      const block = JSON.parse(stdout).hookSpecificOutput.additionalContext;
      const packet = buildWorkPacket(root, 'hero');
      expect(packet.nextAction?.kind).toBe('circle');
      expect(block).toContain('<opsv-workflow-state>');
      // Disk source (A3): annotated, and kind equal to buildNextAction.
      expect(block).toContain('Source: disk');
      expect(block).toContain(`NextAction: ${packet.nextAction?.kind}`);

      // Execution source (B4): with an active execution the same hook reads
      // the persisted ReadyActionSet. Asset-level kinds still come from
      // buildNextAction (via computeReadyActions), so the headline kind stays
      // equal; the one difference (derived command/skill not carried by the
      // projection) must be annotated, not silent.
      const store = new EventStore(root, 'exec-ready');
      await store.init({
        version: 1,
        executionId: 'exec-ready',
        createdAt: '2026-08-10T00:00:00.000Z',
        stages: [{ id: 'shoot', label: 'Shoot', steps: [{ id: 'compile', refs: ['hero'] }] }],
      });
      await store.append({ kind: 'execution', by: 'test', payload: { action: 'create' } });
      await store.append({ kind: 'execution', by: 'test', payload: { action: 'start' } });
      const state = await store.projectState();
      const set = computeReadyActions(root, (await store.readPlan())!, state);
      await persistReadyActions(root, state, set);
      expect(set.ready[0]?.kind).toBe(packet.nextAction?.kind);

      const execStdout = execFileSync('python3', [hook], {
        input: JSON.stringify({ cwd: root }),
        env: hookEnv,
        encoding: 'utf8',
        timeout: 30000,
      });
      const execBlock = JSON.parse(execStdout).hookSpecificOutput.additionalContext;
      expect(execBlock).toContain('Source: execution');
      expect(execBlock).toContain(`NextAction: ${packet.nextAction?.kind}`);
      expect(execBlock).toContain(`[ready] ${packet.nextAction?.kind} asset=hero stage=shoot step=compile attempt=1`);
      expect(execBlock).toMatch(/Note: derived command\/skill for 'circle' is not part of the execution projection/);
    } finally {
      fs.rmSync(shim, { recursive: true, force: true });
    }
  });

  /** Run the A5 PreToolUse hook against a shim opsv CLI that serves the given
   *  manifest, and return the rewritten sub-agent prompt. */
  function runA5Hook(shim: string, manifest: unknown, prompt: string): Record<string, any> {
    fs.writeFileSync(path.join(shim, 'context.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(shim, 'opsv'), '#!/bin/sh\ncat "$OPSV_SHIM_DIR/context.json"\n', { mode: 0o755 });
    const hook = path.join(__dirname, '..', '..', '..', 'templates', 'hooks', 'opsv-inject-subagent-context.py');
    const stdout = execFileSync('python3', [hook], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'opsv-production-dispatcher', description: 'produce hero', prompt },
        cwd: root,
      }),
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, OPSV_SHIM_DIR: shim },
      encoding: 'utf8',
      timeout: 30000,
    });
    return JSON.parse(stdout);
  }

  it('9: A5 sub-agent injection for `opsv produce` carries role production-dispatcher, nextAction, and the role template path (C4)', () => {
    writeBootstrap(root); // materialize .opsv/bootstrap/roles/*.md so roleTemplate lands in the manifest
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-readiness-shim-'));
    try {
      const manifest = buildWorkContext(root, 'hero', 'production-dispatcher');
      expect(manifest.roleTemplate?.path).toBe('.opsv/bootstrap/roles/production-dispatcher.md');
      const out = runA5Hook(shim, manifest, 'Advance production: run `opsv produce` for asset hero once the circle compiles.');
      expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
      const prompt = out.hookSpecificOutput.updatedInput.prompt as string;
      expect(prompt).toContain('<!-- opsv-hook-injected -->');
      expect(prompt).toContain('<opsv-subagent-context asset="hero" role="production-dispatcher">');
      // Explicit role + nextAction handoff for the host agent definition.
      expect(prompt).toContain('role: production-dispatcher');
      expect(prompt).toContain('Role: production-dispatcher');
      expect(prompt).toContain('NextAction: circle');
      // The injection block references the role template path (never copies it).
      expect(prompt).toContain('Role Context Template: .opsv/bootstrap/roles/production-dispatcher.md');
      // Append-only rewrite: the original dispatch prompt survives verbatim.
      expect(prompt.startsWith('Advance production: run `opsv produce` for asset hero once the circle compiles.')).toBe(true);
    } finally {
      fs.rmSync(shim, { recursive: true, force: true });
    }
  });

  it('10: A5 injection degrades visibly when the role template is not materialized (C4)', () => {
    // No writeBootstrap: the manifest has no roleTemplate, so the block must
    // say so in a visible line instead of silently omitting the reference.
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-readiness-shim-'));
    try {
      const manifest = buildWorkContext(root, 'hero', 'production-dispatcher');
      expect(manifest.roleTemplate).toBeUndefined();
      const out = runA5Hook(shim, manifest, 'run `opsv produce` for asset hero');
      const prompt = out.hookSpecificOutput.updatedInput.prompt as string;
      expect(prompt).toContain('Role: production-dispatcher');
      expect(prompt).toContain('Role Context Template: NOT MATERIALIZED');
      expect(prompt).toContain('.opsv/bootstrap/roles/production-dispatcher.md');
    } finally {
      fs.rmSync(shim, { recursive: true, force: true });
    }
  });

  it('11: contract-checker role template is read-only and carries no produce/run/approve write-directive examples (C4)', () => {
    writeBootstrap(root);
    const body = fs.readFileSync(path.join(root, '.opsv', 'bootstrap', 'roles', 'contract-checker.md'), 'utf8');
    expect(body).toContain('# Role Context: contract-checker');
    expect(body).toContain('read-only validation');
    // No write directives: no command examples, no write-verb section headers,
    // and no produce/run/approve tokens anywhere in this fixture render.
    expect(body).not.toMatch(/\bopsv\s+(produce|run|approve)\b/i);
    expect(body).not.toMatch(/^#{1,6}\s.*\b(produce|run|approve)\b/im);
    expect(body).not.toMatch(/\b(produce|run|approve)\b/i);
  });
});

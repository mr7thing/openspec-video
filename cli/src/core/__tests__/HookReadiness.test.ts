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

  it('8: workflow-state hook block reports the same nextAction.kind as buildNextAction (A3 invariant)', () => {
    // The hook renders Core-produced JSON (fed here through a shim opsv CLI);
    // the breadcrumb kind must equal buildNextAction's result for the asset.
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-readiness-shim-'));
    try {
      fs.writeFileSync(path.join(shim, 'context.json'), JSON.stringify(buildWorkContext(root, 'hero', 'production-dispatcher')));
      fs.writeFileSync(path.join(shim, 'opsv'), '#!/bin/sh\ncat "$OPSV_SHIM_DIR/context.json"\n', { mode: 0o755 });
      fs.mkdirSync(path.join(root, '.opsv', 'runtime'), { recursive: true });
      fs.writeFileSync(path.join(root, '.opsv', 'runtime', 'active-asset'), 'hero\n');

      const hook = path.join(__dirname, '..', '..', '..', 'templates', 'hooks', 'opsv-inject-workflow-state.py');
      const stdout = execFileSync('python3', [hook], {
        input: JSON.stringify({ cwd: root }),
        env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, OPSV_SHIM_DIR: shim },
        encoding: 'utf8',
        timeout: 30000,
      });
      const block = JSON.parse(stdout).hookSpecificOutput.additionalContext;
      const packet = buildWorkPacket(root, 'hero');
      expect(packet.nextAction?.kind).toBe('circle');
      expect(block).toContain('<opsv-workflow-state>');
      expect(block).toContain(`NextAction: ${packet.nextAction?.kind}`);
    } finally {
      fs.rmSync(shim, { recursive: true, force: true });
    }
  });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { computeBuildPlan } from '../graph/BuildPlan';

describe('Build Plan — opsv build core (Q2)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-build-'));
    fs.mkdirSync(path.join(root, 'videospec'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeDoc(subdir: string, id: string, category: string, refs: Record<string, string> = {}): void {
    const dir = path.join(root, 'videospec', subdir);
    fs.mkdirSync(dir, { recursive: true });
    const refsYaml = Object.entries(refs)
      .map(([k, v]) => `    "@${k}": ["${v}"]`)
      .join('\n');
    const refsBlock = Object.keys(refs).length
      ? `refs:\n  image:\n${refsYaml}\n`
      : '';
    fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\ncategory: ${category}\nstatus: drafting\n${refsBlock}---\n`);
  }

  function writeCircleManifest(circleName: string, assets: string[]): string {
    const dir = path.join(root, 'opsv-queue', circleName);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = path.join(dir, '_manifest.json');
    const assetsObj: Record<string, unknown> = {};
    for (const a of assets) assetsObj[a] = { status: 'pending' };
    fs.writeFileSync(manifest, JSON.stringify({ circle: circleName, assets: assetsObj }));
    return manifest;
  }

  it('computes the transitive affected set with dependency types', () => {
    writeDoc('characters', 'alice', 'character');
    writeDoc('shots', 'shot1', 'shot', { alice: 'a.png' });
    writeDoc('shots', 'shotsdeck', 'shotsdeck', { shot1: 's.png' });
    writeDoc('scenes', 'isolated', 'scene');

    const plan = computeBuildPlan(root, 'alice');
    expect(plan.changed).toBe('alice');
    expect(plan.affected.map((a) => a.asset).sort()).toEqual(['shot1', 'shotsdeck']);
    expect(plan.affected.find((a) => a.asset === 'shot1')?.depType).toBe('visual');
  });

  it('returns an empty affected set for an isolated change', () => {
    writeDoc('scenes', 'isolated', 'scene');
    writeDoc('characters', 'alice', 'character');
    const plan = computeBuildPlan(root, 'isolated');
    expect(plan.affected).toEqual([]);
  });

  it('classifies affected assets as production via a circle manifest', () => {
    writeDoc('characters', 'alice', 'character');
    writeDoc('shots', 'shot1', 'shot', { alice: 'a.png' });
    writeDoc('shots', 'shotsdeck', 'shotsdeck', { shot1: 's.png' });
    const manifest = writeCircleManifest('assets_circle1', ['shot1']);

    const plan = computeBuildPlan(root, 'alice', manifest);
    expect(plan.affected.find((a) => a.asset === 'shot1')?.kind).toBe('production');
    expect(plan.affected.find((a) => a.asset === 'shotsdeck')?.kind).toBe('workflow');
  });

  it('marks kind unknown when no manifest is available', () => {
    writeDoc('characters', 'alice', 'character');
    writeDoc('shots', 'shot1', 'shot', { alice: 'a.png' });
    const plan = computeBuildPlan(root, 'alice');
    expect(plan.affected[0].kind).toBe('unknown');
    expect(plan.unclassified).toBe(true);
  });
});

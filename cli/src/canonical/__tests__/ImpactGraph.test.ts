import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildImpactGraph,
  impactOf,
  classifyDependencyType,
} from '../graph/ImpactGraph';

describe('Typed Dependency Graph + Impact Analysis (Q1)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-impact-'));
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

  describe('classifyDependencyType', () => {
    it('maps categories to semantic dependency types', () => {
      expect(classifyDependencyType('character')).toBe('visual');
      expect(classifyDependencyType('scene')).toBe('environment');
      expect(classifyDependencyType('camera')).toBe('cinematography');
      expect(classifyDependencyType('audio')).toBe('audio');
      expect(classifyDependencyType('shot')).toBe('temporal');
      expect(classifyDependencyType('unknown')).toBe('dependency');
    });
  });

  describe('impactOf', () => {
    it('computes the transitive affected set for a changed asset', () => {
      writeDoc('characters', 'alice', 'character');
      writeDoc('shots', 'shot1', 'shot', { alice: 'x.png' });
      writeDoc('shots', 'shotsdeck', 'shotsdeck', { shot1: 'x.png' });
      writeDoc('scenes', 'isolated', 'scene');

      const graph = buildImpactGraph(root);
      const affected = impactOf(graph, 'alice');
      expect(affected.map((a) => a.asset).sort()).toEqual(['shot1', 'shotsdeck']);
      // shot1 depends on alice as a visual dependency.
      const shot1 = affected.find((a) => a.asset === 'shot1');
      expect(shot1?.depType).toBe('visual');
    });

    it('returns empty for an asset nobody depends on', () => {
      writeDoc('scenes', 'isolated', 'scene');
      writeDoc('characters', 'alice', 'character');
      const graph = buildImpactGraph(root);
      expect(impactOf(graph, 'isolated')).toEqual([]);
      expect(impactOf(graph, 'alice')).toEqual([]);
    });

    it('returns empty for an unknown asset id', () => {
      writeDoc('scenes', 'a', 'scene');
      const graph = buildImpactGraph(root);
      expect(impactOf(graph, 'missing')).toEqual([]);
    });

    it('types an edge from the dependency category, not the consumer', () => {
      writeDoc('characters', 'alice', 'character');
      writeDoc('scenes', 'temple', 'scene');
      writeDoc('shots', 'shot1', 'shot', { alice: 'a.png', temple: 't.png' });
      const graph = buildImpactGraph(root);
      const affected = impactOf(graph, 'alice');
      expect(affected.find((a) => a.asset === 'shot1')?.depType).toBe('visual');
    });
  });

  it('buildImpactGraph is a pure projection (writes no files)', () => {
    writeDoc('scenes', 'a', 'scene');
    const before = fs.readdirSync(root);
    buildImpactGraph(root);
    const after = fs.readdirSync(root);
    expect(after).toEqual(before);
  });
});

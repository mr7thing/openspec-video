import fs from 'fs';
import os from 'os';
import path from 'path';
import { DependencyGraph } from '../DependencyGraph';
import { materializeWorkflowDocument } from '../Materializer';
import { checkPack } from '../PackChecker';
import { resolveDocumentContract } from '../PackContracts';
import { buildWorkPacket } from '../WorkPacket';

describe('short-drama architecture flow', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-architecture-flow-'));
    const pack = path.resolve(__dirname, '../../../../packs/short-drama');
    fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
    fs.mkdirSync(path.join(root, 'videospec'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), `packs:\n  - id: short-drama\n    source: ${pack}\nbindings:\n  image-generation: image.model\n  video-generation: video.model\n  continuous-i2v: i2v.model\n`);
    fs.writeFileSync(path.join(root, 'videospec', 'plan.md'), '---\nid: act-one\ncategory: shotlist\nstatus: drafting\nplan:\n  - shot: arrival\n    clips: [door-open]\n---\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('materializes a Shotlist then schedules a Shot after its external Clip reference', () => {
    const plan = path.join(root, 'videospec', 'plan.md');
    const workflow = resolveDocumentContract(root, 'shotlist');
    const result = materializeWorkflowDocument(root, plan, workflow);
    expect(result.created).toHaveLength(2);

    const clip = path.join(root, 'videospec', 'clips', 'door-open.md');
    fs.writeFileSync(clip, '---\nid: door-open\ncategory: clip\nstatus: approved\n---\n## Approved References\n\n![main](door.png)\n');
    const shot = path.join(root, 'videospec', 'shots', 'arrival.md');
    fs.writeFileSync(shot, '---\nid: arrival\ncategory: shot\nstatus: drafting\nrefs:\n  image:\n    "@door-open": [door.png]\n---\n');
    const packet = buildWorkPacket(root, 'arrival');
    expect(packet.primarySkill?.name).toBe('create-shot');
    expect(packet.refs).toEqual(expect.arrayContaining([expect.objectContaining({ key: '@door-open', state: 'ready' })]));

    const graph = DependencyGraph.buildFromDir(root, ['videospec/clips', 'videospec/shots']);
    expect(graph.getCircles().map(circle => circle.assetIds)).toEqual([['door-open'], ['arrival']]);
  });

  it('passes the short-drama reference pack through the contract checker', () => {
    const report = checkPack(path.resolve(__dirname, '../../../../packs/short-drama'));
    expect(report.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('fails closed at the pack gate when a Profile references a non-exported Skill', () => {
    // Reproduce F3: runtime resolution used to degrade to empty gates. The
    // checker must flag the same pack that runtime resolution accepts.
    const pack = path.resolve(__dirname, '../../../../packs/short-drama');
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-broken-pack-'));
    fs.cpSync(pack, broken, { recursive: true });
    try {
      const profilePath = path.join(broken, 'profiles', 'shot-video.yaml');
      fs.writeFileSync(profilePath, fs.readFileSync(profilePath, 'utf8').replace('skill: create-shot', 'skill: ghost-skill'));
      const report = checkPack(broken);
      expect(report.ok).toBe(false);
      expect(report.issues.some(issue => issue.code === 'PACK_PROFILE_SKILL_MISSING')).toBe(true);
      // Runtime resolution still decodes through the shared schemas.
      expect(() => resolveDocumentContract(root, 'shotlist')).not.toThrow();
    } finally {
      fs.rmSync(broken, { recursive: true, force: true });
    }
  });
});

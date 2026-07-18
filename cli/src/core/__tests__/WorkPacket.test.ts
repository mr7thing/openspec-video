import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildWorkPacket } from '../WorkPacket';

describe('Work Packet', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-work-packet-'));
    const pack = path.join(root, '.opsv', 'packs', 'test');
    fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: test\nbindings:\n  image: test.model\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: test\nversion: 1\npolicy:\n  execute: human\ncategories:\n  image: categories/image.yaml\nprofiles:\n  image: profiles/image.yaml\nskills:\n  make: skills/make.yaml\n');
    fs.writeFileSync(path.join(pack, 'categories', 'image.yaml'), 'default_profile: image\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'image.yaml'), 'kind: production\ncapability: image\nskill: make\n');
    fs.writeFileSync(path.join(pack, 'skills', 'make.yaml'), 'gates: [work-check, refs-valid]\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('blocks a bare external reference with multiple approved variants', () => {
    fs.writeFileSync(path.join(root, 'videospec/assets', 'source.md'), '---\ncategory: image\nstatus: approved\n---\n## Approved References\n\n![one](one.png)\n![two](two.png)\n');
    fs.writeFileSync(path.join(root, 'videospec/assets', 'target.md'), '---\ncategory: image\nstatus: drafting\nrefs:\n  image:\n    "@source": [x]\n---\n');
    const packet = buildWorkPacket(root, 'target');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'REF_UNAVAILABLE' })]));
    expect(packet.primarySkill).toMatchObject({ name: 'make', gates: ['work-check', 'refs-valid'] });
    expect(packet.policy.execute).toBe('human');
  });

  it('applies Profile-specific required reference categories without imposing a global requirement', () => {
    const pack = path.join(root, '.opsv', 'packs', 'test');
    fs.writeFileSync(path.join(pack, 'profiles', 'image.yaml'), 'kind: production\ncapability: image\nskill: make\nrequired_ref_categories: [storyboard]\n');
    fs.writeFileSync(path.join(root, 'videospec/assets', 'source.md'), '---\ncategory: image\nstatus: approved\n---\n## Approved References\n\n![one](one.png)\n');
    fs.writeFileSync(path.join(root, 'videospec/assets', 'target.md'), '---\ncategory: image\nstatus: drafting\nrefs:\n  image:\n    "@source": [x]\n---\n');
    const packet = buildWorkPacket(root, 'target');
    expect(packet.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROFILE_REF_REQUIRED' })]));
  });
});

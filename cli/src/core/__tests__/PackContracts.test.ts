import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveDocumentContract } from '../PackContracts';

describe('Pack contracts', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pack-contract-'));
    const pack = path.join(root, '.opsv', 'packs', 'drama');
    fs.mkdirSync(path.join(pack, 'categories'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: drama\nbindings:\n  continuous-i2v: rh.director\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: drama\nversion: 1\ncategories:\n  shot: categories/shot.yaml\nprofiles:\n  i2v: profiles/i2v.yaml\n');
    fs.writeFileSync(path.join(pack, 'categories', 'shot.yaml'), 'default_profile: i2v\nprofiles: [i2v]\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'i2v.yaml'), 'kind: production\ncapability: continuous-i2v\nskill: create-shot\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('resolves a category default profile and project capability binding', () => {
    const resolved = resolveDocumentContract(root, 'shot');
    expect(resolved.profileName).toBe('i2v');
    expect(resolved.boundModel).toBe('rh.director');
  });

  it('resolves a Project-derived Profile through its declared Pack Profile', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: drama\nbindings:\n  preferred-i2v: rh.preferred\nprofiles:\n  hero-i2v:\n    extends: i2v\n    capability: preferred-i2v\n    defaults:\n      duration: 5\n');
    const resolved = resolveDocumentContract(root, 'shot', 'hero-i2v');
    expect(resolved).toMatchObject({ profileName: 'hero-i2v', boundModel: 'rh.preferred', defaults: { duration: 5 } });
  });
});

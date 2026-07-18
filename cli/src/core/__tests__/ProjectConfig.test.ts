import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { loadProjectConfig, resolvePacks, syncPackSkillShims, writePackLock } from '../ProjectConfig';

describe('ProjectConfig Pack Stack', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-project-config-'));
    fs.mkdirSync(path.join(root, '.opsv', 'packs', 'short-drama'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs:\n  - id: short-drama\n');
    fs.writeFileSync(path.join(root, '.opsv', 'packs', 'short-drama', 'pack.yaml'), 'id: short-drama\nversion: 1.0.0\n');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('resolves local Packs and writes a deterministic lock', () => {
    const packs = resolvePacks(root, loadProjectConfig(root));
    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.id).toBe('short-drama');

    const lockPath = writePackLock(root, packs);
    const lock = yaml.load(fs.readFileSync(lockPath, 'utf8')) as any;
    expect(lock.packs[0]).toMatchObject({ id: 'short-drama', version: '1.0.0' });
    expect(lock.packs[0].digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a manifest whose identity differs from the project declaration', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'packs', 'short-drama', 'pack.yaml'), 'id: other\nversion: 1.0.0\n');
    expect(() => resolvePacks(root)).toThrow('Pack id mismatch');
  });

  it('links platform discovery shims to canonical Pack Skills', () => {
    const pack = path.join(root, '.opsv', 'packs', 'short-drama');
    fs.mkdirSync(path.join(pack, 'skills', 'make'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'skills', 'make', 'skill.yaml'), 'action: compile\n');
    fs.writeFileSync(path.join(pack, 'skills', 'make', 'SKILL.md'), '# Make\n');
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: short-drama\nversion: 1.0.0\nskills:\n  make: skills/make/skill.yaml\n');
    const [target] = syncPackSkillShims(root, 'agents');
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toContain('# Make');
  });
});

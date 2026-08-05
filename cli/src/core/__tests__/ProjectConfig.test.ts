import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { loadProjectConfig, readPackLock, resolvePacks, syncPackSkillShims, writePackLock } from '../ProjectConfig';

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
    expect(lock.version).toBe(2);
    expect(lock.packs[0]).toMatchObject({ id: 'short-drama', version: '1.0.0', digest_algorithm: 'sha256', digest_version: 1 });
    expect(lock.packs[0].manifest_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(lock.packs[0].content_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(lock.packs[0].files['pack.yaml']).toMatch(/^[a-f0-9]{64}$/);

    // Deterministic: locking again produces byte-identical output.
    const first = fs.readFileSync(lockPath, 'utf8');
    writePackLock(root, resolvePacks(root, loadProjectConfig(root)));
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(first);
  });

  it('content digest changes when pack behavior files change (F4)', () => {
    const before = resolvePacks(root, loadProjectConfig(root))[0].contentDigest;
    const pack = path.join(root, '.opsv', 'packs', 'short-drama');
    fs.mkdirSync(path.join(pack, 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'pack.yaml'), 'id: short-drama\nversion: 1.0.0\nprofiles:\n  i2v: profiles/i2v.yaml\n');
    fs.writeFileSync(path.join(pack, 'profiles', 'i2v.yaml'), 'kind: production\noutputs: [video]\n');
    const after = resolvePacks(root, loadProjectConfig(root))[0].contentDigest;
    expect(after).not.toBe(before);
    fs.appendFileSync(path.join(pack, 'profiles', 'i2v.yaml'), '# touched\n');
    expect(resolvePacks(root, loadProjectConfig(root))[0].contentDigest).not.toBe(after);
  });

  it('recognizes legacy v1 locks and asks for a re-lock', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'pack-lock.yaml'), yaml.dump({ version: 1, packs: [{ id: 'short-drama', version: '1.0.0', source: '.opsv/packs/short-drama', digest: 'abc' }] }));
    const result = readPackLock(root);
    expect(result?.legacy).toBe(true);
    expect(result?.diagnostic?.code).toBe('PACK_LOCK_LEGACY');
    expect(result?.diagnostic?.message).toContain('opsv pack lock');
  });

  it('rejects a manifest whose identity differs from the project declaration', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'packs', 'short-drama', 'pack.yaml'), 'id: other\nversion: 1.0.0\n');
    expect(() => resolvePacks(root)).toThrow('Pack id mismatch');
  });

  it('rejects a Project policy that weakens delete: never', () => {
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'policy:\n  delete: auto\n');
    expect(() => loadProjectConfig(root)).toThrow('delete');
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

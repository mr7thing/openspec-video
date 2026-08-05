import fs from 'fs';
import os from 'os';
import path from 'path';
import { computePackContentDigest } from '../PackDigest';
import { PackManifestSchema } from '../../types/PackSchemas';
import yaml from 'js-yaml';

const PACK_YAML = [
  'id: demo',
  'version: 1.0.0',
  'categories:',
  '  shot: categories/shot.yaml',
  'profiles:',
  '  i2v: profiles/i2v.yaml',
  'skills:',
  '  create-shot: skills/create-shot/skill.yaml',
  '',
].join('\n');

const FILES: Record<string, string> = {
  'pack.yaml': PACK_YAML,
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check]\n',
  'skills/create-shot/SKILL.md': '# Create Shot\n\nDo the thing.\n',
  'scripts/check.js': 'console.log("v1");\n',
  'references/contract.md': '# Contract v1\n',
};

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function digest(root: string) {
  const manifest = PackManifestSchema.parse(yaml.load(fs.readFileSync(path.join(root, 'pack.yaml'), 'utf8')));
  return computePackContentDigest(root, manifest);
}

describe('computePackContentDigest', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-digest-'));
    writeFiles(root, FILES);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('covers manifests, SKILL.md, scripts and references', () => {
    const result = digest(root);
    expect(Object.keys(result.files).sort()).toEqual([
      'categories/shot.yaml',
      'pack.yaml',
      'profiles/i2v.yaml',
      'references/contract.md',
      'scripts/check.js',
      'skills/create-shot/SKILL.md',
      'skills/create-shot/skill.yaml',
    ]);
    expect(result.algorithm).toBe('sha256');
    expect(result.digestVersion).toBe(1);
    expect(result.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when an exported profile changes (F4)', () => {
    const before = digest(root).contentDigest;
    fs.appendFileSync(path.join(root, 'profiles/i2v.yaml'), '# comment\n');
    expect(digest(root).contentDigest).not.toBe(before);
  });

  it('changes when a SKILL.md changes', () => {
    const before = digest(root).contentDigest;
    fs.appendFileSync(path.join(root, 'skills/create-shot/SKILL.md'), 'more\n');
    expect(digest(root).contentDigest).not.toBe(before);
  });

  it('changes when an included script changes', () => {
    const before = digest(root).contentDigest;
    fs.writeFileSync(path.join(root, 'scripts/check.js'), 'console.log("v2");\n');
    expect(digest(root).contentDigest).not.toBe(before);
  });

  it('ignores .git, caches, test output and logs', () => {
    const before = digest(root).contentDigest;
    writeFiles(root, {
      '.git/HEAD': 'ref: refs/heads/main\n',
      'test/output.snap': 'snapshot\n',
      'tmp/scratch.txt': 'x\n',
      'debug.log': 'log\n',
      '.DS_Store': 'junk',
    });
    expect(digest(root).contentDigest).toBe(before);
  });

  it('is identical for identical content in a fresh directory with different creation order', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-digest-copy-'));
    try {
      const entries = Object.entries(FILES).reverse();
      writeFiles(other, Object.fromEntries(entries));
      expect(digest(other).contentDigest).toBe(digest(root).contentDigest);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('refuses to hash symlinks escaping the pack root', () => {
    const outside = path.join(os.tmpdir(), `opsv-outside-${process.pid}.js`);
    fs.writeFileSync(outside, 'console.log("evil");\n');
    try {
      fs.symlinkSync(outside, path.join(root, 'scripts', 'escape.js'));
      const result = digest(root);
      expect(result.files['scripts/escape.js']).toBeUndefined();
      expect(result.skipped).toContain('scripts/escape.js');
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('produces deterministic output across runs', () => {
    expect(digest(root).contentDigest).toBe(digest(root).contentDigest);
    expect(digest(root).files).toEqual(digest(root).files);
  });
});

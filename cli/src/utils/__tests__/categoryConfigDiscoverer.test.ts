// ============================================================================
// CategoryConfigDiscoverer Tests (v0.11.0)
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { CategoryConfigDiscoverer, matchesConfigPattern, classifyVariant } from '../categoryConfigDiscoverer';

describe('matchesConfigPattern', () => {
  const valid = [
    'category_validate.yaml',
    'category_validate.yml',
    '_category_validate.yaml',
    '_category_validate.yml',
    'k2-category_validate.yaml',
    'opsv-category_validate.yml',
  ];
  const invalid = [
    'categoryvalidation.yaml',
    'category.conf.yaml',
    'validate_category.yaml',
    'something_category_validate_other.yaml',
    'category_validate.txt',
    'categoryvalidate.yml',
  ];

  test.each(valid)('valid: %s', (name) => {
    expect(matchesConfigPattern(name)).toBe(true);
  });
  test.each(invalid)('invalid: %s', (name) => {
    expect(matchesConfigPattern(name)).toBe(false);
  });
});

describe('classifyVariant', () => {
  it('canonical: category_validate.yaml', () => {
    expect(classifyVariant('category_validate.yaml')).toBe('canonical');
  });
  it('underscore-prefix: _category_validate.yaml', () => {
    expect(classifyVariant('_category_validate.yaml')).toBe('underscore-prefix');
  });
  it('other: k2-category_validate.yaml', () => {
    expect(classifyVariant('k2-category_validate.yaml')).toBe('other');
  });
});

describe('CategoryConfigDiscoverer', () => {
  const tmpDir = path.join(os.tmpdir(), `opsv-discover-test-${Date.now()}`);
  const projectDir = path.join(tmpDir, '.opsv');
  // Fake homedir so we don't pollute real ~/.opsv/ and don't pick up real ~/.opsv/category_validate.yaml
  const fakeHomedir = path.join(os.tmpdir(), `opsv-fakehome-${Date.now()}`);
  const userDir = path.join(fakeHomedir, '.opsv');

  beforeAll(() => {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(userDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up tmp dirs (we no longer touch real ~/.opsv/)
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(fakeHomedir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clear project .opsv between tests
    for (const f of fs.readdirSync(projectDir)) {
      fs.unlinkSync(path.join(projectDir, f));
    }
    for (const f of fs.readdirSync(userDir)) {
      fs.unlinkSync(path.join(userDir, f));
    }
  });

  it('returns null when no config exists', () => {
    // homedir: fakeHomedir ensures user-level fallback doesn't find real ~/.opsv/
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { homedir: fakeHomedir });
    expect(r.config).toBeNull();
    expect(r.errors).toHaveLength(0);
  });

  it('uses canonical name at project level', () => {
    fs.writeFileSync(path.join(projectDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { homedir: fakeHomedir });
    expect(r.config?.basename).toBe('category_validate.yaml');
    expect(r.warnings).toHaveLength(0);
  });

  it('uses underscore-prefix when only it exists at project level', () => {
    fs.writeFileSync(path.join(projectDir, '_category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { strictNaming: true, homedir: fakeHomedir });
    expect(r.config?.basename).toBe('_category_validate.yaml');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('warns on non-canonical name in strict mode', () => {
    fs.writeFileSync(path.join(projectDir, '_category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { strictNaming: true, homedir: fakeHomedir });
    expect(r.warnings.some(w => w.includes('non-canonical'))).toBe(true);
  });

  it('no warning in non-strict mode', () => {
    fs.writeFileSync(path.join(projectDir, '_category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { strictNaming: false, homedir: fakeHomedir });
    expect(r.warnings).toHaveLength(0);
  });

  it('errors on multiple candidates at project level', () => {
    fs.writeFileSync(path.join(projectDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    fs.writeFileSync(path.join(projectDir, '_category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { homedir: fakeHomedir });
    expect(r.config).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('Multiple');
  });

  it('falls back to user dir when project has none', () => {
    fs.writeFileSync(path.join(userDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { homedir: fakeHomedir });
    expect(r.config?.basename).toBe('category_validate.yaml');
    expect(r.projectCandidates).toHaveLength(0);
    expect(r.userCandidates.length).toBeGreaterThan(0);
  });

  it('project level takes precedence over user level', () => {
    fs.writeFileSync(path.join(userDir, 'user_config.yaml'), 'project:\n  required_fields: [status]\n');
    fs.writeFileSync(path.join(projectDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { homedir: fakeHomedir });
    expect(r.config?.basename).toBe('category_validate.yaml');
  });

  it('explicit path wins over discovery', () => {
    fs.writeFileSync(path.join(projectDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    fs.writeFileSync(path.join(projectDir, '_category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { explicitPath: path.join(projectDir, '_category_validate.yaml'), homedir: fakeHomedir });
    expect(r.config?.basename).toBe('_category_validate.yaml');
    expect(r.errors).toHaveLength(0);
  });

  it('explicit path with non-matching filename errors', () => {
    fs.writeFileSync(path.join(projectDir, 'category_validate.yaml'), 'project:\n  required_fields: [status]\n');
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { explicitPath: path.join(projectDir, 'wrong.name'), homedir: fakeHomedir });
    expect(r.config).toBeNull();
    expect(r.errors.some(e => e.includes('does not match pattern'))).toBe(true);
  });

  it('explicit path with non-existent file errors', () => {
    const d = new CategoryConfigDiscoverer();
    const r = d.discover(tmpDir, { explicitPath: '/nonexistent/category_validate.yaml', homedir: fakeHomedir });
    expect(r.config).toBeNull();
    expect(r.errors.some(e => e.includes('does not exist'))).toBe(true);
  });
});

import { sanitizePathComponent, resolveWithin, resolveContainedReal } from '../pathSecurity';
import path from 'path';

describe('pathSecurity', () => {
  describe('sanitizePathComponent', () => {
    it('allows normal names', () => {
      expect(sanitizePathComponent('hello')).toBe('hello');
      expect(sanitizePathComponent('file.txt')).toBe('file.txt');
    });

    it('rejects path traversal', () => {
      expect(sanitizePathComponent('..')).toBeNull();
      expect(sanitizePathComponent('.')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(sanitizePathComponent('')).toBeNull();
    });

    it('rejects path separators', () => {
      expect(sanitizePathComponent('a/b')).toBeNull();
      expect(sanitizePathComponent('a\\b')).toBeNull();
    });
  });

  describe('resolveWithin', () => {
    const base = '/home/user/project';

    it('resolves valid subpaths', () => {
      expect(resolveWithin(base, 'docs', 'readme.md')).toBe(path.resolve(base, 'docs', 'readme.md'));
    });

    it('allows base directory itself', () => {
      expect(resolveWithin(base)).toBe(path.resolve(base));
    });

    it('rejects path traversal', () => {
      expect(resolveWithin(base, '..', 'etc')).toBeNull();
      expect(resolveWithin(base, 'docs', '..', '..', 'etc')).toBeNull();
    });

    it('rejects invalid segments', () => {
      expect(resolveWithin(base, 'docs', '..')).toBeNull();
    });

    it('rejects null byte injection attempts', () => {
      expect(resolveWithin(base, 'doc\0s')).toBeNull();
    });
  });

  describe('resolveContainedReal', () => {
    const fs = require('fs');
    const os = require('os');
    let root: string;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pathsec-'));
      fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
      fs.writeFileSync(path.join(root, 'profiles', 'ok.yaml'), 'kind: workflow\n');
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('resolves legit in-root files', () => {
      expect(resolveContainedReal(root, 'profiles/ok.yaml')).toBe(path.join(root, 'profiles', 'ok.yaml'));
    });

    it('rejects ../ escapes', () => {
      expect(resolveContainedReal(root, '../outside.yaml')).toBeNull();
    });

    it('rejects absolute paths', () => {
      expect(resolveContainedReal(root, '/etc/passwd')).toBeNull();
    });

    it('rejects in-root symlinks pointing outside', () => {
      const outside = path.join(os.tmpdir(), `opsv-outside-${process.pid}.yaml`);
      fs.writeFileSync(outside, 'x');
      try {
        fs.symlinkSync(outside, path.join(root, 'profiles', 'escape.yaml'));
        expect(resolveContainedReal(root, 'profiles/escape.yaml')).toBeNull();
      } finally {
        fs.rmSync(outside, { force: true });
      }
    });

    it('allows in-root symlinks pointing inside', () => {
      fs.symlinkSync(path.join(root, 'profiles', 'ok.yaml'), path.join(root, 'profiles', 'alias.yaml'));
      expect(resolveContainedReal(root, 'profiles/alias.yaml')).toBe(path.join(root, 'profiles', 'ok.yaml'));
    });

    it('validates not-yet-existing paths via the parent realpath', () => {
      expect(resolveContainedReal(root, 'profiles/new.yaml')).toBe(path.join(root, 'profiles', 'new.yaml'));
    });
  });
});

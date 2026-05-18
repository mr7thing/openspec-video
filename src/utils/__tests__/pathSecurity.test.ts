import { sanitizePathComponent, resolveWithin } from '../pathSecurity';
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
});

// ============================================================================
// OpsV Path Security Utilities
// Prevent path traversal by constraining all resolved paths within a base dir.
// ============================================================================

import fs from 'fs';
import path from 'path';

const ILLEGAL_COMPONENT_RE = /[\/\\\x00]/;

/**
 * Sanitize a single path component (filename or directory name).
 * Rejects `.`, `..`, empty strings, and any name containing path separators or null bytes.
 */
export function sanitizePathComponent(name: string): string | null {
  if (!name || name === '.' || name === '..' || ILLEGAL_COMPONENT_RE.test(name)) {
    return null;
  }
  return name;
}

/**
 * Resolve segments under baseDir.
 * Returns null if any segment is invalid or if the resolved path escapes baseDir.
 */
export function resolveWithin(baseDir: string, ...segments: string[]): string | null {
  const absBase = path.resolve(baseDir);
  for (const seg of segments) {
    if (sanitizePathComponent(seg) === null) return null;
  }
  const resolved = path.resolve(absBase, ...segments);
  const normalized = path.normalize(resolved);
  const prefix = absBase.endsWith(path.sep) ? absBase : absBase + path.sep;
  // Allow the base directory itself, or any path strictly inside it
  if (normalized === absBase || normalized.startsWith(prefix)) {
    return normalized;
  }
  return null;
}

/**
 * Resolve `rel` under `root` requiring the REAL path (symlinks resolved) to
 * stay under the root's realpath. Returns the real absolute path, or null
 * when the path escapes (via `..`, absolute input, or symlink) — or when the
 * root itself cannot be resolved. Non-existent final components are allowed:
 * the deepest existing ancestor is realpath-checked instead.
 */
export function resolveContainedReal(root: string, rel: string): string | null {
  if (path.isAbsolute(rel)) return null;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch {
    return null;
  }
  const resolved = path.resolve(realRoot, rel);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (resolved !== realRoot && !resolved.startsWith(prefix)) return null;
  // Walk up to the deepest existing ancestor and verify its real path.
  let cursor = resolved;
  for (;;) {
    if (fs.existsSync(cursor)) {
      let real: string;
      try {
        real = fs.realpathSync.native(cursor);
      } catch {
        return null;
      }
      if (real !== realRoot && !real.startsWith(prefix)) return null;
      return path.join(real, path.relative(cursor, resolved));
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

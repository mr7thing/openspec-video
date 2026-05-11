// ============================================================================
// OpsV Path Security Utilities
// Prevent path traversal by constraining all resolved paths within a base dir.
// ============================================================================

import path from 'path';

const ILLEGAL_COMPONENT_RE = /[\/\\]/;

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

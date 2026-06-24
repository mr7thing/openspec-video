// ============================================================================
// OpsV Asset Document Index
// Recursive scanner for .md files under a root directory.
// Supports deep nesting, maxDepth, excludePatterns, and detects duplicate assetIds.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface AssetDocEntry {
  id: string;
  filePath: string;
  relativePath: string; // relative to scan root
}

export interface AssetDocIndex {
  entries: Map<string, AssetDocEntry>;  // id -> entry (last wins if duplicates)
  duplicates: string[];                  // ids that appeared multiple times
}

export interface AssetDocIndexOptions {
  maxDepth?: number;          // -1 = unlimited, 0 = root only, default undefined = unlimited
  excludePatterns?: string[]; // paths to exclude (relative to scan root)
  projectRoot?: string;       // project root for resolving exclude patterns
}

/**
 * Recursively scan dirPath for *.md files.
 * AssetId is derived from filename (stripping @ prefix and .md suffix).
 * Returns index with all found entries and list of duplicate ids.
 */
export function buildAssetDocIndex(dirPath: string, options?: AssetDocIndexOptions): AssetDocIndex {
  const entries = new Map<string, AssetDocEntry>();
  const seen = new Map<string, string>(); // id -> first filePath (for dup detection)
  const duplicates: string[] = [];
  const excludePatterns = options?.excludePatterns ?? [];
  const projectRoot = options?.projectRoot ?? dirPath;
  const maxDepth = options?.maxDepth;

  function scan(dir: string, relativeTo: string = '', depth: number = 0): void {
    // Depth limit check: maxDepth === -1 means unlimited
    if (maxDepth !== undefined && maxDepth >= 0 && depth > maxDepth) return;

    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relPath = relativeTo ? path.join(relativeTo, item.name) : item.name;

      // Skip dot directories (hidden)
      if (item.isDirectory() && item.name.startsWith('.')) continue;

      // Exclude check: match against projectRoot-relative path
      if (excludePatterns.length > 0) {
        const projectRelPath = path.relative(projectRoot, fullPath);
        const matched = excludePatterns.some(pattern => {
          // Exact match or starts with pattern (i.e., directory prefix)
          return projectRelPath === pattern || projectRelPath.startsWith(pattern + path.sep);
        });
        if (matched) continue;
      }

      if (item.isDirectory()) {
        scan(fullPath, relPath, depth + 1);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        const id = item.name.replace(/^@/, '').replace(/\.md$/, '');
        const entry: AssetDocEntry = { id, filePath: fullPath, relativePath: relPath };

        if (seen.has(id)) {
          if (!duplicates.includes(id)) {
            duplicates.push(id);
            logger.warn(`Duplicate assetId "${id}" found:`);
            logger.warn(`  - ${seen.get(id)}`);
            logger.warn(`  - ${fullPath}`);
          }
        } else {
          seen.set(id, fullPath);
        }

        entries.set(id, entry);
      }
    }
  }

  scan(dirPath);
  return { entries, duplicates };
}

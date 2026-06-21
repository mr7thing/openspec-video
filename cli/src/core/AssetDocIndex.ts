// ============================================================================
// OpsV Asset Document Index
// Recursive scanner for .md files under a root directory.
// Supports deep nesting and detects duplicate assetIds.
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

/**
 * Recursively scan dirPath for *.md files.
 * AssetId is derived from filename (stripping @ prefix and .md suffix).
 * Returns index with all found entries and list of duplicate ids.
 */
export function buildAssetDocIndex(dirPath: string): AssetDocIndex {
  const entries = new Map<string, AssetDocEntry>();
  const seen = new Map<string, string>(); // id -> first filePath (for dup detection)
  const duplicates: string[] = [];

  function scan(dir: string, relativeTo: string = ''): void {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relPath = relativeTo ? path.join(relativeTo, item.name) : item.name;

      if (item.isDirectory()) {
        scan(fullPath, relPath);
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

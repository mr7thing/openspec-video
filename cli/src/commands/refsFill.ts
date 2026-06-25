// ============================================================================
// OpsV opsv refs fill  (v0.11.0)
// Scan prompt @id references, auto-fill missing refs keys + update paths.
// Supersedes the old `opsv refs sync` (sync only touched existing keys).
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { extractAllRefs } from '../core/RefSyntaxParser';
import { RefsByType } from '../types/Refs';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { AssetManager } from '../core/AssetManager';
import { buildAssetDocIndex, AssetDocEntry } from '../core/AssetDocIndex';
import { resolveProjectRoot } from '../utils/projectResolver';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

export function registerRefsFillCommand(refs: Command): void {
  refs
    .command('fill <file>')
    .description('Auto-fill missing refs keys + update paths from prompt @id references')
    .option('--write', 'Write back to file')
    .option('--dry-run', 'Preview changes without touching files')
    .action(async (file: string, options: { write?: boolean; dryRun?: boolean }) => {
      try {
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(chalk.red(`File not found: ${filePath}`));
          process.exit(1);
        }

        const projectRoot = resolveProjectRoot(path.dirname(filePath));
        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = FrontmatterParser.parseRaw(content);

        const result = await fillRefs(frontmatter, body, projectRoot, filePath);

        // Print summary
        console.log(chalk.cyan(`\n${path.basename(filePath)}:`));
        console.log(`  Added:   ${result.added} keys`);
        console.log(`  Updated: ${result.updated} paths`);
        console.log(`  Missing: ${result.unresolved} (file not found)`);

        if (options.dryRun) {
          if (result.added > 0 || result.updated > 0) {
            console.log(chalk.cyan('\nComputed refs (dry-run, not saved):'));
            console.log(yaml.dump({ refs: result.refs }, { lineWidth: -1 }));
          }
          return;
        }

        if (options.write) {
          const newContent = FrontmatterParser.updateField(content, 'refs', result.refs);
          fs.writeFileSync(filePath, newContent);
          console.log(chalk.green(`Updated: ${filePath}`));
        } else {
          console.log(chalk.cyan('\nComputed refs (use --write to save):'));
          console.log(yaml.dump({ refs: result.refs }, { lineWidth: -1 }));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

export interface FillResult {
  refs: RefsByType;
  added: number;
  updated: number;
  unresolved: number;
}

/**
 * Scan prompt for @id references, fill missing keys and update paths.
 *
 * - Missing key (in prompt but not in refs)     → resolve path, add key
 * - Existing key with no path (empty array)      → resolve path, update
 * - Existing key with path                       → leave as-is
 * - Unresolved (file not found)                  → leave empty, count as unresolved
 */
/**
 * Parse `## Design References` section from body text and extract ![alt](path) entries.
 */
function parseDesignRefsFromBody(body: string, docDir: string): Map<string, string> {
  const refs = new Map<string, string>();
  const sectionMatch = body.match(
    /##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i,
  );
  if (!sectionMatch) return refs;

  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(sectionMatch[1])) !== null) {
    const [, alt, filePath] = match;
    if (!alt || !filePath) continue;
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(docDir, filePath);
    if (fs.existsSync(absPath)) {
      refs.set(alt, absPath);
    }
  }
  return refs;
}

export async function fillRefs(
  frontmatter: Record<string, any>,
  body: string,
  projectRoot: string,
  docFilePath?: string,
): Promise<FillResult> {
  const prompt = String(frontmatter.prompt ?? '');
  const tokens = extractAllRefs(prompt);

  const out: RefsByType = deepCloneRefs((frontmatter.refs || {}) as RefsByType);
  const approvedRefReader = new ApprovedRefReader(projectRoot);
  const videospecDir = getProjectDir(projectRoot, 'videospec');
  const index = buildAssetDocIndex(videospecDir);

  // Pre-parse ## Design References for @:key resolution
  const docDir = docFilePath ? path.dirname(docFilePath) : projectRoot;
  const designRefs = parseDesignRefsFromBody(body, docDir);

  let added = 0;
  let updated = 0;
  let unresolved = 0;

  for (const token of tokens) {
    // @:key — document-internal design reference
    if (token.kind === 'doc') {
      const type = 'image';
      if (!out[type]) out[type] = {};

      const existingPath = out[type][token.key];
      const hasPath = Array.isArray(existingPath) && existingPath.length > 0;
      if (hasPath) continue;

      const designPath = designRefs.get(token.id);
      if (designPath) {
        out[type][token.key] = [designPath];
        added++;
      } else {
        out[type][token.key] = [];
        added++;
        unresolved++;
      }
      continue;
    }

    // Default input_type to 'image' — user can adjust later
    const type = inferInputType(token.id, index.entries) ?? 'image';

    if (!out[type]) out[type] = {};

    const existingPath = out[type][token.key];
    const hasPath = Array.isArray(existingPath) && existingPath.length > 0;

    if (hasPath) continue; // already filled, skip

    // Try to resolve
    const docPath = AssetManager.findAssetFilePathUnder(videospecDir, token.id);
    if (!docPath) {
      // Still add the key so it's declared (even if unresolved)
      if (!(token.key in out[type])) {
        out[type][token.key] = [];
        added++;
      }
      unresolved++;
      continue;
    }

    const variant = token.variant;
    const candidate = variant
      ? await approvedRefReader.getVariant(docPath, variant)
      : await approvedRefReader.getFirst(docPath);

    if (candidate) {
      out[type][token.key] = [candidate];
      if (existingPath !== undefined) {
        updated++;
      } else {
        added++;
      }
    } else {
      out[type][token.key] = [];
      if (!(token.key in (frontmatter.refs?.[type] ?? {}))) {
        added++;
      } else {
        unresolved++;
      }
    }
  }

  return { refs: out, added, updated, unresolved };
}

/**
 * Try to infer input_type from the asset doc index.
 * Falls back to 'image' if unresolvable.
 */
function inferInputType(
  id: string,
  index: Map<string, AssetDocEntry>,
): string | null {
  // Walk down the id segments to find a match in the index
  const parts = id.split('/');
  for (let i = 0; i < parts.length; i++) {
    const sub = parts.slice(i).join('/');
    const entry = index.get(sub);
    if (entry) {
      // Infer from file extension
      const ext = path.extname(entry.filePath).toLowerCase();
      if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
      if (['.mp3', '.wav', '.m4a'].includes(ext)) return 'audio';
      if (['.bvh'].includes(ext)) return 'bvh';
      return 'image'; // default for .png/.jpg/.webp etc.
    }
  }
  return null;
}

function deepCloneRefs(refs: RefsByType): RefsByType {
  return JSON.parse(JSON.stringify(refs));
}

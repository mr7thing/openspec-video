// ============================================================================
// OpsV opsv refs (v0.10.0)
// CLI tool for checking and syncing prompt ↔ refs correspondence.
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { extractAllRefs } from '../core/RefSyntaxParser';
import { parseKey } from '../core/RefBinder';
import { RefsByType } from '../types/Refs';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { AssetManager } from '../core/AssetManager';
import { buildAssetDocIndex } from '../core/AssetDocIndex';
import { resolveProjectRoot } from '../utils/projectResolver';
import { getProjectDir } from '../utils/configLoader';
import { logger } from '../utils/logger';

export function registerRefsCommand(program: Command): void {
  const refs = program.command('refs').description('Inspect and manage document refs');

  refs
    .command('check <file>')
    .description('Check prompt ↔ refs correspondence')
    .action(async (file: string) => {
      try {
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(chalk.red(`File not found: ${filePath}`));
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = FrontmatterParser.parseRaw(content);
        const { missingInRefs, unusedInPrompt } = diffRefs(frontmatter, body);

        if (missingInRefs.length === 0 && unusedInPrompt.length === 0) {
          console.log(chalk.green(`✓ ${path.basename(filePath)}: refs ↔ prompt fully aligned`));
          return;
        }

        if (missingInRefs.length > 0) {
          console.log(chalk.red(`\n✗ Missing in refs (used in prompt/visual but not declared):`));
          for (const key of missingInRefs) {
            console.log(chalk.red(`    ${key}`));
          }
        }

        if (unusedInPrompt.length > 0) {
          console.log(chalk.yellow(`\n! Declared but unused (in refs but not referenced in prompt/visual):`));
          for (const key of unusedInPrompt) {
            console.log(chalk.yellow(`    ${key}`));
          }
        }

        process.exit(missingInRefs.length > 0 ? 1 : 0);
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });

  refs
    .command('sync <file>')
    .description('Autofill refs from ApprovedRefReader (multi-candidate left empty for review)')
    .option('--write', 'Write back to file (default: print diff to stdout)')
    .action(async (file: string, options: { write?: boolean }) => {
      try {
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(chalk.red(`File not found: ${filePath}`));
          process.exit(1);
        }

        const projectRoot = resolveProjectRoot(path.dirname(filePath));
        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = FrontmatterParser.parseRaw(content);

        const updated = await autofillRefs(frontmatter, body, projectRoot);

        if (options.write) {
          const newContent = FrontmatterParser.updateField(content, 'refs', updated);
          fs.writeFileSync(filePath, newContent);
          console.log(chalk.green(`Updated: ${filePath}`));
        } else {
          console.log(chalk.cyan('Computed refs (use --write to save):'));
          console.log(yaml.dump({ refs: updated }, { lineWidth: -1 }));
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

/**
 * Compute the difference between prompt @-tokens and refs keys.
 */
export function diffRefs(
  frontmatter: Record<string, any>,
  body: string,
): { promptKeys: Set<string>; refKeys: Set<string>; missingInRefs: string[]; unusedInPrompt: string[] } {
  // v0.10.0: refs only mirrors the `prompt` field (not visual_brief / visual_detailed / body)
  const prompt = String(frontmatter.prompt ?? '');
  const tokens = extractAllRefs(prompt);
  const promptKeys = new Set(tokens.map(t => t.key));

  const refs = (frontmatter.refs || {}) as RefsByType;
  const refKeys = new Set<string>();
  for (const typeMap of Object.values(refs)) {
    for (const key of Object.keys(typeMap || {})) {
      refKeys.add(key);
    }
  }

  const missingInRefs: string[] = [];
  const unusedInPrompt: string[] = [];

  for (const key of promptKeys) {
    if (!refKeys.has(key)) missingInRefs.push(key);
  }
  for (const key of refKeys) {
    if (!promptKeys.has(key)) unusedInPrompt.push(key);
  }

  return { promptKeys, refKeys, missingInRefs, unusedInPrompt };
}

/**
 * Autofill missing refs by querying ApprovedRefReader (external @id)
 * and the document's own Design References (@:key).
 * Multi-candidate cases leave paths empty for manual / review resolution.
 */
async function autofillRefs(
  frontmatter: Record<string, any>,
  body: string,
  projectRoot: string,
): Promise<RefsByType> {
  // v0.10.0: refs only mirrors the `prompt` field
  const prompt = String(frontmatter.prompt ?? '');
  const tokens = extractAllRefs(prompt);

  const out: RefsByType = (frontmatter.refs || {}) as RefsByType;
  const approvedRefReader = new ApprovedRefReader(projectRoot);
  const videospecDir = getProjectDir(projectRoot, 'videospec');
  const index = buildAssetDocIndex(videospecDir);

  for (const token of tokens) {
    const type = 'image'; // default — user may adjust manually
    if (!out[type]) out[type] = {};
    if (out[type][token.key] && out[type][token.key].length > 0) continue;

    if (token.kind === 'external') {
      const docPath = AssetManager.findAssetFilePathUnder(videospecDir, token.id);
      if (docPath) {
        const variant = token.variant;
        const candidate = variant
          ? await approvedRefReader.getVariant(docPath, variant)
          : await approvedRefReader.getFirst(docPath);
        out[type][token.key] = candidate ? [candidate] : [];
      } else {
        out[type][token.key] = [];
      }
    } else if (token.kind === 'doc') {
      // @:key — find image in the file's own Design References by alt text
      const candidate = findDesignRefByAlt(body, token.id);
      out[type][token.key] = candidate ? [candidate] : [];
    }
  }

  return out;
}

/**
 * Find image path in body's ## Design References by alt text.
 * Example: ![angle_side](./refs/hero.png) → "./refs/hero.png" for alt="angle_side"
 */
function findDesignRefByAlt(body: string, alt: string): string | null {
  const inDesignRefs = body.split(/^##\s+Design References/im)[1];
  if (!inDesignRefs) return null;

  const altEsc = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`!\\[${altEsc}\\]\\(([^)]+)\\)`);
  const m = inDesignRefs.match(re);
  return m ? m[1].trim() : null;
}

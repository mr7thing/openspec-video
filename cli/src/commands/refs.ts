// ============================================================================
// OpsV opsv refs (v0.11.0)
// CLI tool for checking prompt ↔ refs correspondence.
// Fill command lives in refsFill.ts.
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { FrontmatterParser } from '../core/FrontmatterParser';
import { extractAllRefs } from '../core/RefEngine';
import { RefsByType } from '../types/Refs';
import { logger } from '../utils/logger';
import { registerRefsFillCommand } from './refsFill';

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

  registerRefsFillCommand(refs);
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

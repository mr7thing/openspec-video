// ============================================================================
// OpsV opsv iterate
// Clone a task JSON (file mode) or an entire model queue dir (directory mode)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger';
import { parseIterationSuffix } from '../executor/naming';
import { escapeRegex } from '../utils/string';

interface IterateOptions {
  inject?: string[];
}

export function registerIterateCommand(program: Command): void {
  program
    .command('iterate <path>')
    .description('Clone a task JSON or an entire model queue directory for iteration')
    .option('-i, --inject <key=value>', 'Inject a field value into cloned task(s) (dot-notation, e.g. modelParams.cfgScale=7.5). Can be specified multiple times.', (val, prev: string[] = []) => [...prev, val], [])
    .action(async (inputPath: string, options: IterateOptions) => {
      try {
        const resolved = path.resolve(inputPath);

        if (!fs.existsSync(resolved)) {
          console.error(chalk.red(`Path not found: ${resolved}`));
          process.exit(1);
        }

        const stat = fs.statSync(resolved);
        const injections = options.inject || [];

        if (stat.isFile()) {
          await iterateFile(resolved, injections);
        } else if (stat.isDirectory()) {
          await iterateDirectory(resolved, injections);
        } else {
          console.error(chalk.red(`Unsupported path type: ${resolved}`));
          process.exit(1);
        }
      } catch (err: any) {
        logger.error(err.message);
        process.exit(1);
      }
    });
}

// --------------------------------------------------------------------------
// File mode: script_01.json → script_01_2.json, script_01_2.json → script_01_3.json
// --------------------------------------------------------------------------

async function iterateFile(filePath: string, injections: string[]): Promise<void> {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);

  if (!filename.endsWith('.json') || filename.startsWith('_')) {
    console.error(chalk.red(`Not a valid task JSON: ${filename}`));
    process.exit(1);
  }

  // Validate it's a task JSON
  const content = fs.readFileSync(filePath, 'utf-8');
  let task: Record<string, unknown>;
  try {
    task = JSON.parse(content);
  } catch {
    console.error(chalk.red(`Invalid JSON: ${filePath}`));
    process.exit(1);
  }

  if (!task._opsv) {
    console.error(chalk.red(`Not a task JSON (missing _opsv): ${filePath}`));
    process.exit(1);
  }

  const base = resolveTaskBase(filename);
  const nextSeq = findNextTaskSeq(dir, base);
  const destName = `${base}_m${nextSeq}.json`;
  const destPath = path.join(dir, destName);

  cloneTaskJson(filePath, destPath);
  for (const spec of injections) {
    injectTaskField(destPath, spec);
  }
  console.log(chalk.green(destPath));
}

// --------------------------------------------------------------------------
// Directory mode: comfylocal.zit_m1/ → comfylocal.zit_m2/
// --------------------------------------------------------------------------

async function iterateDirectory(dirPath: string, injections: string[]): Promise<void> {
  const parentDir = path.dirname(dirPath);
  const sourceName = path.basename(dirPath);
  const baseName = resolveDirBase(sourceName);
  const nextSeq = findNextDirSeq(parentDir, baseName);
  const destName = `${baseName}_m${nextSeq}`;
  const destPath = path.join(parentDir, destName);

  fs.mkdirSync(destPath, { recursive: true });

  const entries = fs.readdirSync(dirPath);
  let copied = 0;

  for (const entry of entries) {
    if (entry.startsWith('_') || !entry.endsWith('.json')) continue;

    const srcFile = path.join(dirPath, entry);
    const stat = fs.statSync(srcFile);
    if (!stat.isFile()) continue;

    let task: any;
    try {
      task = JSON.parse(fs.readFileSync(srcFile, 'utf-8'));
    } catch {
      continue;
    }

    if (!task._opsv) {
      console.log(chalk.yellow(`  Skipping non-task JSON: ${entry}`));
      continue;
    }

    const destFile = path.join(destPath, entry);
    cloneTaskJson(srcFile, destFile);
    for (const spec of injections) {
      injectTaskField(destFile, spec);
    }
    copied++;
  }

  if (copied === 0) {
    console.log(chalk.yellow(`No task JSONs found in ${dirPath}`));
    // Remove empty dest dir
    fs.rmdirSync(destPath);
    return;
  }

  console.log(chalk.green(destPath));
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function resolveTaskBase(filename: string): string {
  const name = filename.replace(/\.json$/, '');
  // Strip trailing _mN (modified task marker, e.g. _m1, _m2)
  const parsed = parseIterationSuffix(name);
  return parsed ? parsed.base : name;
}

function resolveDirBase(dirName: string): string {
  // Strip trailing _mN where N >= 1 (unified with file-mode _mN suffix)
  const match = dirName.match(/^(.*)_m(\d+)$/);
  if (match && parseInt(match[2], 10) >= 1) {
    return match[1];
  }
  return dirName;
}

function findNextTaskSeq(dir: string, base: string): number {
  if (!fs.existsSync(dir)) return 1;
  const entries = fs.readdirSync(dir);
  const pattern = new RegExp(`^${escapeRegex(base)}_m(\\d+)\\.json$`);
  let maxN = 0;
  for (const e of entries) {
    const m = e.match(pattern);
    if (m) {
      maxN = Math.max(maxN, parseInt(m[1], 10));
    }
  }
  return maxN + 1;
}

function findNextDirSeq(parentDir: string, sourceName: string): number {
  if (!fs.existsSync(parentDir)) return 1;
  const entries = fs.readdirSync(parentDir, { withFileTypes: true });
  const pattern = new RegExp(`^${escapeRegex(sourceName)}_m(\\d+)$`);
  let maxN = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = e.name.match(pattern);
    if (m) {
      maxN = Math.max(maxN, parseInt(m[1], 10));
    }
  }
  return maxN + 1;
}

function cloneTaskJson(srcPath: string, destPath: string): void {
  let task: Record<string, unknown>;
  try {
    task = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  } catch (e: any) {
    console.error(`Invalid JSON in ${srcPath}: ${e.message}`);
    return;
  }
  if (task._opsv && typeof task._opsv === 'object') {
    const meta = task._opsv as Record<string, unknown>;
    delete meta.compiledAt;
    delete meta.resumeTaskId;
  }
  fs.writeFileSync(destPath, JSON.stringify(task, null, 2));
}

/**
 * Inject a field value into a task JSON at a dot-notation path.
 * e.g. injectTaskField("task.json", "modelParams.cfgScale=7.5")
 *      → sets task.modelParams.cfgScale = 7.5
 *
 * Value type auto-detection:
 *   numeric literals → number, "true"/"false" → boolean, "null" → null
 *   JSON arrays/objects → parsed, everything else → string
 */
function injectTaskField(filePath: string, injectSpec: string): void {
  const eqIdx = injectSpec.indexOf('=');
  if (eqIdx === -1) {
    console.error(chalk.red(`Invalid inject format (expected key=value): ${injectSpec}`));
    process.exit(1);
  }

  const keyPath = injectSpec.substring(0, eqIdx);
  const rawValue = injectSpec.substring(eqIdx + 1);

  // Parse value type
  let value: unknown = rawValue;
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    value = rawValue.includes('.') ? parseFloat(rawValue) : parseInt(rawValue, 10);
  } else if (rawValue === 'true') {
    value = true;
  } else if (rawValue === 'false') {
    value = false;
  } else if (rawValue === 'null') {
    value = null;
  } else if (/^[[{]/.test(rawValue) && /[\]}]$/.test(rawValue)) {
    try { value = JSON.parse(rawValue); } catch { /* keep as string */ }
  }

  // Read task, inject, write back
  const task = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const keys = keyPath.split('.');
  let obj: Record<string, unknown> = task;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in obj) || typeof obj[keys[i]] !== 'object' || obj[keys[i]] === null) {
      obj[keys[i]] = {};
    }
    obj = obj[keys[i]] as Record<string, unknown>;
  }
  obj[keys[keys.length - 1]] = value;

  fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
}

// ============================================================================
// OpsV v0.8 — opsv iterate
// Clone a task JSON (file mode) or an entire model queue dir (directory mode)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger';

export function registerIterateCommand(program: Command): void {
  program
    .command('iterate <path>')
    .description('Clone a task JSON or an entire model queue directory for iteration')
    .action(async (inputPath: string) => {
      try {
        const resolved = path.resolve(inputPath);

        if (!fs.existsSync(resolved)) {
          console.error(chalk.red(`Path not found: ${resolved}`));
          process.exit(1);
        }

        const stat = fs.statSync(resolved);

        if (stat.isFile()) {
          await iterateFile(resolved);
        } else if (stat.isDirectory()) {
          await iterateDirectory(resolved);
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

async function iterateFile(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);

  if (!filename.endsWith('.json') || filename.startsWith('_')) {
    console.error(chalk.red(`Not a valid task JSON: ${filename}`));
    process.exit(1);
  }

  // Validate it's a task JSON
  const content = fs.readFileSync(filePath, 'utf-8');
  let task: any;
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
  const destName = `${base}_${nextSeq}.json`;
  const destPath = path.join(dir, destName);

  cloneTaskJson(filePath, destPath);
  console.log(chalk.green(destPath));
}

// --------------------------------------------------------------------------
// Directory mode: comfylocal.zit_001/ → comfylocal.zit_001_it_001/
// --------------------------------------------------------------------------

async function iterateDirectory(dirPath: string): Promise<void> {
  const parentDir = path.dirname(dirPath);
  const sourceName = path.basename(dirPath);
  const baseName = resolveDirBase(sourceName);
  const nextSeq = findNextDirSeq(parentDir, baseName);
  const destName = `${baseName}_it_${String(nextSeq).padStart(3, '0')}`;
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
  // Strip trailing _N where N >= 2
  const match = name.match(/^(.*)_(\d+)$/);
  if (match && parseInt(match[2], 10) >= 2) {
    return match[1];
  }
  return name;
}

function resolveDirBase(dirName: string): string {
  // Strip trailing _it_NNN where NNN >= 1
  const match = dirName.match(/^(.*)_it_(\d{3})$/);
  if (match) {
    return match[1];
  }
  return dirName;
}

function findNextTaskSeq(dir: string, base: string): number {
  if (!fs.existsSync(dir)) return 2;
  const entries = fs.readdirSync(dir);
  const pattern = new RegExp(`^${escapeRegex(base)}_(\\d+)\\.json$`);
  let maxN = 1;
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
  const pattern = new RegExp(`^${escapeRegex(sourceName)}_it_(\\d{3})$`);
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
  const task = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  if (task._opsv) {
    delete task._opsv.compiledAt;
    delete task._opsv.resumeTaskId;
  }
  fs.writeFileSync(destPath, JSON.stringify(task, null, 2));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

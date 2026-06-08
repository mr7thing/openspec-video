/**
 * Qianwen/千问 Runner
 *
 * Generates images via OpenCLI's Qwen CLI adapter (opencli qwen image).
 *
 * How it works:
 *   1. Calls `opencli qwen image "<prompt>" --op <dir> --timeout <sec> -f json`
 *   2. Parses JSON output to find saved files
 *   3. Falls back to directory scan if JSON parsing fails
 *
 * Prerequisites:
 *   - opencli (npm install @jackwener/opencli)
 *   - Persistent browser session with qianwen.aliyun.com login
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';
import { findOpenCLI } from './opencli-path';

const OPENCLI_TIMEOUT = 300_000; // 5 min

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [qianwen] ${msg}`);
}

function runCmd(cmd: string, timeout = OPENCLI_TIMEOUT): { stdout: string; stderr: string } | null {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: out.trim(), stderr: '' };
  } catch (e: any) {
    log(`Command failed: ${cmd.slice(0, 200)}`, 'WARN');
    log(`stderr: ${(e.stderr || e.message || '').slice(0, 300)}`, 'WARN');
    return null;
  }
}

// ── Core Generation ────────────────────────────────────────────────────────

export function generateImages(
  prompt: string,
  outputDir: string,
): string[] {
  fs.mkdirSync(outputDir, { recursive: true });

  const cliBin = findOpenCLI();
  const escapedPrompt = JSON.stringify(prompt);
  const cmd = [
    cliBin,
    'qwen',
    'image',
    escapedPrompt,
    '--op', outputDir,
    '--timeout', '180',
    '--site-session', 'persistent',
    '-f', 'json',
  ].join(' ');

  log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 100)}...`);

  const result = runCmd(cmd);
  const imagePaths: string[] = [];

  // Try parsing JSON output
  if (result?.stdout) {
    log(`stdout: ${result.stdout.slice(0, 300)}`);
    try {
      const parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry?.File === 'string' && fs.existsSync(entry.File) && fs.statSync(entry.File).size > 1000) {
            imagePaths.push(entry.File);
          }
          if (typeof entry?.file === 'string' && fs.existsSync(entry.file) && fs.statSync(entry.file).size > 1000) {
            imagePaths.push(entry.file);
          }
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const key of ['File', 'file', 'files', 'path', 'paths'] as const) {
          const val = parsed[key];
          if (!val) continue;
          if (typeof val === 'string' && fs.existsSync(val)) {
            imagePaths.push(val);
          } else if (Array.isArray(val)) {
            for (const fp of val) {
              if (typeof fp === 'string' && fs.existsSync(fp) && fs.statSync(fp).size > 1000) {
                imagePaths.push(fp);
              }
            }
          }
        }
      }
    } catch (e: any) {
      log(`JSON parse failed: ${e.message}`, 'WARN');
    }
  }

  // Fallback: scan output directory
  if (imagePaths.length === 0) {
    const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const files = fs.readdirSync(outputDir)
      .map(f => path.join(outputDir, f))
      .filter(f => {
        try {
          const s = fs.statSync(f);
          return exts.has(path.extname(f).toLowerCase()) && s.size > 1000;
        } catch { return false; }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    imagePaths.push(...files);
  }

  if (imagePaths.length > 0) {
    log(`Generated ${imagePaths.length} image(s): ${imagePaths.map(p => path.basename(p)).join(', ')}`);
  } else if (result) {
    log(`No images generated. stdout: ${result.stdout.slice(0, 300)}`, 'ERROR');
  } else {
    log('Command failed entirely.', 'ERROR');
  }

  return imagePaths;
}

// ── Runner Contract ────────────────────────────────────────────────────────

export function run(taskInfo: TaskInfo): RunnerResult {
  const prompt = taskInfo.prompt;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `qianwen_${taskInfo.shotId}_`));

  try {
    const images = generateImages(prompt, tmpDir);

    if (images.length === 0) {
      return { status: 'failed', images: [], error: 'Image generation returned no files' };
    }

    return { status: 'success', images, error: null };
  } catch (e: any) {
    return { status: 'failed', images: [], error: e.message };
  }
}

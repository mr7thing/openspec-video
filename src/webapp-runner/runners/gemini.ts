/**
 * Gemini Runner
 *
 * Generates images via OpenCLI's Gemini CLI adapter (opencli gemini image).
 *
 * How it works:
 *   1. Calls `opencli gemini image "<prompt>" --op <dir> --rt <ratio> -f json`
 *   2. Parses JSON output to find saved files
 *   3. Falls back to directory scan if JSON parsing fails
 *
 * Prerequisites:
 *   - opencli (npm install -g @jackwener/opencli)
 *   - Persistent browser session
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
  console.log(`[${level}] [gemini] ${msg}`);
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
  aspectRatio = '16:9',
  referenceFiles?: string[],
): string[] {
  fs.mkdirSync(outputDir, { recursive: true });

  // Build command — JSON-escape prompt to avoid shell injection
  const escapedPrompt = JSON.stringify(prompt);
  const cliBin = findOpenCLI();
  const cmdParts: string[] = [
    cliBin,
    'gemini',
    'image',
    escapedPrompt,
    '--op', outputDir,
    '--rt', aspectRatio,
    '--site-session', 'persistent',
    '-f', 'json',
  ];

  // Pass reference files as --upload (comma-separated paths)
  if (referenceFiles && referenceFiles.length > 0) {
    const resolvedRefs = referenceFiles
      .map((rf) => {
        // Resolve relative path from project root or cwd
        if (path.isAbsolute(rf)) return rf;
        const fromCwd = path.resolve(process.cwd(), rf);
        if (fs.existsSync(fromCwd)) return fromCwd;
        return path.resolve(rf);
      })
      .filter((rf) => fs.existsSync(rf));
    if (resolvedRefs.length > 0) {
      cmdParts.push('--upload', resolvedRefs.join(','));
      log(`Reference images: ${resolvedRefs.map(p => path.basename(p)).join(', ')}`);
    }
  }

  const cmd = cmdParts.join(' ');

  log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 100)}...`);
  log(`Image ratio: ${aspectRatio}`);

  const result = runCmd(cmd);
  const imagePaths: string[] = [];

  // Try parsing JSON output
  if (result?.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry?.file && fs.existsSync(entry.file) && fs.statSync(entry.file).size > 1000) {
            imagePaths.push(entry.file);
          }
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const key of ['file', 'files', 'path', 'paths'] as const) {
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
    } catch {
      // JSON parse failed — fall through to directory scan
    }
  }

  // Fallback: scan output directory
  if (imagePaths.length === 0) {
    const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const files = fs.readdirSync(outputDir)
      .map(f => path.join(outputDir, f))
      .filter(f => {
        try { const s = fs.statSync(f); return exts.has(path.extname(f).toLowerCase()) && s.size > 1000; }
        catch { return false; }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    imagePaths.push(...files);
  }

  if (imagePaths.length > 0) {
    log(`Generated ${imagePaths.length} image(s): ${imagePaths.map(p => path.basename(p)).join(', ')}`);
  } else {
    log(`No images generated. stdout: ${(result?.stdout || '').slice(0, 300)}`, 'ERROR');
  }

  return imagePaths;
}

// ── Runner Contract ────────────────────────────────────────────────────────

export function run(taskInfo: TaskInfo): RunnerResult {
  const prompt = taskInfo.prompt;
  const aspectRatio = taskInfo.aspectRatio;
  const referenceFiles = taskInfo.referenceFiles;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  // Create temp working directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `gemini_${taskInfo.shotId}_`));

  try {
    const images = generateImages(prompt, tmpDir, aspectRatio, referenceFiles);

    if (images.length === 0) {
      return { status: 'failed', images: [], error: 'Image generation returned no files' };
    }

    return { status: 'success', images, error: null };
  } catch (e: any) {
    return { status: 'failed', images: [], error: e.message };
  }
}

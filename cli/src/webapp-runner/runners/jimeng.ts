/**
 * Jimeng/即梦 Runner
 *
 * Generates images via OpenCLI's Jimeng CLI adapter (opencli jimeng generate).
 *
 * How it works:
 *   1. Calls `opencli jimeng generate "<prompt>" --wait <sec> -f json`
 *   2. Parses JSON output for image URLs
 *   3. Downloads images to the output directory
 *
 * Prerequisites:
 *   - opencli (npm install @jackwener/opencli)
 *   - Persistent browser session with jimeng.jianying.com login
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';
import { URL } from 'url';

import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';
import { findOpenCLI } from './opencli-path';

const OPENCLI_TIMEOUT = 300_000; // 5 min

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [jimeng] ${msg}`);
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

/** Download a URL to a local file. Returns the local path or null on failure. */
function downloadFile(urlStr: string, destDir: string): Promise<string | null> {
  try {
    const parsedUrl = new URL(urlStr);
    const ext = path.extname(parsedUrl.pathname) || '.jpg';
    const filename = `jimeng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const destPath = path.join(destDir, filename);

    return new Promise((resolve) => {
      const client = parsedUrl.protocol === 'https:' ? https : http;
      client.get(urlStr, { timeout: 30_000 }, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(downloadFile(res.headers.location, destDir));
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          const size = fs.statSync(destPath).size;
          if (size > 1000) {
            resolve(destPath);
          } else {
            fs.unlinkSync(destPath);
            resolve(null);
          }
        });
        fileStream.on('error', () => {
          fs.unlinkSync(destPath);
          resolve(null);
        });
      }).on('error', () => resolve(null));
    });
  } catch {
    return Promise.resolve(null);
  }
}

/** Parse URLs from multiple formats produced by opencli json output */
function extractUrls(parsed: any): string[] {
  const urls: string[] = [];

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (typeof entry?.image_urls === 'string') {
        // Jimeng returns newline-separated URLs
        urls.push(...entry.image_urls.split('\\n').filter(Boolean));
      }
      if (Array.isArray(entry?.image_urls)) {
        urls.push(...entry.image_urls.filter(Boolean));
      }
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    if (typeof parsed.image_urls === 'string') {
      urls.push(...parsed.image_urls.split('\\n').filter(Boolean));
    }
    if (Array.isArray(parsed.image_urls)) {
      urls.push(...parsed.image_urls.filter(Boolean));
    }
  }

  return urls;
}

// ── Core Generation ────────────────────────────────────────────────────────

export async function generateImages(
  prompt: string,
  outputDir: string,
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const cliBin = findOpenCLI();
  const escapedPrompt = JSON.stringify(prompt);
  const cmd = [
    cliBin,
    'jimeng',
    'generate',
    escapedPrompt,
    '--wait', '60',
    '-f', 'json',
    '--site-session', 'persistent',
  ].join(' ');

  log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 100)}...`);

  const result = runCmd(cmd);
  const imagePaths: string[] = [];

  // Parse JSON output for image URLs
  if (result?.stdout) {
    log(`stdout: ${result.stdout.slice(0, 300)}`);
    try {
      const parsed = JSON.parse(result.stdout);
      const urls = extractUrls(parsed);
      log(`Found ${urls.length} image URL(s)`);

      // Download each URL
      for (const url of urls) {
        const localPath = await downloadFile(url, outputDir);
        if (localPath) {
          imagePaths.push(localPath);
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

export async function run(taskInfo: TaskInfo): Promise<RunnerResult> {
  const prompt = taskInfo.prompt;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `jimeng_${taskInfo.shotId}_`));

  try {
    const images = await generateImages(prompt, tmpDir);

    if (images.length === 0) {
      return { status: 'failed', images: [], error: 'Image generation returned no files' };
    }

    return { status: 'success', images, error: null };
  } catch (e: any) {
    return { status: 'failed', images: [], error: e.message };
  }
}

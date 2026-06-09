/**
 * Gemini Runner
 *
 * Generates images via the OPSV Chrome Extension Bridge.
 *
 * Flow:
 *   task JSON → opsv run → WebappProvider → dispatch → gemini.ts
 *     → Unix socket → native-host.py bridge → WS → extension → content.js → Gemini UI
 *
 * No Puppeteer daemon, no separate browser process.
 * Uses the user's existing Chrome with the companion extension loaded.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';

const BRIDGE_SOCKET = '/tmp/opsv-gemini.sock';
const GENERATION_TIMEOUT_MS = 180_000;  // 3 min
const POLL_INTERVAL_MS = 2_000;

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [gemini-runner] ${msg}`);
}

// ── Unix Socket Client ────────────────────────────────────────────────────

/**
 * Connect to the native-host.py bridge and send a generation command.
 * Returns the result when the extension finishes.
 */
function sendViaBridge(payload: Record<string, any>): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const client = new net.Socket();

    let buffer = '';
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Bridge timeout — is native-host.py running?'));
    }, GENERATION_TIMEOUT_MS + 10_000);

    client.connect(BRIDGE_SOCKET, () => {
      client.write(JSON.stringify(payload) + '\n');
    });

    client.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');
      // Try to parse complete JSON response(s)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const response = JSON.parse(trimmed);

          // Skip 'ack' — wait for actual result
          if (response.type === 'ack' || response.status === 'dispatched') {
            log(`Task dispatched, waiting for result...`);
            continue;
          }

          // We got a final result — resolve
          clearTimeout(timeout);
          client.destroy();
          resolve(response);
          return;
        } catch {
          // Incomplete JSON, keep accumulating
        }
      }
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      client.destroy();
      if ((err as any).code === 'ENOENT' || (err as any).code === 'ECONNREFUSED') {
        reject(new Error(`Bridge socket not found at ${BRIDGE_SOCKET}. Start native-host.py first.`));
      } else {
        reject(err);
      }
    });

    client.on('close', () => {
      clearTimeout(timeout);
      if (buffer.trim()) {
        try {
          resolve(JSON.parse(buffer.trim()));
        } catch {
          reject(new Error('Bridge connection closed unexpectedly'));
        }
      } else {
        reject(new Error('Bridge connection closed'));
      }
    });
  });
}

/**
 * Download an image from a URL to a local temp file.
 */
async function downloadImage(url: string, outputPath: string): Promise<void> {
  const https = require('https');
  const http = require('http');
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const proto = urlObj.protocol === 'https:' ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'OPSV-Gemini/1.0' } }, (res: any) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadImage(new URL(res.headers.location, url).href, outputPath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url.slice(0, 80)}`));
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error('Timeout downloading image'));
    });
  });
}

// ── Runner Contract ────────────────────────────────────────────────────────

export async function run(taskInfo: TaskInfo): Promise<RunnerResult> {
  const prompt = taskInfo.prompt;
  const aspectRatio = taskInfo.aspectRatio || '16:9';
  const referenceFiles = taskInfo.referenceFiles;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 120)}...`);
  log(`Ratio: ${aspectRatio}`);

  if (referenceFiles && referenceFiles.length > 0) {
    log(`Reference images: ${referenceFiles.map((p) => path.basename(p)).join(', ')}`);
  }

  // Resolve reference file paths
  const resolvedRefs: string[] = [];
  if (referenceFiles) {
    for (const rf of referenceFiles) {
      let absPath = rf;
      if (!path.isAbsolute(rf)) {
        const fromCwd = path.resolve(process.cwd(), rf);
        if (fs.existsSync(fromCwd)) absPath = fromCwd;
      }
      if (fs.existsSync(absPath)) {
        resolvedRefs.push(absPath);
      } else {
        log(`Reference not found: ${rf}`, 'WARN');
      }
    }
  }

  try {
    // 1. Send task to the extension bridge
    log('Sending task to Chrome extension via bridge...');

    const response = await sendViaBridge({
      type: 'generate',
      cmd_id: taskInfo.shotId,
      shotId: taskInfo.shotId,
      prompt,
      aspectRatio,
      referenceFiles: resolvedRefs.length > 0 ? resolvedRefs : undefined,
    });

    log(`Bridge response: ${response.type} (${response.status || '?'})`);

    // 2. Handle the response
    if (response.type === 'task_result' && response.status === 'completed' && response.imageUrl) {
      // Download the generated image
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-gemini-'));
      const imagePath = path.join(tmpDir, `${taskInfo.shotId}_1.png`);

      log(`Downloading image from: ${response.imageUrl.slice(0, 80)}...`);
      await downloadImage(response.imageUrl, imagePath);

      const size = fs.statSync(imagePath).size;
      log(`Image downloaded: ${size} bytes`);

      if (size < 1000) {
        fs.unlinkSync(imagePath);
        return { status: 'failed', images: [], error: 'Downloaded image is too small (likely an error page)' };
      }

      log(`Generated: ${imagePath}`);
      return { status: 'success', images: [imagePath], error: null };
    }

    // Handle error responses
    const errorMsg = response.error || response.message || 'Unknown bridge error';
    log(`Generation failed: ${errorMsg}`, 'ERROR');
    return { status: 'failed', images: [], error: errorMsg };

  } catch (e: any) {
    log(`Generation error: ${e.message}`, 'ERROR');

    // Helpful hints for common errors
    if (e.message.includes('Bridge socket not found') || e.message.includes('native-host.py')) {
      log('HINT: Start the bridge with: python3 extension/native-host.py', 'HINT');
      log('HINT: Or use: opsv-gemini ping to check if it\'s running', 'HINT');
    }
    if (e.message.includes('No Gemini tab')) {
      log('HINT: Open https://gemini.google.com in Chrome and try again', 'HINT');
    }

    return { status: 'failed', images: [], error: e.message };
  }
}

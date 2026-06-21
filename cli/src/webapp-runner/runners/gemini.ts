/**
 * Gemini Runner
 *
 * Generates images via the OPSV Chrome Extension Bridge.
 *
 * Flow:
 *   task JSON → opsv run → WebappProvider → dispatch → gemini.ts
 *     → Unix socket → native-host.js bridge → WS → extension → content.js → Gemini UI
 *
 * INCREMENTAL_RESULT flow (v0.12+):
 *   User edits prompt/refs in sidepanel → Send to Gemini → content.js generates
 *     → ASSET_SAVED → INCREMENTAL_RESULT → daemon → CLI
 *     → CLI auto-iterates task JSON + saves product
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';

const BRIDGE_SOCKET = process.platform === 'win32'
  ? '\\\\.\\pipe\\tmp\\opsv-gemini.sock'
  : '/tmp/opsv-gemini.sock';
const GENERATION_TIMEOUT_MS = 180_000;  // 3 min — initial generation
const IDLE_WINDOW_MS = 300_000;         // 5 min — wait for INCREMENTAL_RESULT after first result

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [gemini-runner] ${msg}`);
}

// ── IO Helpers ─────────────────────────────────────────────────────────────

/**
 * Download an image from a URL to a local file.
 */
async function downloadImage(url: string, outputPath: string): Promise<void> {
  const https = require('https');
  const http = require('http');
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const proto = urlObj.protocol === 'https:' ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'OPSV-Gemini/1.0' } }, (res: any) => {
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
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Timeout downloading image')); });
  });
}

/**
 * Save base64 dataUrl to file, returning the file path.
 */
function saveDataUrl(dataUrl: string, outputPath: string): string {
  let raw = dataUrl;
  if (dataUrl.startsWith('data:')) {
    const comma = dataUrl.indexOf(',');
    if (comma === -1) throw new Error('Invalid dataUrl: no comma after header');
    raw = dataUrl.slice(comma + 1);
  }
  const buf = Buffer.from(raw, 'base64');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  log(`Saved: ${outputPath} (${buf.length} bytes)`);
  return outputPath;
}

// ── Iterate Helper ─────────────────────────────────────────────────────────

/**
 * Run opsv iterate on a task JSON, then update the clone's prompt/refs.
 * Returns the path to the new task JSON.
 */
function autoIterate(taskPath: string, newPrompt: string, newRefs: string[]): string {
  const { execSync } = require('child_process');

  // Run opsv iterate <taskPath> to create task_mN.json
  // iterate prints the new path with chalk colors; strip ANSI and extract path
  const result = execSync(`opsv iterate "${taskPath}"`, { encoding: 'utf-8' }).trim();
  // Strip ANSI escape codes, take last line
  const clean = result.replace(/\x1b\[[0-9;]*m/g, '').split('\n').pop()?.trim() || '';
  const newTaskPath = clean;

  // Update the new task JSON with modified prompt/refs
  const task = JSON.parse(fs.readFileSync(newTaskPath, 'utf-8'));
  task.payload = task.payload || {};
  task.payload.prompt = newPrompt;

  if (newRefs && newRefs.length > 0) {
    task._opsv = task._opsv || {};
    task._opsv.references = newRefs;
  }

  fs.writeFileSync(newTaskPath, JSON.stringify(task, null, 2));
  log(`Auto-iterated: ${path.basename(taskPath)} → ${path.basename(newTaskPath)}`, 'ITERATE');

  return newTaskPath;
}

/**
 * Find the next output filename index in the queue directory.
 */
function nextOutputIndex(queueDir: string, shotId: string): number {
  if (!fs.existsSync(queueDir)) return 1;
  const prefix = `${shotId}_`;
  const suffix = '.png';
  let max = 0;
  for (const f of fs.readdirSync(queueDir)) {
    if (f.startsWith(prefix) && f.endsWith(suffix)) {
      const num = parseInt(f.slice(prefix.length, -suffix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return max + 1;
}

// ── INCREMENTAL_RESULT Handler ─────────────────────────────────────────────

/**
 * Handle an INCREMENTAL_RESULT message from the extension (manual user edit path).
 * Auto-iterates if prompt/refs changed, saves the product image.
 */
function handleIncrementalResult(data: Record<string, any>, taskInfo: TaskInfo): string[] {
  const originalPrompt = taskInfo.prompt;
  const originalRefs = taskInfo.referenceFiles || [];
  const modifiedPrompt = data.modifiedPrompt || data.prompt || originalPrompt;
  const modifiedRefs = data.modifiedRefs || data.referenceFiles || originalRefs;
  const dataUrl = data.dataUrl;

  if (!dataUrl) {
    log('INCREMENTAL_RESULT missing dataUrl, skipping', 'WARN');
    return [];
  }

  const hasPromptChange = modifiedPrompt !== originalPrompt;
  const hasRefsChange = JSON.stringify(modifiedRefs) !== JSON.stringify(originalRefs);
  const hasChanges = hasPromptChange || hasRefsChange;

  if (hasChanges) {
    log(`Prompt changed: "${originalPrompt.slice(0, 40)}..." → "${modifiedPrompt.slice(0, 40)}..."`, 'ITERATE');
    // Auto-iterate: create task_mN.json with modified prompt/refs
    const newTaskPath = autoIterate(taskInfo.taskPath, modifiedPrompt, modifiedRefs);
    const newShotId = path.basename(newTaskPath, '.json');
    const idx = nextOutputIndex(taskInfo.queueDir, newShotId);
    const outputPath = path.join(taskInfo.queueDir, `${newShotId}_${idx}.png`);
    saveDataUrl(dataUrl, outputPath);
    return [outputPath];
  } else {
    // No changes — save under original shotId
    const idx = nextOutputIndex(taskInfo.queueDir, taskInfo.shotId);
    const outputPath = path.join(taskInfo.queueDir, `${taskInfo.shotId}_${idx}.png`);
    saveDataUrl(dataUrl, outputPath);
    return [outputPath];
  }
}

// ── Bridge Client (persistent connection) ──────────────────────────────────

interface BridgeSession {
  send(msg: Record<string, any>): void;
  close(): void;
}

/**
 * Open a persistent bridge connection that can receive multiple messages.
 * Returns a session object for sending and closes after IDLE_WINDOW.
 */
function openBridge(
  taskInfo: TaskInfo,
  onIncremental: (data: Record<string, any>) => void,
): Promise<BridgeSession & { initialResult: Promise<Record<string, any>> }> {
  return new Promise((resolveSession, rejectSession) => {
    const net = require('net');
    const client = new net.Socket();
    let buffer = '';
    let initialResultResolve!: (value: Record<string, any>) => void;
    let initialResultReject!: (err: Error) => void;
    let gotFirstResult = false;
    let idleTimer: NodeJS.Timeout | null = null;

    const initialResult = new Promise<Record<string, any>>((resolve, reject) => {
      initialResultResolve = resolve;
      initialResultReject = reject;
    });

    const genTimeout = setTimeout(() => {
      client.destroy();
      initialResultReject(new Error('Bridge timeout — is native-host.js running?'));
    }, GENERATION_TIMEOUT_MS + 10_000);

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      // Don't set idle timer until we get the first result
    };

    const startIdleCountdown = () => {
      idleTimer = setTimeout(() => {
        log(`Idle window expired, closing bridge`);
        client.destroy();
      }, IDLE_WINDOW_MS);
    };

    client.connect(BRIDGE_SOCKET, () => {
      const session: BridgeSession & { initialResult: Promise<Record<string, any>> } = {
        send(msg: Record<string, any>) {
          client.write(JSON.stringify(msg) + '\n');
        },
        close() {
          client.destroy();
        },
        initialResult,
      };
      resolveSession(session);
    });

    client.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const response = JSON.parse(trimmed);

          if (response.type === 'ack' || response.status === 'dispatched') {
            log(`Bridge ack: task dispatched`);
            continue;
          }

          if (!gotFirstResult) {
            // First real result: task_result or error
            gotFirstResult = true;
            clearTimeout(genTimeout);
            startIdleCountdown();
            initialResultResolve(response);
            log(`Bridge initial result: ${response.type}`);
          } else if (response.type === 'incremental_result') {
            // Async push from extension after manual user edit
            log(`Bridge INCREMENTAL_RESULT for ${response.shotId || '?'}`);
            resetIdleAndRenew();
            try {
              onIncremental(response);
            } catch (e: any) {
              log(`Error handling INCREMENTAL_RESULT: ${e.message}`, 'ERROR');
            }
          } else {
            // Could be another task_result or other message
            log(`Bridge message (post-result): ${response.type}`, 'DEBUG');
            if (response.type === 'task_result') {
              // Another task result — treat similarly to incremental
              log(`Additional task_result for ${response.shotId || '?'}`);
            }
          }
        } catch {
          // Incomplete JSON, keep accumulating
        }
      }
    });

    function resetIdleAndRenew() {
      if (idleTimer) clearTimeout(idleTimer);
      startIdleCountdown();
    }

    client.on('error', (err: Error) => {
      clearTimeout(genTimeout);
      if (idleTimer) clearTimeout(idleTimer);
      if (!gotFirstResult) {
        if ((err as any).code === 'ENOENT' || (err as any).code === 'ECONNREFUSED') {
          initialResultReject(new Error(`Bridge socket not found at ${BRIDGE_SOCKET}. Start native-host.js first (run 'npm run daemon').`));
        } else {
          initialResultReject(err);
        }
      } else {
        log(`Bridge error (post-result, connection lost): ${err.message}`, 'WARN');
      }
      client.destroy();
    });

    client.on('close', () => {
      clearTimeout(genTimeout);
      if (idleTimer) clearTimeout(idleTimer);
      if (!gotFirstResult) {
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            gotFirstResult = true;
            initialResultResolve(parsed);
            return;
          } catch { /* fall through */ }
        }
        initialResultReject(new Error('Bridge connection closed unexpectedly'));
      }
    });
  });
}

// ── Runner Contract ────────────────────────────────────────────────────────

export async function run(taskInfo: TaskInfo): Promise<RunnerResult> {
  const prompt = taskInfo.prompt;
  const aspectRatio = taskInfo.aspectRatio || '16:9';
  const referenceFiles = taskInfo.referenceFiles;
  const queueDir = taskInfo.queueDir;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 120)}...`);
  log(`Queue Dir: ${queueDir}`);

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

  // Collect INCREMENTAL_RESULT images during the session
  const incrementalImages: string[] = [];

  function onIncremental(data: Record<string, any>) {
    const saved = handleIncrementalResult(data, taskInfo);
    incrementalImages.push(...saved);
  }

  try {
    log('Opening bridge connection...');
    const session = await openBridge(taskInfo, onIncremental);

    // Send generate request
    log('Sending task to Chrome extension via bridge...');
    session.send({
      type: 'generate',
      cmd_id: taskInfo.shotId,
      shotId: taskInfo.shotId,
      prompt,
      aspectRatio,
      queueDir,
      referenceFiles: resolvedRefs.length > 0 ? resolvedRefs : undefined,
    });

    // Wait for initial result
    const response = await session.initialResult;
    log(`Bridge response: ${response.type} (${response.status || '?'})`);

    // 2. Handle the initial response
    if (response.type === 'task_result' && response.status === 'completed' && response.imageUrl) {
      const idx = nextOutputIndex(queueDir, taskInfo.shotId);
      const outputPath = path.join(queueDir, `${taskInfo.shotId}_${idx}.png`);

      log(`Downloading image from: ${response.imageUrl.slice(0, 80)}...`);
      await downloadImage(response.imageUrl, outputPath);

      const size = fs.statSync(outputPath).size;
      log(`Image downloaded: ${size} bytes`);

      if (size < 1000) {
        fs.unlinkSync(outputPath);
        return { status: 'failed', images: [], error: 'Downloaded image is too small (likely an error page)' };
      }

      log(`Generated: ${outputPath}`);
      log(`Bridge stays open for ${IDLE_WINDOW_MS / 1000}s — waiting for manual edits...`);

      // Return initial result; bridge stays open for INCREMENTAL_RESULT
      // Note: incremental images are collected asynchronously and won't be
      // reflected in this return value. The caller should re-scan the queue
      // for new outputs if needed.
      return {
        status: 'success',
        images: [...[outputPath], ...incrementalImages],
        error: null,
      };
    }

    // Handle error responses
    const errorMsg = response.error || response.message || 'Unknown bridge error';
    log(`Generation failed: ${errorMsg}`, 'ERROR');
    return { status: 'failed', images: [], error: errorMsg };

  } catch (e: any) {
    log(`Generation error: ${e.message}`, 'ERROR');

    if (e.message.includes('Bridge socket not found') || e.message.includes('native-host')) {
      log('HINT: Start the bridge daemon with: npm run daemon', 'HINT');
      log('HINT: Or run directly: node extension/native-host.js', 'HINT');
    }
    if (e.message.includes('No Gemini tab')) {
      log('HINT: Open https://gemini.google.com in Chrome and try again', 'HINT');
    }

    return { status: 'failed', images: [], error: e.message };
  }
}

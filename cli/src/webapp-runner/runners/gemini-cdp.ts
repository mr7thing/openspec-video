/**
 * Gemini CDP Runner
 *
 * Connects to a running Chrome via CDP and automates Gemini image generation.
 * No OpenCLI, no Bridge extension, no agent required — fully autonomous.
 *
 * Prerequisites:
 *   1. Chrome running with --remote-debugging-port=9224
 *      (headed or headless=new — headed works best with real profile)
 *   2. Chrome logged into gemini.google.com (aa07707805761@gmail.com profile)
 *   3. chrome://settings/downloads → "Ask where to save" = OFF
 *
 * Config via env:
 *   OPSV_CDP_HOST      (default: 127.0.0.1)
 *   OPSV_CDP_PORT      (default: 9224)
 *   OPSV_CDP_DOWNLOAD  (default: ~/下载/ — must exist, Ask-to-save must be OFF)
 *
 * Flow:
 *   opsv compile --model webapp.gemini-cdp <scene.md>
 *   opsv run <queue-dir>
 *     → WebappProvider → dispatch → gemini-cdp.ts
 *     → CDP → Chrome → gemini.google.com → upload refs → send prompt
 *     → wait for generation → click download → move file to queue dir
 *     → return images to pipeline (watermark removal + naming)
 *
 * Compared to the old gemini.ts (Unix socket bridge):
 *   - NO extension required (just raw Chrome + CDP)
 *   - NO CORS issues (CDP setFileInputFiles bypasses browser security)
 *   - NO file-chooser dialog popup
 *   - NO OpenCLI overhead
 *   - Works with any Chrome version
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';

// ── Config ──────────────────────────────────────────────────────────────────

const CDP_HOST = process.env.OPSV_CDP_HOST || '127.0.0.1';
const CDP_PORT = parseInt(process.env.OPSV_CDP_PORT || '9224', 10);
const DOWNLOAD_DIR = process.env.OPSV_CDP_DOWNLOAD || path.join(os.homedir(), '下载');
const POLL_MS = 5000;                      // DOM poll interval
const GENERATION_TIMEOUT_MS = 240_000;     // 4 min
const DOWNLOAD_WAIT_MS = 20_000;           // wait for file to appear
const NAVIGATE_TIMEOUT_MS = 30_000;

// ── Internal State ──────────────────────────────────────────────────────────

let _msgId = 1;
function nextId(): number { return _msgId++; }

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [gemini-cdp] ${msg}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  CDP Client (raw WebSocket — `ws` is already in opsv deps)
// ════════════════════════════════════════════════════════════════════════════

interface CDPResponse {
  id: number;
  result?: any;
  error?: { message: string };
  method?: string;
  params?: any;
}

class CDPClient {
  private ws!: WebSocket;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, (params: any) => void>();

  async connect(debugUrl?: string): Promise<void> {
    const url = debugUrl || await this._getWSURL();
    log(`Connecting CDP: ${url}`);
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => {
        log('CDP connected');
        resolve();
      });
      this.ws.on('message', (raw: Buffer) => {
        const msg: CDPResponse = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        } else if (msg.method && this.eventHandlers.has(msg.method)) {
          this.eventHandlers.get(msg.method)!(msg.params);
        }
      });
      this.ws.on('error', (err) => reject(err));
      this.ws.on('close', () => log('CDP disconnected', 'WARN'));
    });
  }

  async send(method: string, params?: any): Promise<any> {
    const id = nextId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  on(event: string, handler: (params: any) => void): void {
    this.eventHandlers.set(event, handler);
  }

  close(): void {
    this.ws.close();
  }

  private async _getWSURL(): Promise<string> {
    const http = require('http');
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${CDP_HOST}:${CDP_PORT}/json/version`, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.webSocketDebuggerUrl);
          } catch (e) {
            reject(new Error(`Invalid CDP version response: ${data.slice(0, 100)}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('CDP version request timeout')); });
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CDP Helper Functions
// ════════════════════════════════════════════════════════════════════════════

async function evalJS(cdp: CDPClient, expression: string): Promise<any> {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`JS eval error: ${result.exceptionDetails.text} — ${result.exceptionDetails.exception?.description?.slice(0, 200)}`);
  }
  return result.result?.value;
}

async function waitForSelector(cdp: CDPClient, css: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await evalJS(cdp, `document.querySelectorAll(${JSON.stringify(css)}).length`);
    if (count > 0) return true;
    await sleep(1000);
  }
  return false;
}

async function waitForText(cdp: CDPClient, text: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await evalJS(cdp, `document.body?.innerText?.includes(${JSON.stringify(text)})`);
    if (body) return true;
    await sleep(1000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════════════════
//  CDP Click (simulates real mouse click via Input.dispatchMouseEvent)
// ════════════════════════════════════════════════════════════════════════════

async function clickElement(cdp: CDPClient, css: string): Promise<void> {
  // Get element position
  const box = await evalJS(cdp, `(function(){
    const el = document.querySelector(${JSON.stringify(css)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height };
  })()`);
  if (!box) throw new Error(`Element not found: ${css}`);

  // Real mouse click via CDP Input
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(50);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Wait for generation images
// ════════════════════════════════════════════════════════════════════════════

async function waitForGeneratedImages(cdp: CDPClient): Promise<number> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await evalJS(cdp, `document.querySelectorAll('img[alt*="${'AI 生成'}"]').length`);
    if (count > 0) {
      // Extra wait: the first img appears when generation starts, wait until naturalWidth > 0
      await sleep(3000);
      const ready = await evalJS(cdp, `(function(){
        const imgs = document.querySelectorAll('img[alt*="${'AI 生成'}"]');
        let ready = 0;
        imgs.forEach(i => { if (i.naturalWidth >= 512) ready++; });
        return ready;
      })()`);
      if (ready >= count) return ready;
    }
    await sleep(POLL_MS);
  }
  // check one more time
  const finalCount = await evalJS(cdp, `document.querySelectorAll('img[alt*="${'AI 生成'}"]').length`);
  return finalCount || 0;
}

// ════════════════════════════════════════════════════════════════════════════
//  Download handling — find the newest .png in download dir
// ════════════════════════════════════════════════════════════════════════════

interface DownloadInfo {
  srcPath: string;        // original path in DOWNLOAD_DIR
  md5: string;
  size: number;
}

async function waitForDownload(beforeFiles: string[], timeoutMs = DOWNLOAD_WAIT_MS): Promise<DownloadInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.png') && !f.startsWith('.'));
    const newFiles = current.filter(f => !beforeFiles.includes(f));
    // Remove (1) dupes
    const clean = newFiles.filter(f => !f.includes(' ('));
    if (clean.length > 0) {
      // Pick the newest
      const newest = clean.map(f => ({ name: f, mtime: fs.statSync(path.join(DOWNLOAD_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0];
      const srcPath = path.join(DOWNLOAD_DIR, newest.name);
      const md5 = require('crypto').createHash('md5').update(fs.readFileSync(srcPath)).digest('hex');
      log(`Download complete: ${newest.name} (${fs.statSync(srcPath).size} bytes, md5: ${md5.slice(0, 8)}...)`);
      return { srcPath, md5, size: fs.statSync(srcPath).size };
    }
    await sleep(1000);
  }
  return null;
}

function snapshotDownloadDir(): string[] {
  if (!fs.existsSync(DOWNLOAD_DIR)) return [];
  return fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.png'));
}

// ════════════════════════════════════════════════════════════════════════════
//  Gemini Automation Steps
// ════════════════════════════════════════════════════════════════════════════

interface GeminiPage {
  tabId: string;
  cdp: CDPClient;
}

/**
 * Find or create a Gemini tab in the target Chrome instance.
 */
async function findOrCreateGeminiTab(): Promise<GeminiPage> {
  const http = require('http');
  const targets: any[] = await new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${CDP_PORT}/json`, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid /json response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('/json timeout')); });
  });

  // Find existing Gemini tab
  let target = targets.find((t: any) =>
    t.url?.startsWith('https://gemini.google.com') && t.type === 'page'
  );

  // If no Gemini tab, create one
  if (!target) {
    log('No Gemini tab found, creating one');
    // Connect to the browser, create a new tab
    const browserCDP = new CDPClient();
    await browserCDP.connect(targets.find((t: any) => t.type === 'browser')?.webSocketDebuggerUrl);
    const result = await browserCDP.send('Target.createTarget', {
      url: 'https://gemini.google.com/app',
      newWindow: false,
    });
    browserCDP.close();
    // Re-fetch targets to get the new tab's WS URL
    await sleep(2000);
    const updated: any[] = await new Promise((resolve, reject) => {
      const req = http.get(`http://${CDP_HOST}:${CDP_PORT}/json`, (res: any) => {
        let data = '';
        res.on('data', (c: string) => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid /json response')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('/json timeout')); });
    });
    target = updated.find((t: any) =>
      t.url?.startsWith('https://gemini.google.com') && t.type === 'page'
    );
  }

  if (!target) throw new Error('Cannot find or create Gemini tab');

  const cdp = new CDPClient();
  await cdp.connect(target.webSocketDebuggerUrl);

  // Enable necessary domains
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Set download behavior
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
  }).catch(() => {
    // Older Chrome: try Page.setDownloadBehavior
    return cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR,
    });
  });

  return { tabId: target.id, cdp };
}

/**
 * Reset chat state: navigate to /app or click "新对话" to get out of video mode.
 */
async function resetChat(cdp: CDPClient): Promise<void> {
  // Check if we're on a /app/{id} page
  const url = await evalJS(cdp, 'window.location.href');
  if (url.includes('/app/') && !url.endsWith('/app')) {
    // Chat page — try to click "新对话"
    const clicked = await evalJS(cdp, `(function(){
      const btns = document.querySelectorAll('a[href="/app"], button[aria-label*="${'新对话'}"]');
      if (btns.length > 0) { btns[0].click(); return true; }
      return false;
    })()`);
    await sleep(2000);
  }

  // If still showing video mode (media-gen-zero-state), click one more time
  const inVideoMode = await evalJS(cdp, `document.querySelector('media-gen-zero-state, media-gen-zero-state-shell') !== null`);
  if (inVideoMode) {
    log('In video mode, clicking new chat again to reset');
    const clicked = await evalJS(cdp, `(function(){
      const btns = document.querySelectorAll('a[href="/app"], button[aria-label*="${'新对话'}"]');
      if (btns.length > 0) { btns[0].click(); return true; }
      return false;
    })()`);
    await sleep(2000);
  }

  // Wait for composer to be ready
  await waitForSelector(cdp, '[role=textbox][contenteditable=true]');
  log('Chat reset complete (standard text mode)');
}

/**
 * Upload reference files via Gemini's "上传和工具" menu.
 * Uses CDP DOM.setFileInputFiles for zero-dialog injection.
 */
async function uploadRefs(cdp: CDPClient, refs: string[]): Promise<void> {
  if (!refs || refs.length === 0) return;

  log(`Uploading ${refs.length} ref(s): ${refs.map(r => path.basename(r)).join(', ')}`);

  // Step 1: Click "上传和工具" button
  const uploadBtn = await evalJS(cdp, `document.querySelector('button[aria-label="${'上传和工具'}"]') !== null`);
  if (!uploadBtn) throw new Error('Upload button not found');

  await clickElement(cdp, 'button[aria-label="上传和工具"]');
  await sleep(1500);

  // Step 2: Click "文件" menuitem in CDK overlay
  await evalJS(cdp, `document.querySelectorAll('.cdk-overlay-pane button')[0]?.click()`);
  await sleep(1500);

  // Step 3: Find hidden input[type=file] and inject files
  const inputExists = await evalJS(cdp, `document.querySelector('input[type=file]') !== null`);
  if (!inputExists) throw new Error('File input not found after menuitem click');

  // Get the input's JS objectId for DOM.setFileInputFiles
  const inputObj = await cdp.send('Runtime.evaluate', {
    expression: 'document.querySelector("input[type=file]")',
  });

  await cdp.send('DOM.setFileInputFiles', {
    objectId: inputObj.result.objectId,
    files: refs.filter(r => fs.existsSync(r)),
  });

  // Wait for thumbnails to appear in composer
  await sleep(2000);
  const thumbnailCount = await evalJS(cdp, `document.querySelectorAll('img.preview-image, [class*="preview"] img, [class*="upload"] img').length`);
  log(`Thumbnails detected: ${thumbnailCount}`);

  // Upload complete
  log('Upload complete');
}

/**
 * Type prompt into Gemini's Quill composer and send.
 */
async function sendPrompt(cdp: CDPClient, prompt: string): Promise<string> {
  log(`Sending prompt (${prompt.length} chars): ${prompt.slice(0, 60)}...`);

  // Step 1: Type into the contentEditable textbox
  const escaped = JSON.stringify(prompt);
  await evalJS(cdp, `(function(){
    const editor = document.querySelector('[role=textbox][contenteditable=true]');
    if (!editor) throw new Error('Composer not found');
    // Clear and set
    editor.innerHTML = '<p>' + ${escaped}.replace(/\\n/g, '<br>') + '</p>';
    // Dispatch input event so Angular picks it up
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  })()`);
  await sleep(500);

  // Step 2: Click send button
  const sendFound = await waitForSelector(cdp, 'button[aria-label="发送"]', 5000);
  if (!sendFound) throw new Error('Send button not found');

  await clickElement(cdp, 'button[aria-label="发送"]');
  await sleep(3000);

  // Step 3: Wait for URL to jump to /app/{chatId} (chat created)
  const deadline = Date.now() + 10_000;
  let chatUrl = '';
  while (Date.now() < deadline) {
    chatUrl = await evalJS(cdp, 'window.location.href') as string;
    if (chatUrl.includes('/app/') && !chatUrl.endsWith('/app')) break;
    await sleep(500);
  }

  log(`Chat URL: ${chatUrl}`);
  return chatUrl;
}

/**
 * Download generated images — click "下载完整尺寸的图片" buttons.
 */
async function downloadImages(cdp: CDPClient): Promise<string[]> {
  // Find all download buttons
  const dlCount = await evalJS(cdp, `document.querySelectorAll('button[aria-label="${'下载完整尺寸的图片'}"]').length`);
  log(`Found ${dlCount} download button(s)`);

  if (dlCount === 0) {
    // Try also partial match
    const allBtns = await evalJS(cdp, `[...document.querySelectorAll('button')].filter(b =>
      b.getAttribute('aria-label')?.includes('下载')
    ).length`) as number;
    if (allBtns === 0) throw new Error('No download buttons found — generation may have failed');
    // Use all matching buttons
    const btns = await evalJS(cdp, `[...document.querySelectorAll('button')].filter(b =>
      b.getAttribute('aria-label')?.includes('下载')
    ).length`) as number;
    if (btns === 0) throw new Error('No download buttons available');
  }

  // Snapshot download dir before clicking
  const before = snapshotDownloadDir();
  const savedPaths: string[] = [];

  // Click each download button
  const DL_LABEL = '\u4e0b\u8f7d\u5b8c\u6574\u5c3a\u5bf8\u7684\u56fe\u7247'; // 下载完整尺寸的图片
  for (let i = 0; i < dlCount; i++) {
    // Click the LAST match (newest image) each time
    try {
      await clickElement(cdp, 'button[aria-label="' + DL_LABEL + '"]');
    } catch {
      // Fallback: click via eval (use the most recently added button)
      await evalJS(cdp, '[...document.querySelectorAll("button")].filter(b => b.getAttribute("aria-label")?.includes("' + DL_LABEL + '")).pop()?.click()');
    }

    // Wait for download
    const dl = await waitForDownload(before);
    if (dl) {
      savedPaths.push(dl.srcPath);
      // Update before list to include this file
      before.push(path.basename(dl.srcPath));
    }
    await sleep(1000);
  }

  // If we clicked all buttons but nothing downloaded, wait longer
  if (savedPaths.length === 0) {
    log('No download detected yet, waiting additional 10s...');
    await sleep(10_000);
    const dl = await waitForDownload(before);
    if (dl) savedPaths.push(dl.srcPath);
  }

  // If we got more images than download buttons (previous images), take only new ones
  // Remove duplicates and files that were already in the dir before this task
  const finalImages = savedPaths.filter((p, i, arr) => arr.indexOf(p) === i);

  log(`Downloaded ${finalImages.length} image(s)`);
  return finalImages;
}

// ════════════════════════════════════════════════════════════════════════════
//  Main Runner
// ════════════════════════════════════════════════════════════════════════════

export async function run(taskInfo: TaskInfo): Promise<RunnerResult> {
  const { shotId, prompt, referenceFiles, queueDir } = taskInfo;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  log(`=== Starting ${shotId} ===`);
  log(`Prompt: ${prompt.length} chars`);
  if (referenceFiles?.length) {
    log(`Refs: ${referenceFiles.map(r => path.basename(r)).join(', ')}`);
  }

  let gemini: GeminiPage | null = null;

  try {
    // 1. Connect to Chrome
    log('Connecting to Chrome via CDP...');
    gemini = await findOrCreateGeminiTab();
    log(`Connected to Gemini tab`);

    // 2. Reset chat (new chat, exit video mode)
    await resetChat(gemini.cdp);

    // 3. Upload refs
    if (referenceFiles?.length) {
      // Resolve relative paths
      const resolved = referenceFiles.map(rf => {
        if (path.isAbsolute(rf)) return rf;
        const fromCwd = path.resolve(process.cwd(), rf);
        if (fs.existsSync(fromCwd)) return fromCwd;
        const fromQueue = path.resolve(queueDir, rf);
        if (fs.existsSync(fromQueue)) return fromQueue;
        return rf; // will fail at upload, clear error
      }).filter(r => fs.existsSync(r));

      if (resolved.length === 0) {
        throw new Error(`All reference files not found: ${referenceFiles.join(', ')}`);
      }
      if (resolved.length !== referenceFiles.length) {
        log(`Warning: ${referenceFiles.length - resolved.length} ref(s) not found, proceeding with ${resolved.length}`, 'WARN');
      }

      await uploadRefs(gemini.cdp, resolved);
    }

    // 4. Send prompt
    await sendPrompt(gemini.cdp, prompt);

    // 5. Wait for generation
    log('Waiting for Gemini to generate images...');
    const imgCount = await waitForGeneratedImages(gemini.cdp);
    log(`Generated ${imgCount} image(s)`);

    if (imgCount === 0) {
      // Check for error message
      const errorMsg = await evalJS(gemini.cdp, `document.querySelector('#chat-history')?.innerText?.slice(-300) || ''`) as string;
      if (errorMsg.includes("can't make") || errorMsg.includes('video')) {
        throw new Error(`Gemini refused: "${errorMsg.slice(0, 100)}" — likely in video mode`);
      }
      throw new Error(`No images generated after ${GENERATION_TIMEOUT_MS / 1000}s`);
    }

    // 6. Download
    log('Downloading images...');
    const rawImages = await downloadImages(gemini.cdp);

    if (rawImages.length === 0) {
      throw new Error('Download produced no files');
    }

    log(`=== ${shotId} complete: ${rawImages.length} image(s) ===`);
    return {
      status: 'success',
      images: rawImages,
      error: null,
    };

  } catch (e: any) {
    log(`FAILED: ${e.message}`, 'ERROR');
    return { status: 'failed', images: [], error: e.message };
  } finally {
    if (gemini) {
      try { gemini.cdp.close(); } catch { /* ignore */ }
    }
  }
}

// ── Standalone CLI (for testing/debugging) ──────────────────────────────────

if (require.main === module) {
  (async () => {
    const taskPath = process.argv[2];
    if (!taskPath) {
      console.error('Usage: npx ts-node gemini-cdp.ts <task.json>');
      process.exit(1);
    }
    const { parseTask } = await import('../core/task');
    const taskInfo = parseTask(taskPath);
    const result = await run(taskInfo);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'success' ? 0 : 1);
  })();
}

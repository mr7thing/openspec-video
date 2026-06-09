/**
 * gemini-daemon.ts — ⛔ DEPRECATED
 *
 * This file is superseded by the standalone extension approach:
 *
 *   extension/background.js + native-host.py  ← OpenCLI control via Native Messaging
 *   extension/content.js                       ← Gemini automation (runs in user's Chrome)
 *
 * No Puppeteer daemon needed. Install the extension in your existing Chrome
 * via chrome://extensions → Load unpacked.
 *
 * For control: `opsv-gemini generate --prompt "..."` (sends via Unix socket)
 *
 * ── Old Architecture (preserved for reference) ────────────────────────────
 *
 * OPSV Gemini Browser Engine — Puppeteer + Extension
 *
 * Launches a Puppeteer browser (new window per queue) with the companion
 * extension loaded. A WebSocket server (port 3061-3070) allows the extension
 * to connect for observation/recording.
 *
 * Architecture:
 *   - Puppeteer handles: navigate, click, type, wait, screenshot
 *   - Extension's content script handles: file upload (hidden input → paste)
 *   - WS server: status updates for extension sidepanel / OpenCLI
 *
 * Queue Model: One batch → One browser window → One Gemini conversation
 *   All tasks in a queue are processed sequentially in the same chat session.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import puppeteer, { Browser, Page, CDPSession } from 'puppeteer';

// ── Constants ──────────────────────────────────────────────────────────────

const WS_PORT_RANGE = { start: 3061, end: 3070 };
const WS_CONNECTION_TIMEOUT_MS = 30000;
const GEMINI_APP_URL = 'https://gemini.google.com/app';
const COMPOSER_SELECTORS = [
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '#c-input',
  'div[role="textbox"]',
  '.ql-editor[contenteditable="true"]',
];
const SEND_BUTTON_SELECTORS = [
  '.send-button',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
  'button[aria-label="发送消息"]',
  'button[aria-label="发送"]',
];
const REF_INPUT_SELECTOR = '#opsv-ref-file';
const UPLOAD_POLL_INTERVAL_MS = 500;
const UPLOAD_MAX_POLLS = 20;

// ── State ──────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let wsClients: Set<WebSocket> = new Set();
let wsPort = 0;
let browser: Browser | null = null;
let page: Page | null = null;

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [gemini-daemon] ${msg}`);
}

// ── WebSocket Server ───────────────────────────────────────────────────────

/**
 * Start a WS server on the first available port in 3061-3070.
 * Returns the port number.
 */
async function startWsServer(): Promise<number> {
  for (let port = WS_PORT_RANGE.start; port <= WS_PORT_RANGE.end; port++) {
    try {
      const server = await new Promise<WebSocketServer>((resolve, reject) => {
        const s = new WebSocketServer({ port, host: '127.0.0.1' });
        s.on('listening', () => {
          resolve(s);
        });
        s.on('error', (err: any) => {
          reject(err);
        });
        // Safety timeout: if neither fires in 3s, reject
        setTimeout(() => reject(new Error('timeout')), 3000);
      });

      // Successfully bound this port
      wss = server;
      wsPort = port;
      log(`WS server listening on 127.0.0.1:${port}`);

      server.on('connection', (ws) => {
        wsClients.add(ws);
        log(`WS client connected (${wsClients.size} total)`);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'hello') {
              log('Extension connected:', msg.name || 'unknown');
            }
          } catch { /* ignore malformed */ }
        });

        ws.on('close', () => {
          wsClients.delete(ws);
          log(`WS client disconnected (${wsClients.size} remaining)`);
        });

        ws.on('error', (err) => {
          log(`WS client error: ${err.message}`, 'ERROR');
          wsClients.delete(ws);
        });
      });

      return port;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE') {
        log(`Port ${port} in use, trying next`, 'WARN');
        continue;
      }
      // For other errors, keep trying
      log(`Port ${port}: ${err.message}`, 'WARN');
      continue;
    }
  }
  throw new Error('All ports 3061-3070 are in use');
}

/**
 * Broadcast a status message to all connected WS clients.
 */
function broadcastStatus(status: string, data: Record<string, any> = {}): void {
  const msg = JSON.stringify({ type: 'status', status, ...data, ts: Date.now() });
  for (const ws of wsClients) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
}

/**
 * Stop the WS server.
 */
function stopWsServer(): void {
  for (const ws of wsClients) {
    try { ws.close(); } catch { /* ignore */ }
  }
  wsClients.clear();
  if (wss) {
    wss.close(() => log('WS server stopped'));
    wss = null;
  }
}

// ── Browser Launch ─────────────────────────────────────────────────────────

/**
 * Resolve the extension directory path relative to the project root.
 */
function resolveExtensionDir(): string {
  // Start from this file's location and walk up to find extension/
  const searchPaths = [
    path.join(__dirname, '..', '..', '..', 'extension'),
    path.join(__dirname, '..', '..', '..', '..', 'extension'),
    path.join(__dirname, '..', 'extension'),
    path.join(process.cwd(), 'extension'),
  ];
  for (const p of searchPaths) {
    const manifest = path.join(p, 'manifest.json');
    if (fs.existsSync(manifest)) return p;
  }
  throw new Error('Cannot find extension/ directory (looked for manifest.json)');
}

/**
 * Launch a Puppeteer browser with the OPSV companion extension loaded.
 */
async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  const extDir = resolveExtensionDir();
  log(`Loading extension from: ${extDir}`);

  const profileDir = path.join(os.homedir(), '.opsv', 'gemini-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  // Use Puppeteer's bundled Chromium (avoids conflict with running system Chrome)
  const b = await puppeteer.launch({
    headless: false,
    executablePath: await puppeteer.executablePath(),
    userDataDir: profileDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--window-size=1280,900',
      '--disable-features=TranslateUI',
      '--disable-sync',
      '--proxy-server=127.0.0.1:7890',
    ],
  });

  const [p] = await b.pages();
  await p.setViewport({ width: 1280, height: 900 });

  browser = b;
  page = p;

  log('Browser launched with extension loaded');
  broadcastStatus('browser_ready');

  return { browser: b, page: p };
}

// ── Page Interaction ───────────────────────────────────────────────────────

/**
 * Navigate to Gemini and wait for the page to be ready.
 */
async function navigateToGemini(p: Page): Promise<void> {
  log('Navigating to Gemini...');
  broadcastStatus('navigating', { url: GEMINI_APP_URL });

  // Navigate — use domcontentloaded to avoid hanging on slow resources
  await p.goto(GEMINI_APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Take a diagnostic screenshot
  const debugDir = path.join(os.tmpdir(), 'opsv-daemon-debug');
  fs.mkdirSync(debugDir, { recursive: true });
  await p.screenshot({ path: path.join(debugDir, 'after-navigate.png') });
  log(`Screenshot saved to ${debugDir}/after-navigate.png`);

  const pageTitle = await p.title();
  log(`Page title: "${pageTitle}"`);

  const pageUrl = p.url();
  log(`Current URL: ${pageUrl}`);

  // Check if we're on a login page (handles both redirect and in-page login overlay)
  const bodyText = await p.evaluate(() => document.body.innerText || '');
  const isLoginPage = pageUrl.includes('accounts.google.com') || pageUrl.includes('signin') ||
    /登录|sign.?in|log.?in|accept.*terms|同意.*条款/i.test(bodyText.substring(0, 500));

  if (isLoginPage) {
    log('Login page detected. Please log in to your Google account in the browser window.', 'WARN');
    log('Waiting up to 180s for login to complete...', 'WARN');
    broadcastStatus('login_required');

    if (pageUrl.includes('accounts.google.com')) {
      // Full-page login: wait for navigation away
      try {
        await p.waitForNavigation({ timeout: 180000 });
        log('Login detected, continuing...');
      } catch {
        throw new Error('Login timeout — please log in manually and re-run');
      }
    } else {
      // In-page login dialog: wait for the overlay to disappear (check body text changes)
      log('Waiting for in-page login to complete (polling)...');
      let loggedIn = false;
      for (let i = 0; i < 180; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const currentText = await p.evaluate(() => document.body.innerText || '');
        if (!/登录|sign.?in|log.?in|accept.*terms|同意.*条款/i.test(currentText.substring(0, 500))) {
          loggedIn = true;
          break;
        }
      }
      if (!loggedIn) {
        throw new Error('Login timeout — please log in manually and re-run');
      }
      log('In-page login detected as complete');
    }

    // After login, give a moment for the page to settle
    await new Promise(r => setTimeout(r, 2000));
  }

  await waitForComposer(p);
  log('Gemini page ready');
  broadcastStatus('gemini_ready');
}

/**
 * Wait for the chat composer (input area) to appear and be interactive.
 */
async function waitForComposer(p: Page): Promise<void> {
  for (const sel of COMPOSER_SELECTORS) {
    try {
      await p.waitForSelector(sel, { timeout: 30000 });
      return;
    } catch { /* try next selector */ }
  }
  // If nth selector failed too, try one more with the full page
  try {
    await p.waitForFunction(() => {
      const selectors = arguments as unknown as string[];
      return selectors.some(s => document.querySelector(s));
    }, { timeout: 10000 }, ...COMPOSER_SELECTORS);
  } catch {
    log('Composer not found after all attempts', 'WARN');
  }
}

/**
 * Find the chat input element and type text into it.
 */
async function typePrompt(p: Page, text: string): Promise<void> {
  let input = null;
  for (const sel of COMPOSER_SELECTORS) {
    try { input = await p.$(sel); if (input) break; } catch { /* continue */ }
  }
  if (!input) throw new Error('Cannot find chat input');

  await input.click();
  await new Promise(r => setTimeout(r, 300));

  // Clear any existing content
  await p.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (el) {
      el.textContent = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, COMPOSER_SELECTORS[0]);

  // Type the prompt with human-like delays
  for (const char of text) {
    await p.keyboard.type(char, { delay: 10 + Math.random() * 20 });
  }

  log(`Prompt typed (${text.length} chars)`);
}

/**
 * Click the send button to submit the prompt.
 */
async function clickSend(p: Page): Promise<void> {
  for (let t = 0; t < 30; t++) {
    for (const sel of SEND_BUTTON_SELECTORS) {
      try {
        const btn = await p.$(sel);
        if (btn) {
          const disabled = await p.evaluate((el: Element) =>
            (el as HTMLButtonElement).disabled, btn);
          if (!disabled) {
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            await btn.click();
            log('Send button clicked');
            return;
          }
        }
      } catch { /* continue */ }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Send button not found or disabled');
}

/**
 * Wait for images to appear after sending a prompt.
 * Returns the number of new images found.
 */
async function waitForImages(p: Page, timeoutMs = 120000): Promise<string[]> {
  log('Waiting for generated images...');
  broadcastStatus('generating');

  const initialSrcs = new Set<string>();
  const existingImgs = await p.$$('img');
  for (const img of existingImgs) {
    const src = await p.evaluate(el => el.getAttribute('src') || '', img);
    if (src) initialSrcs.add(src);
  }

  const startTime = Date.now();
  const newUrls: string[] = [];

  while (Date.now() - startTime < timeoutMs) {
    const imgs = await p.$$('img');
    for (const img of imgs) {
      const src = await p.evaluate(el => el.getAttribute('src') || '', img);
      if (src && src.startsWith('http') && !initialSrcs.has(src) && !newUrls.includes(src)) {
        const complete = await p.evaluate(el => (el as HTMLImageElement).complete, img);
        const nw = await p.evaluate(el => (el as HTMLImageElement).naturalWidth, img);

        if (complete && nw > 200) {
          newUrls.push(src);
          log(`Found new image: ${src.slice(0, 60)} (${nw}px)`);
        }
      }
    }

    if (newUrls.length > 0) {
      // Give a moment for more images to appear
      await new Promise(r => setTimeout(r, 2000));
      // Check again
      const imgs2 = await p.$$('img');
      for (const img of imgs2) {
        const src = await p.evaluate(el => el.getAttribute('src') || '', img);
        if (src && src.startsWith('http') && !initialSrcs.has(src) && !newUrls.includes(src)) {
          const complete = await p.evaluate(el => (el as HTMLImageElement).complete, img);
          const nw = await p.evaluate(el => (el as HTMLImageElement).naturalWidth, img);
          if (complete && nw > 200) newUrls.push(src);
        }
      }
      break;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  log(`Found ${newUrls.length} generated images`);
  return newUrls;
}

/**
 * Download an image from a URL using CDP's Page.navigate to get data URL,
 * or extract via CDP fetch.
 */
async function downloadImage(p: Page, imageUrl: string, outputPath: string): Promise<void> {
  log(`Downloading image to ${outputPath}`);

  // Try using CDP fetch to get the image
  const cdpSession = await p.createCDPSession();
  try {
    const { result } = await cdpSession.send('Runtime.evaluate', {
      expression: `fetch("${imageUrl.replace(/"/g, '\\"')}", { credentials: 'include' })
        .then(r => r.blob())
        .then(b => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(b);
        }))`,
      awaitPromise: true,
      returnByValue: true,
    });

    const dataUrl = result?.value;
    if (dataUrl && typeof dataUrl === 'string') {
      const base64 = dataUrl.split(',')[1];
      fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      log(`Image saved: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
      return;
    }
  } catch (e: any) {
    log(`CDP fetch failed: ${e.message}`, 'WARN');
  } finally {
    await cdpSession.detach();
  }

  // Fallback: use page.goto to view image, then screenshot or read data
  const newPage = await browser!.newPage();
  try {
    await newPage.goto(imageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const dataUrl = await newPage.evaluate(() => {
      const img = document.querySelector('img');
      if (!img) return null;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    });
    if (dataUrl) {
      const base64 = dataUrl.split(',')[1];
      fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      log(`Image saved (fallback): ${outputPath}`);
    }
  } finally {
    await newPage.close();
  }
}

// ── File Upload via Content Script ─────────────────────────────────────────

/**
 * Upload a reference image to Gemini using the content script's hidden input.
 *
 * Flow:
 *   1. Reset the upload signal via page.evaluate
 *   2. Use CDP DOM.setFileInputFiles to set the file on #opsv-ref-file
 *   3. Content script's change handler fires → pastes file into Gemini
 *   4. Poll dataset.uploadComplete on the hidden input to confirm
 *   5. Fallback: try direct clipboard injection
 */
async function uploadReferenceImage(p: Page, filePath: string): Promise<boolean> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    log(`Reference file not found: ${absPath}`, 'ERROR');
    return false;
  }

  log(`Uploading reference image: ${absPath}`);
  broadcastStatus('uploading', { file: path.basename(absPath) });

  // 1. Reset upload signal
  await p.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (el) {
      (el as HTMLElement).dataset.uploadComplete = '';
      (el as HTMLElement).dataset.uploadError = '';
    }
  }, REF_INPUT_SELECTOR);

  // 2. Set file on the hidden input via CDP
  const cdpSession = await p.createCDPSession();
  try {
    // Get document
    const { root } = await cdpSession.send('DOM.getDocument', { depth: -1, pierce: true });

    // Find the hidden input
    const { nodeId } = await cdpSession.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: REF_INPUT_SELECTOR,
    });

    if (!nodeId || nodeId === 0) {
      log('Hidden file input not found (may not be injected yet)', 'WARN');
      // Inject it manually
      await p.evaluate(() => {
        if (!document.getElementById('opsv-ref-file')) {
          const input = document.createElement('input');
          input.id = 'opsv-ref-file';
          input.type = 'file';
          input.accept = 'image/*';
          input.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
          document.body.appendChild(input);
        }
      });
      // Retry query
      const { root: r2 } = await cdpSession.send('DOM.getDocument', { depth: -1, pierce: true });
      const { nodeId: nid2 } = await cdpSession.send('DOM.querySelector', {
        nodeId: r2.nodeId,
        selector: REF_INPUT_SELECTOR,
      });
      if (!nid2 || nid2 === 0) {
        log('Cannot find or create hidden file input', 'ERROR');
        return false;
      }
      // Set file using updated nodeId
      await cdpSession.send('DOM.setFileInputFiles', {
        nodeId: nid2,
        files: [absPath],
      });
    } else {
      // Set file on found input
      await cdpSession.send('DOM.setFileInputFiles', {
        nodeId,
        files: [absPath],
      });
    }
  } finally {
    await cdpSession.detach();
  }

  log('File set on input, waiting for content script to paste...');

  // 3. Poll for upload complete signal
  for (let i = 0; i < UPLOAD_MAX_POLLS; i++) {
    const status = await p.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      return el ? (el as HTMLElement).dataset.uploadComplete || '' : '';
    }, REF_INPUT_SELECTOR);

    if (status === 'true') {
      log('Upload complete (confirmed via DOM signal)');
      broadcastStatus('upload_complete');
      return true;
    }

    await new Promise(r => setTimeout(r, UPLOAD_POLL_INTERVAL_MS));
  }

  log('Upload signal not detected after polling, may still have worked', 'WARN');
  broadcastStatus('upload_uncertain');
  return false;
}

// ── Task Processing ────────────────────────────────────────────────────────

export interface DaemonTask {
  shotId: string;
  prompt: string;
  aspectRatio?: string;
  referenceFiles?: string[];
  outputDir?: string;
  [key: string]: any;
}

export interface DaemonResult {
  shotId: string;
  status: 'completed' | 'failed';
  images: string[];
  error: string | null;
}

/**
 * Process a single task in the current Gemini conversation.
 */
async function processTask(p: Page, task: DaemonTask): Promise<DaemonResult> {
  const { shotId, prompt, referenceFiles, outputDir } = task;
  log(`Processing task: ${shotId}`);
  broadcastStatus('task_start', { shotId, prompt: prompt.slice(0, 60) });

  try {
    // Upload reference images if provided
    if (referenceFiles && referenceFiles.length > 0) {
      for (const refFile of referenceFiles) {
        await uploadReferenceImage(p, refFile);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Type the prompt
    await typePrompt(p, prompt);

    // Wait for send button and click it
    await clickSend(p);

    // Wait for generated images
    const imageUrls = await waitForImages(p);

    if (imageUrls.length === 0) {
      throw new Error('No images generated');
    }

    // Download images
    const outputPaths: string[] = [];
    const outDir = outputDir || path.join(os.tmpdir(), 'opsv-gemini', shotId);
    fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < imageUrls.length; i++) {
      const outPath = path.join(outDir, `image_${i + 1}.png`);
      await downloadImage(p, imageUrls[i], outPath);
      outputPaths.push(outPath);
    }

    log(`Task ${shotId} completed: ${outputPaths.length} images`);
    broadcastStatus('task_done', { shotId, images: outputPaths.length });

    return {
      shotId,
      status: 'completed',
      images: outputPaths,
      error: null,
    };
  } catch (e: any) {
    log(`Task ${shotId} failed: ${e.message}`, 'ERROR');
    broadcastStatus('task_error', { shotId, error: e.message });
    return {
      shotId,
      status: 'failed',
      images: [],
      error: e.message,
    };
  }
}

// ── Batch Processing ───────────────────────────────────────────────────────

/**
 * Process a batch of tasks in a single Gemini conversation.
 * One browser window → one conversation → sequential tasks.
 */
export async function processBatch(tasks: DaemonTask[]): Promise<DaemonResult[]> {
  const results: DaemonResult[] = [];

  try {
    // 1. Start WS server
    await startWsServer();

    // 2. Launch browser with extension
    const { page: p } = await launchBrowser();

    // 3. Navigate to Gemini
    await navigateToGemini(p);

    // 4. Process each task sequentially
    for (const task of tasks) {
      const result = await processTask(p, task);
      results.push(result);
    }

    log(`Batch complete: ${results.filter(r => r.status === 'completed').length}/${tasks.length} tasks succeeded`);
    broadcastStatus('batch_done', { total: tasks.length, completed: results.filter(r => r.status === 'completed').length });

  } catch (e: any) {
    log(`Batch failed: ${e.message}`, 'ERROR');
    broadcastStatus('batch_error', { error: e.message });
  } finally {
    // Cleanup
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
      page = null;
    }
    stopWsServer();
  }

  return results;
}

// ── Single Task Entry Point ────────────────────────────────────────────────

/**
 * Execute a single task (convenience wrapper around processBatch).
 */
export async function generateImages(taskInfo: DaemonTask): Promise<DaemonResult> {
  const results = await processBatch([taskInfo]);
  return results[0] || { shotId: taskInfo.shotId, status: 'failed', images: [], error: 'Unknown error' };
}

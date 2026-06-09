/**
 * gemini-daemon.ts
 *
 * Gemini browser engine using OpenCLI daemon (port 19825).
 * No Puppeteer, no separate Chrome launch.
 * Communicates with the user's existing Chrome via:
 *   - POST /command → OpenCLI daemon → Chrome extension → chrome.debugger API
 *
 * Benefits:
 *   - Uses user's already-logged-in Chrome (no login step needed)
 *   - No cookie copying or profile management
 *   - All existing tabs preserved
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Constants ──────────────────────────────────────────────────────────────

const DAEMON_PORT = parseInt(process.env.OPENCLI_DAEMON_PORT ?? '19825', 10);
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;
const GEMINI_APP_URL = 'https://gemini.google.com/app';

// Default session name for Gemini operations
const GEMINI_SESSION = 'opsv-gemini';

// ── Types ──────────────────────────────────────────────────────────────────

interface ExportedImage {
  url: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

// ── Daemon HTTP Client ─────────────────────────────────────────────────────

let _cmdCounter = 0;

async function sendCommand(
  action: string,
  params: Record<string, any> = {},
): Promise<any> {
  const id = `opsv_${process.pid}_${Date.now()}_${++_cmdCounter}`;
  const body: Record<string, any> = { id, action, ...params };

  const res = await fetch(`${DAEMON_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenCLI': '1' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`Daemon request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const result = await res.json();
  if (!result.ok) {
    throw new Error(result.error ?? 'Daemon command failed');
  }
  return result.data;
}

/**
 * Execute JavaScript in the Gemini page (via daemon's exec action).
 */
async function execJS(code: string): Promise<any> {
  return sendCommand('exec', { session: GEMINI_SESSION, code });
}

/**
 * Navigate Gemini tab to a URL.
 */
async function navigateTo(url: string): Promise<any> {
  return sendCommand('navigate', { session: GEMINI_SESSION, url });
}

/**
 * Take a screenshot of the Gemini tab (for debugging).
 */
async function screenshot(): Promise<string> {
  return sendCommand('screenshot', { session: GEMINI_SESSION, format: 'png' });
}

// ── Ensure Gemini Page is Ready ───────────────────────────────────────────

export async function ensureGeminiPage(): Promise<void> {
  log('Ensuring Gemini page is ready...');

  // Navigate to Gemini app URL
  try {
    await navigateTo(GEMINI_APP_URL);
  } catch (e: any) {
    log(`Navigation warning: ${e.message}`, 'WARN');
  }

  // Wait for Gemini to be ready (check for contenteditable composer)
  const maxWait = 30; // seconds
  for (let i = 0; i < maxWait; i++) {
    const url = await execJS('window.location.href').catch(() => '');
    if (typeof url === 'string' && (url.includes('accounts.google.com') || url.includes('ServiceLogin'))) {
      throw new Error(
        'Gemini login page detected. Please make sure Chrome is logged into Google.\n' +
        'Run: opencli browser status — to verify daemon health.',
      );
    }

    const hasComposer = await execJS(`
      (() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const selectors = [
          '.ql-editor[contenteditable="true"]',
          '[contenteditable="true"][aria-label*="Gemini"]',
          '[aria-label="Enter a prompt for Gemini"]',
          '[aria-label*="prompt for Gemini"]',
          '[aria-label*="输入提示"]',
          '[aria-label*="prompt"]',
        ];
        return selectors.some(sel => {
          const el = document.querySelector(sel);
          return el && isVisible(el);
        });
      })()
    `).catch(() => false);

    if (hasComposer) {
      log('Gemini page is ready.');
      return;
    }

    await sleep(1000);
  }

  log('WARNING: Proceeding without confirmed Gemini page ready', 'WARN');
}

// ── Enable Image Generation Mode ──────────────────────────────────────────

export async function enableImageMode(): Promise<void> {
  log('Enabling image generation mode (制作图片)...');

  // Click "上传和工具" button to open the menu
  const menuOpened = await execJS(`
    document.querySelector('button[aria-label="上传和工具"]')?.click();
    "ok";
  `);
  await sleep(1500);

  // Click "制作图片" checkbox (menuitemcheckbox) if not already checked
  const result = await execJS(`
    (() => {
      const imgMode = document.querySelector('[role="menuitemcheckbox"][aria-checked="false"]');
      if (imgMode && (imgMode.textContent || '').includes('制作图片')) {
        imgMode.click();
        return 'toggled-on';
      }
      const checkedMode = document.querySelector('[role="menuitemcheckbox"][aria-checked="true"]');
      if (checkedMode && (checkedMode.textContent || '').includes('制作图片')) {
        return 'already-on';
      }
      return 'not-found';
    })()
  `);
  log(`Image mode: ${result}`);

  // Close menu by clicking outside
  await sleep(500);
}

// ── Start a New Chat ──────────────────────────────────────────────────────

export async function startNewChat(): Promise<void> {
  const action = await execJS(`
    (() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt.includes('new chat') || txt.includes('新对话')) {
          btn.click();
          return 'click';
        }
      }
      return 'navigate';
    })()
  `);

  if (action === 'navigate') {
    await navigateTo(GEMINI_APP_URL);
    await sleep(1500);
  } else {
    await sleep(1000);
  }
}

// ── Upload Reference Image ────────────────────────────────────────────────
//
// Uses the companion extension's hidden #opsv-ref-file input + OpenCLI daemon's
// set-file-input action. The daemon uses CDP DOM.setFileInputFiles to set the
// file on the input, triggering a change event that the content script handles
// by reading the file and injecting it into Gemini via ClipboardEvent paste.

export async function uploadReferenceImage(absPath: string): Promise<boolean> {
  if (!fs.existsSync(absPath)) {
    log(`File not found: ${absPath}`, 'WARN');
    return false;
  }

  const fileName = path.basename(absPath);
  const fileSize = fs.statSync(absPath).size;
  log(`Uploading reference image via CDP set-file-input: ${fileName} (${fileSize} bytes)`);

  // Step 1: Reset upload signal on the hidden input (set by content script)
  try {
    await sendCommand('exec', {
      session: GEMINI_SESSION,
      code: `(() => {
        const el = document.querySelector('#opsv-ref-file');
        if (el) { el.dataset.uploadComplete = ''; el.dataset.uploadError = ''; return 'reset'; }
        return 'no-input';
      })()`,
    });
  } catch (e: any) {
    log(`Signal reset exec failed (non-fatal): ${e.message}`, 'WARN');
  }

  // Step 2: Set file on the hidden input via CDP DOM.setFileInputFiles
  // The OpenCLI extension handles this via the 'set-file-input' action
  try {
    await sendCommand('set-file-input', {
      session: GEMINI_SESSION,
      files: [absPath],
      selector: '#opsv-ref-file',
    });
  } catch (e: any) {
    log(`set-file-input failed: ${e.message}`, 'WARN');

    // Fallback: try CDP Page.setInterceptFileChooserDialog approach
    log('Trying CDP file chooser interception fallback...');
    try {
      // Enable file chooser interception
      await sendCommand('cdp', {
        session: GEMINI_SESSION,
        cdpMethod: 'Page.setInterceptFileChooserDialog',
        cdpParams: { enabled: true },
      });

      // Click the hidden input to trigger file chooser
      await sendCommand('exec', {
        session: GEMINI_SESSION,
        code: `document.querySelector('#opsv-ref-file')?.click()`,
      });

      // Wait for CDP to intercept and set the file
      await sleep(2000);

      // Disable interception
      await sendCommand('cdp', {
        session: GEMINI_SESSION,
        cdpMethod: 'Page.setInterceptFileChooserDialog',
        cdpParams: { enabled: false },
      });
    } catch (fbErr: any) {
      log(`File chooser interception fallback also failed: ${fbErr.message}`, 'WARN');

      // Last resort: try direct DOM.setFileInputFiles via CDP command
      try {
        await sendCommand('cdp', {
          session: GEMINI_SESSION,
          cdpMethod: 'DOM.setFileInputFiles',
          cdpParams: {
            backendNodeId: 0, // Will be resolved by content script
            files: [absPath],
          },
        });
      } catch (lastErr: any) {
        log(`All upload methods failed: ${lastErr.message}`, 'ERROR');
        return false;
      }
    }
  }

  // Step 3: Wait for content script to complete the paste
  // Content script sets opsv-ref-file.dataset.uploadComplete after paste
  const POLL_INTERVAL = 500;
  const MAX_POLLS = 20; // 10 seconds total
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL);
    try {
      const result = await sendCommand('exec', {
        session: GEMINI_SESSION,
        code: `(() => {
          const el = document.querySelector('#opsv-ref-file');
          if (!el) return '{"complete":false,"error":"input_not_found"}';
          return JSON.stringify({complete: el.dataset.uploadComplete === 'true', error: el.dataset.uploadError || ''});
        })()`,
      });
      const status = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
      if (status?.complete) {
        log(`Reference image uploaded and pasted into Gemini successfully.`);
        return true;
      }
      if (status?.error) {
        log(`Upload error detected: ${status.error}`, 'WARN');
        return false;
      }
    } catch (e: any) {
      // Poll failures are expected while the paste is in progress
      if (i % 5 === 0) log(`Poll ${i + 1}/${MAX_POLLS}: still waiting...`);
    }
  }

  // Step 4: Timeout — paste may still have worked, check for blob preview
  log('Upload poll timeout — checking for preview as final verification...', 'WARN');
  try {
    const previewCheck = await execJS(`
      (() => {
        const blobImgs = Array.from(document.querySelectorAll('img'))
          .filter(img => (img.src || '').startsWith('blob:') && img.width > 32);
        return blobImgs.length > 0 ? 'verified' : 'no-preview';
      })()
    `);
    if (String(previewCheck).startsWith('verified')) {
      log('Blob preview found despite poll timeout — upload succeeded.');
      return true;
    }
  } catch {}

  log('Upload may have failed — no completion signal received', 'WARN');
  return false;
}

// ── Send Prompt ───────────────────────────────────────────────────────────

async function sendPrompt(text: string): Promise<void> {
  // Find and prepare composer
  const prepared = await execJS(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      const selectors = [
        '.ql-editor[contenteditable="true"]',
        '.ql-editor[role="textbox"]',
        '[contenteditable="true"][aria-label*="Gemini"]',
        '[aria-label="Enter a prompt for Gemini"]',
        '[aria-label*="prompt for Gemini"]',
        '[aria-label*="输入提示"]',
        '[aria-label*="prompt"]',
        '[contenteditable="true"]',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          el.setAttribute('data-opsv-composer', '1');
          el.focus();
          return 'found';
        }
      }

      // Deep search with shadow DOM
      function deepFind(root, depth) {
        if (depth > 6) return null;
        const all = root.querySelectorAll('*');
        for (const el of all) {
          if (!(el instanceof HTMLElement)) continue;
          if (el.isContentEditable && isVisible(el)) {
            el.setAttribute('data-opsv-composer', '1');
            el.focus();
            return el;
          }
          if (el.shadowRoot) {
            const found = deepFind(el.shadowRoot, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }

      const found = deepFind(document, 0);
      return found ? 'found-shadow' : 'not-found';
    })()
  `);

  if (typeof prepared === 'string' && prepared === 'not-found') {
    throw new Error('Gemini composer not found');
  }

  log(`Composer found: ${prepared}`);

  // Insert text
  const inserted = await execJS(`
    (() => {
      const el = document.querySelector('[data-opsv-composer]');
      if (!el) return false;
      el.focus();

      // Clear existing content
      el.textContent = '';

      // Try execCommand
      const ok = document.execCommand('insertText', false, ${JSON.stringify(text)});
      if (!ok) {
        const p = document.createElement('p');
        const lines = ${JSON.stringify(text)}.split('\\n');
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) p.appendChild(document.createElement('br'));
          p.appendChild(document.createTextNode(lines[i]));
        }
        el.replaceChildren(p);
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Verify text was inserted
      const currentText = (el.textContent || el.innerText || '').trim();
      return currentText.length > 0;
    })()
  `);

  if (!inserted) {
    throw new Error('Failed to insert prompt text into Gemini composer');
  }

  // Submit via keyboard Enter
  await execJS(`
    (() => {
      const el = document.querySelector('[data-opsv-composer]');
      if (!el) return false;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return true;
    })()
  `);

  await sleep(2000);
  log('Prompt submitted.');
}

// ── Wait for Images ───────────────────────────────────────────────────────

async function waitForImages(timeoutSeconds: number): Promise<string[]> {
  log(`Waiting for generated images (timeout: ${timeoutSeconds}s)...`);

  const pollInterval = 3000;
  const maxPolls = Math.max(1, Math.ceil((timeoutSeconds * 1000) / pollInterval));
  let lastUrls: string[] = [];
  let stableCount = 0;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollInterval);

    const urls: string[] = await execJS(`
      (() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 32 && r.height > 32;
        };
        const main = document.querySelector('main') || document.body;
        const imgs = Array.from(main.querySelectorAll('img'));
        return imgs
          .filter(img => {
            if (!(img instanceof HTMLImageElement)) return false;
            if (!isVisible(img)) return false;
            const src = img.currentSrc || img.src || '';
            if (!src) return false;
            const alt = (img.getAttribute('alt') || '').toLowerCase();
            if (alt.includes('avatar') || alt.includes('logo') || alt.includes('icon')) return false;
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            if (w < 500 || h < 500) return false;
            return true;
          })
          .map(img => img.currentSrc || img.src);
      })()
    `).catch(() => []);

    if (!Array.isArray(urls) || urls.length === 0) continue;

    // Check stability
    const key = urls.join('\n');
    const prevKey = lastUrls.join('\n');
    if (key === prevKey) {
      stableCount++;
    } else {
      lastUrls = urls;
      stableCount = 1;
    }

    log(`  Poll ${i + 1}/${maxPolls}: ${urls.length} image(s)${stableCount >= 2 ? ' (stable)' : ''}`);

    if (stableCount >= 2) return lastUrls;
  }

  return lastUrls;
}

// ── Export Images ─────────────────────────────────────────────────────────

async function exportImages(imageUrls: string[]): Promise<ExportedImage[]> {
  if (imageUrls.length === 0) return [];

  log(`Exporting ${imageUrls.length} image(s)...`);

  const assets: ExportedImage[] = await execJS(`
    (async () => {
      const targetUrls = ${JSON.stringify(imageUrls)};

      const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      });

      const results = [];

      for (const targetUrl of targetUrls) {
        const main = document.querySelector('main') || document.body;
        const imgs = Array.from(main.querySelectorAll('img'));
        const img = imgs.find(node => (node.currentSrc || node.src || '') === targetUrl);

        let dataUrl = '';
        let mimeType = 'image/jpeg';
        const w = img?.naturalWidth || img?.width || 0;
        const h = img?.naturalHeight || img?.height || 0;

        try {
          if (String(targetUrl).startsWith('data:')) {
            dataUrl = String(targetUrl);
            mimeType = (String(targetUrl).match(/^data:([^;]+);/i) || [])[1] || 'image/png';
          } else {
            const res = await fetch(String(targetUrl), { credentials: 'include' });
            if (res.ok) {
              const blob = await res.blob();
              mimeType = blob.type || 'image/jpeg';
              dataUrl = await blobToDataUrl(blob);
            }
          }
        } catch {}

        if (!dataUrl && img instanceof HTMLImageElement) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              dataUrl = canvas.toDataURL('image/png');
              mimeType = 'image/png';
            }
          } catch {}
        }

        if (dataUrl && w >= 500 && h >= 500) {
          results.push({ url: String(targetUrl), dataUrl, mimeType, width: w, height: h });
        }
      }

      return results;
    })()
  `).catch(() => []);

  return Array.isArray(assets) ? assets : [];
}

// ── Save Images to Disk ───────────────────────────────────────────────────

function saveImages(assets: ExportedImage[], outputDir: string): string[] {
  const stamp = Date.now();
  const imagePaths: string[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const base64 = asset.dataUrl.replace(/^data:[^;]+;base64,/, '');
    const ext = asset.mimeType.includes('png')
      ? '.png'
      : asset.mimeType.includes('webp')
        ? '.webp'
        : asset.mimeType.includes('gif')
          ? '.gif'
          : '.jpg';
    const suffix = assets.length > 1 ? `_${i + 1}` : '';
    const filePath = path.join(outputDir, `gemini_${stamp}${suffix}${ext}`);
    fs.writeFileSync(filePath, base64, 'base64');
    imagePaths.push(filePath);
  }

  return imagePaths;
}

// ── High-Level: Generate Images ───────────────────────────────────────────

export async function generateImages(
  prompt: string,
  outputDir: string,
  aspectRatio = '16:9',
  referenceFiles?: string[],
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  // Ensure Gemini page
  await ensureGeminiPage();

  // Note: File upload uses companion extension's #opsv-ref-file input
  // + OpenCLI daemon set-file-input action. No CDP script injection needed.

  // Start fresh chat
  await startNewChat();

  // Enable image generation mode (制作图片)
  await enableImageMode();

  // Upload reference images
  if (referenceFiles && referenceFiles.length > 0) {
    for (const rf of referenceFiles) {
      let absPath = rf;
      if (!path.isAbsolute(rf)) {
        const fromCwd = path.resolve(process.cwd(), rf);
        if (fs.existsSync(fromCwd)) absPath = fromCwd;
      }
      if (fs.existsSync(absPath)) {
        const ok = await uploadReferenceImage(absPath);
        if (!ok) {
          log(`Reference image upload may have failed for: ${path.basename(absPath)}`, 'WARN');
        }
      }
    }
  }

  // Build prompt with explicit reference to the uploaded image
  let effectivePrompt = prompt;
  if (referenceFiles && referenceFiles.length > 0) {
    const refNames = referenceFiles.map(rf => path.basename(rf)).join(', ');
    effectivePrompt = `Use the image I just uploaded (${refNames}) as the base reference image. Edit and modify it according to my instructions below, keeping everything else as close to the original as possible.\n\n${prompt}`;
  }
  if (aspectRatio && aspectRatio !== '1:1') {
    effectivePrompt = `${effectivePrompt}\n\nImage requirements: aspect ratio ${aspectRatio}.`;
  }

  // Send prompt
  log(`Sending prompt (${effectivePrompt.length} chars)...`);
  await sendPrompt(effectivePrompt);

  // Wait for images
  const urls = await waitForImages(240);

  if (urls.length === 0) {
    log('No new images detected');
    return [];
  }

  // Export
  const assets = await exportImages(urls);

  if (assets.length === 0) {
    log('Image export failed');
    return [];
  }

  // Save
  const paths = saveImages(assets, outputDir);
  log(`Saved ${paths.length} image(s) to ${outputDir}`);
  return paths;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [gemini-daemon] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

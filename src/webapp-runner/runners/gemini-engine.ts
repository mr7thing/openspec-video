/**
 * gemini-engine.ts
 *
 * Standalone Gemini browser engine using Puppeteer + CDP.
 * No OpenCLI dependency. Handles browser lifecycle, login state,
 * chat interaction, reference image upload, image download.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer, { Browser, Page } from 'puppeteer';
import { uploadReferenceImage } from './gemini-cdp';

// ── Constants ──────────────────────────────────────────────────────────────

const GEMINI_APP_URL = 'https://gemini.google.com/app';
const COMPOSER_SELECTORS = [
  '.ql-editor[contenteditable="true"]',
  '.ql-editor[role="textbox"]',
  '.ql-editor[aria-label*="Gemini"]',
  '[contenteditable="true"][aria-label*="Gemini"]',
  '[aria-label="Enter a prompt for Gemini"]',
  '[aria-label*="prompt for Gemini"]',
];
const COMPOSER_MARKER_ATTR = 'data-opsv-gemini-composer';
const COMPOSER_PREPARE_ATTEMPTS = 4;
const COMPOSER_PREPARE_WAIT_MS = 1000;
const GEMINI_RESPONSE_NOISE_PATTERNS = [
  /Gemini can make mistakes\.?/gi,
  /Google Terms/gi,
  /Google Privacy Policy/gi,
  /Opens in a new window/gi,
];

// ── Singleton Browser ──────────────────────────────────────────────────────

let _browser: Browser | null = null;
let _page: Page | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;

  const browserPath = typeof (puppeteer as any).executablePath === 'function'
    ? await (puppeteer as any).executablePath()
    : undefined;

  // Use a dedicated profile dir so the user only logs in once
  const profileDir = path.join(os.homedir(), '.opsv', 'gemini-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  _browser = await puppeteer.launch({
    headless: false,
    executablePath: browserPath,
    userDataDir: profileDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
    defaultViewport: null,
  });

  console.log(`[gemini-engine] Browser launched (PID: ${_browser.process()?.pid})`);
  return _browser;
}

export async function getPage(): Promise<Page> {
  const browser = await getBrowser();
  if (_page && !_page.isClosed()) return _page;

  const pages = await browser.pages();
  _page = pages[0] || (await browser.newPage());

  return _page;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      // ignore
    }
    _browser = null;
    _page = null;
  }
}

// ── Page navigation ────────────────────────────────────────────────────────

export async function ensureGeminiPage(page: Page): Promise<void> {
  const currentUrl = page.url();
  // Only navigate if we're on a blank/empty page
  if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('chrome://')) {
    try {
      await page.goto(GEMINI_APP_URL, { waitUntil: 'load', timeout: 30000 });
    } catch {
      console.log('[gemini-engine] Gemini page load timed out (login page may be slow)');
    }
  }

  // Check if we need login — wait for a Gemini conversation page
  for (let i = 0; i < 90; i++) {  // up to 3 minutes
    const url = page.url();
    if (url.includes('accounts.google.com') || url.includes('signin') || url.includes('ServiceLogin')) {
      if (i === 0 || i % 10 === 0) {
        console.log('[gemini-engine] ⚠️  Please log in to Gemini Google in the opened browser window...');
      }
      await sleep(2000);
      continue;
    }
    if (url.includes('gemini.google.com')) {
      // Try to find a contenteditable area (the chat input)
      const hasInput = await page.evaluate(`
        (() => {
          const sel = document.querySelector('[contenteditable="true"]');
          return !!sel;
        })()
      `).catch(() => false);
      if (hasInput) {
        console.log('[gemini-engine] Gemini ready — found chat input');
        return;
      }
    }
    await sleep(2000);
  }
  console.log('[gemini-engine] WARNING: Proceeding without confirmed login — may fail');
}

// ── Start a new chat ───────────────────────────────────────────────────────

export async function startNewChat(page: Page): Promise<'click' | 'navigate'> {
  await ensureGeminiPage(page);

  const action = await page.evaluate(`
    (() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt.includes('new chat') || txt.includes('新对话') || txt.includes('新增對話')) {
          btn.click();
          return 'click';
        }
      }
      const as = document.querySelectorAll('a');
      for (const a of as) {
        const txt = (a.textContent || '').trim().toLowerCase();
        if (txt.includes('new chat') || txt.includes('新对话') || txt.includes('新增對話')) {
          a.click();
          return 'click';
        }
      }
      return 'not-found';
    })()
  `);

  if (action === 'not-found') {
    // Navigate to fresh chat
    await page.goto(GEMINI_APP_URL, { waitUntil: 'load', timeout: 30000 });
    await sleep(1000);
    return 'navigate';
  }

  await sleep(1000);
  return 'click';
}

// ── Get visible image URLs on the page ─────────────────────────────────────

export async function getVisibleImageUrls(page: Page): Promise<string[]> {
  await ensureGeminiPage(page);
  return (await page.evaluate(`
    (() => {
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 32 && rect.height > 32;
      };
      const imgs = Array.from(document.querySelectorAll('main img')).filter(
        (img) => img instanceof HTMLImageElement && isVisible(img)
      );
      const urls = [];
      const seen = new Set();
      for (const img of imgs) {
        const src = img.currentSrc || img.src || '';
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (!src) continue;
        if (alt.includes('avatar') || alt.includes('logo') || alt.includes('icon')) continue;
        if (w < 128 && h < 128) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        urls.push(src);
      }
      return urls;
    })()
  `)) as string[];
}

// ── Wait for new images after sending a prompt ─────────────────────────────

export async function waitForNewImages(
  page: Page,
  beforeUrls: string[],
  timeoutSeconds: number,
): Promise<string[]> {
  const beforeSet = new Set(beforeUrls);
  const pollInterval = 3000;
  const maxPolls = Math.max(1, Math.ceil((timeoutSeconds * 1000) / pollInterval));
  let lastUrls: string[] = [];
  let stableCount = 0;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(i === 0 ? 2000 : pollInterval);
    const urls = (await getVisibleImageUrls(page)).filter((u) => !beforeSet.has(u));
    if (urls.length === 0) continue;

    const key = urls.join('\n');
    const prevKey = lastUrls.join('\n');
    if (key === prevKey) {
      stableCount++;
    } else {
      lastUrls = urls;
      stableCount = 1;
    }

    if (stableCount >= 2 || i === maxPolls - 1) return lastUrls;
  }

  return lastUrls;
}

// ── Send a message (prompt) to Gemini ──────────────────────────────────────

export async function sendPrompt(page: Page, text: string): Promise<void> {
  await ensureGeminiPage(page);

  // Step 1: Prepare composer (find and mark it)
  let prepared: any = null;
  for (let attempt = 0; attempt < COMPOSER_PREPARE_ATTEMPTS; attempt++) {
    prepared = await page.evaluate(`
      (() => {
        const markerAttr = ${JSON.stringify(COMPOSER_MARKER_ATTR)};
        const selectors = ${JSON.stringify(COMPOSER_SELECTORS)};

        // Clear old markers
        document.querySelectorAll('[' + markerAttr + ']').forEach(el => el.removeAttribute(markerAttr));

        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) {
            el.setAttribute(markerAttr, '1');
            el.focus();
            return { ok: true };
          }
        }

        // Deep search with shadow DOM
        function deepFind(root, depth) {
          if (depth > 5) return null;
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (!(el instanceof HTMLElement)) continue;
            if (el.isContentEditable && isVisible(el)) {
              for (const sel of selectors) {
                try { if (el.matches(sel)) { el.setAttribute(markerAttr, '1'); el.focus(); return el; } } catch {}
              }
            }
            if (el.shadowRoot) {
              const found = deepFind(el.shadowRoot, depth + 1);
              if (found) return found;
            }
          }
          return null;
        }

        const found = deepFind(document, 0);
        if (found) return { ok: true };
        return { ok: false, reason: 'composer-not-found' };
      })()
    `);
    if (prepared?.ok) break;
    if (attempt < COMPOSER_PREPARE_ATTEMPTS - 1) await sleep(COMPOSER_PREPARE_WAIT_MS);
  }

  if (!prepared?.ok) {
    throw new Error(`Gemini composer not found: ${prepared?.reason || 'unknown'}`);
  }

  // Step 2: Insert text
  let hasText = false;

  // Try page.type()
  try {
    const composer = await page.$(`[${COMPOSER_MARKER_ATTR}]`);
    if (composer) {
      await composer.type(text, { delay: 10 });
      await sleep(200);
      hasText = (await page.evaluate(`
        (() => {
          const el = document.querySelector('[${COMPOSER_MARKER_ATTR}]');
          if (!el) return false;
          const text = el.textContent || el.innerText || '';
          return text.trim().length > 0;
        })()
      `)) as boolean;
    }
  } catch {
    // fall through
  }

  // Fallback: insert via innerText
  if (!hasText) {
    const inserted = await page.evaluate(`
      (() => {
        const el = document.querySelector('[${COMPOSER_MARKER_ATTR}]');
        if (!el) return false;
        el.focus();
        document.execCommand('insertText', false, ${JSON.stringify(text)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    hasText = !!inserted;
  }

  if (!hasText) {
    throw new Error('Failed to insert text into Gemini composer');
  }

  // Step 3: Submit
  const submitted = await page.evaluate(`
    (() => {
      const el = document.querySelector('[${COMPOSER_MARKER_ATTR}]');
      if (!el) return false;
      // Try pressing Enter
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return true;
    })()
  `);

  // Also try pressing Enter via page.keyboard
  try {
    await page.keyboard.press('Enter');
  } catch {
    // ignore
  }

  await sleep(1000);
}

// ── Export images (download as data URLs) ──────────────────────────────────

export interface ExportedImage {
  url: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

export async function exportImages(page: Page, urls: string[]): Promise<ExportedImage[]> {
  await ensureGeminiPage(page);
  const urlsJson = JSON.stringify(urls);

  return (await page.evaluate(`
    (async (targetUrls) => {
      const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      });

      const inferMime = (value, fallbackUrl) => {
        if (value) return value;
        const lower = String(fallbackUrl || '').toLowerCase();
        if (lower.includes('.png')) return 'image/png';
        if (lower.includes('.webp')) return 'image/webp';
        if (lower.includes('.gif')) return 'image/gif';
        return 'image/jpeg';
      };

      const images = Array.from(document.querySelectorAll('main img'));
      const results = [];

      for (const targetUrl of targetUrls) {
        const img = images.find((node) => (node.currentSrc || node.src || '') === targetUrl);
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
              mimeType = inferMime(blob.type, targetUrl);
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

        if (dataUrl) {
          results.push({ url: String(targetUrl), dataUrl, mimeType, width: w, height: h });
        }
      }

      return results;
    })(${urlsJson})
  `)) as ExportedImage[];
}

// ── High-level: Generate images (orchestration) ────────────────────────────

export async function generateImages(
  prompt: string,
  outputDir: string,
  aspectRatio = '16:9',
  referenceFiles?: string[],
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const page = await getPage();
  await ensureGeminiPage(page);

  // Start fresh chat
  await startNewChat(page);

  // Upload reference image if specified
  if (referenceFiles && referenceFiles.length > 0) {
    for (const rf of referenceFiles) {
      let absPath = rf;
      if (!path.isAbsolute(rf)) {
        const fromCwd = path.resolve(process.cwd(), rf);
        if (fs.existsSync(fromCwd)) absPath = fromCwd;
      }
      if (fs.existsSync(absPath)) {
        console.log(`[gemini-engine] Uploading reference: ${path.basename(absPath)}`);
        const result = await uploadReferenceImage(page, absPath);
        if (!result.ok) {
          console.log(`[gemini-engine] Upload warning: ${result.error}`);
        } else {
          console.log(`[gemini-engine] Upload success (method: ${result.method})`);
        }
      }
    }
  }

  // Build prompt with ratio hints
  let effectivePrompt = prompt;
  if (aspectRatio && aspectRatio !== '1:1') {
    effectivePrompt = `${prompt}\n\nImage requirements: aspect ratio ${aspectRatio}.`;
  }

  // Send prompt
  console.log(`[gemini-engine] Sending prompt (${effectivePrompt.length} chars)...`);
  const beforeUrls = await getVisibleImageUrls(page);
  await sendPrompt(page, effectivePrompt);

  // Wait for images
  console.log(`[gemini-engine] Waiting for images (timeout: 240s)...`);
  const urls = await waitForNewImages(page, beforeUrls, 240);

  if (urls.length === 0) {
    console.log(`[gemini-engine] No new images detected`);
    return [];
  }

  console.log(`[gemini-engine] Exporting ${urls.length} image(s)...`);
  const assets = await exportImages(page, urls);

  if (assets.length === 0) {
    console.log(`[gemini-engine] Image export failed`);
    return [];
  }

  // Save to disk
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

  console.log(`[gemini-engine] Saved ${imagePaths.length} image(s) to ${outputDir}`);
  return imagePaths;
}

// ── Sleep ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

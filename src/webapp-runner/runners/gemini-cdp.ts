/**
 * gemini-cdp.ts
 *
 * CDP (Chrome DevTools Protocol) upload module for Gemini.
 * Penetrates closed shadow DOMs that Puppeteer's regular API cannot access.
 *
 * Gemini uses Angular Material components (<uploader>, <images-files-uploader>)
 * with mode: 'closed' shadow DOMs. CDP's DOM.getDocument({ pierce: true })
 * can traverse these closed roots where element.shadowRoot returns null.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'puppeteer';

// ── CDP: Find file inputs via DevTools Protocol (pierces closed shadow DOM) ──

interface CdpInputNode {
  backendNodeId: number;
  nodeId: number;
  localName: string;
}

async function cdpFindFileInputs(page: Page): Promise<CdpInputNode[]> {
  try {
    const cdp = await (page as any).target().createCDPSession();
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const inputs: CdpInputNode[] = [];

    function walk(node: any): void {
      if (
        node.nodeName &&
        node.nodeName.toLowerCase() === 'input' &&
        node.attributes &&
        node.attributes.some((a: any) => a.name === 'type' && a.value === 'file')
      ) {
        inputs.push({
          backendNodeId: node.backendNodeId,
          nodeId: node.nodeId,
          localName: node.localName,
        });
      }
      if (node.children) for (const child of node.children) walk(child);
      if (node.shadowRoots) for (const shadow of node.shadowRoots) walk(shadow);
      if (node.pseudoElements) for (const pe of node.pseudoElements) walk(pe);
      if (node.contentDocument) walk(node.contentDocument);
      if (node.templateContent) walk(node.templateContent);
    }

    walk(root);
    await cdp.detach();
    return inputs;
  } catch {
    return [];
  }
}

// ── Check if an uploaded image chip is visible in the page ──

async function hasImageInPage(page: Page): Promise<boolean> {
  try {
    return (await page.evaluate(`
      (() => {
        const indicators = [
          '[data-test-id="image-chip"]', '.image-chip', '[class*="image-chip"]',
          '[class*="imageChip"]', '[class*="ImageChip"]',
          'img[class*="preview"]', 'img[class*="upload"]',
          '[class*="media"] img', '[class*="chip"] img',
          'mat-chip img', '.mat-chip img',
        ];
        for (const sel of indicators) {
          if (document.querySelector(sel)) return true;
        }
        function walkShadow(root, depth) {
          if (depth > 5) return false;
          for (const sel of indicators) {
            if (root.querySelector(sel)) return true;
          }
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot && walkShadow(el.shadowRoot, depth + 1)) return true;
          }
          return false;
        }
        return walkShadow(document, 0);
      })()
    `)) as boolean;
  } catch {
    return false;
  }
}

// ── Main upload function ──

export async function uploadReferenceImage(
  page: Page,
  absPath: string,
): Promise<{ ok: boolean; method?: string; error?: string }> {
  if (!absPath || !fs.existsSync(absPath)) {
    return { ok: false, error: `File not found: ${absPath}` };
  }
  const fileName = path.basename(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  const mimeType = mimeMap[ext] || 'image/png';

  console.log(`[cdp-upload] Starting upload for: ${fileName}, size: ${fs.statSync(absPath).size} bytes`);
  console.log(`[cdp-upload] Checking hasImageInPage before upload...`);
  const hasBefore = await hasImageInPage(page);
  console.log(`[cdp-upload] hasImageInPage before: ${hasBefore}`);

  // ── Snapshot page structure for debugging ──
  try {
    const pageInfo = (await page.evaluate(`
      (() => {
        function describe(el, depth) {
          if (depth > 4) return '';
          if (!(el instanceof HTMLElement)) return '';
          const tag = el.tagName.toLowerCase();
          const id = el.id ? '#' + el.id : '';
          const cls = Array.from(el.classList).slice(0, 3).map(c => '.' + c).join('');
          const aria = (el.getAttribute('aria-label') || '').slice(0, 40);
          const ariaStr = aria ? ' [' + aria + ']' : '';
          const txt = (el.textContent || '').trim().slice(0, 30);
          const txtStr = txt ? ' "' + txt + '"' : '';
          let s = '  '.repeat(depth) + tag + id + cls + ariaStr + txtStr;
          if (el.shadowRoot) s += ' (shadow)';
          s += '\n';
          for (const child of el.children) s += describe(child, depth + 1);
          return s;
        }
        // Focus on the main area
        const main = document.querySelector('main') || document.body;
        return describe(main, 0);
      })()
    `)) as string;
    console.log(`[cdp-upload] Page structure:\n${pageInfo}`);
  } catch (e: any) {
    console.log(`[cdp-upload] Page structure dump failed: ${e.message}`);
  }

  // ── Strategy 1: Puppeteer setFileInput on visible inputs ──
  try {
    const visibleInputs = await page.$$('input[type="file"]');
    console.log(`[cdp-upload] Strategy1: found ${visibleInputs.length} visible input[type=file] elements`);
    if (visibleInputs.length > 0) {
      await (page as any).setFileInput([absPath], visibleInputs[0]);
      await sleep(2000);
      const ok = await hasImageInPage(page);
      console.log(`[cdp-upload] Strategy1: hasImageInPage after setFileInput = ${ok}`);
      if (ok) return { ok: true, method: 'visible-input' };
    }
  } catch (e: any) {
    console.log(`[cdp-upload] Strategy1 exception: ${e.message}`);
  }

  // ── Strategy 2: Click "+" → "上传文件" → CDP/DataTransfer inject ──
  try {
    const triggerResult = (await page.evaluate(`
      (() => {
        const isVisible = (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const selectors = [
          'button[aria-label*="上传"]', 'button[aria-label*="上傳"]',
          'button[aria-label*="Upload"]', 'button[aria-label*="upload"]',
          'button[aria-label*="Add"]', 'button[aria-label*="add"]',
          'button[aria-label*="attach"]', 'button[aria-label*="Attach"]',
          'button[aria-label*="工具"]',
        ];
        for (const sel of selectors) {
          const buttons = document.querySelectorAll(sel);
          for (const btn of buttons) {
            if (isVisible(btn)) { btn.click(); return { ok: true, label: btn.getAttribute('aria-label') || sel }; }
          }
        }
        return { ok: false };
      })()
    `)) as { ok: boolean; label?: string };

    console.log(`[cdp-upload] Strategy2: triggerResult = ${JSON.stringify(triggerResult)}`);

    if (triggerResult?.ok) {
      await sleep(2000);

      // Click "上传文件" menu item, intercept file inputs
      const menuResult = (await page.evaluate(`
        (() => {
          const isVisible = (el) => {
            if (!(el instanceof HTMLElement)) return false;
            const s = window.getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const menuSelectors = ['[role="menuitem"]', '[role="option"]', 'button'];
          const uploadTexts = ['上传文件', '上傳文件', 'Upload file', 'Upload File', '文件', '檔案'];
          window.__oc_origClick = window.__oc_origClick || HTMLInputElement.prototype.click;
          window.__oc_capturedInput = null;
          HTMLInputElement.prototype.click = function() {
            if (this.type === 'file') { window.__oc_capturedInput = this; return; }
            return window.__oc_origClick.call(this);
          };
          for (const sel of menuSelectors) {
            const items = document.querySelectorAll(sel);
            for (const item of items) {
              if (!isVisible(item)) continue;
              const txt = (item.textContent || '').trim();
              const aria = (item.getAttribute('aria-label') || '').trim();
              if (uploadTexts.some(t => txt.includes(t) || aria.includes(t))) {
                item.click();
                return { ok: true, label: aria || txt };
              }
            }
          }
          return { ok: false };
        })()
      `)) as { ok: boolean; label?: string };

      if (menuResult?.ok) {
        await sleep(2000);
        console.log(`[cdp-upload] Strategy2: menu clicked "${menuResult.label}", trying CDP injection...`);

        // Try CDP injection first
        const cdpInputs = await cdpFindFileInputs(page);
        console.log(`[cdp-upload] Strategy2: cdpFindFileInputs returned ${cdpInputs.length} inputs`);
        if (cdpInputs.length > 0) {
          try {
            const cdp = await (page as any).target().createCDPSession();
            await cdp.send('DOM.setFileInputFiles', {
              files: [absPath],
              nodeId: cdpInputs[0].nodeId,
              backendNodeId: cdpInputs[0].backendNodeId,
            });
            await cdp.detach();
            await sleep(2000);
            const ok = await hasImageInPage(page);
            console.log(`[cdp-upload] Strategy2: CDP injection done, hasImageInPage = ${ok}`);
            if (ok) return { ok: true, method: 'trigger-menu-cdp' };
          } catch (e: any) {
            console.log(`[cdp-upload] Strategy2: CDP injection exception: ${e.message}`);
          }
        }

        // Fallback: DataTransfer injection
        const base64Data = fs.readFileSync(absPath).toString('base64');
        const injectResult = (await page.evaluate(
          `(async () => {
            try {
              var input = window.__oc_capturedInput;
              if (!input || !(input instanceof HTMLInputElement)) return { ok: false, error: 'no-input' };
              if (window.__oc_origClick) HTMLInputElement.prototype.click = window.__oc_origClick;
              var fileName = ${JSON.stringify(fileName)};
              var base64Data = ${JSON.stringify(base64Data)};
              var binaryStr = atob(base64Data);
              var bytes = new Uint8Array(binaryStr.length);
              for (var i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              var file = new File([bytes], fileName, { type: ${JSON.stringify(mimeType)} });
              var dt = new DataTransfer();
              dt.items.add(file);
              var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
              nativeSet.call(input, dt.files);
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return { ok: true };
            } catch(e) { return { ok: false, error: String(e) }; }
          })()`,
        )) as { ok: boolean; error?: string };
        await sleep(3000);
        const dtOk = injectResult?.ok && (await hasImageInPage(page));
        console.log(`[cdp-upload] Strategy2: DataTransfer inject result = ${JSON.stringify(injectResult)}, hasImageInPage = ${dtOk}`);
        if (injectResult?.ok && dtOk)
          return { ok: true, method: 'trigger-menu-datatransfer' };
      }
    }
  } catch (e: any) {
    console.log(`[cdp-upload] Strategy2 outer exception: ${e.message}`);
  }

  // ── Strategy 3: Global CDP scan for any file input ──
  try {
    const allInputs = await cdpFindFileInputs(page);
    console.log(`[cdp-upload] Strategy3: cdpFindFileInputs found ${allInputs.length} inputs`);
    if (allInputs.length > 0) {
      const cdp = await (page as any).target().createCDPSession();
      for (let i = 0; i < allInputs.length; i++) {
        const inp = allInputs[i];
        try {
          console.log(`[cdp-upload] Strategy3: trying input[${i}] backendNodeId=${inp.backendNodeId}`);
          await cdp.send('DOM.setFileInputFiles', {
            files: [absPath],
            nodeId: inp.nodeId,
            backendNodeId: inp.backendNodeId,
          });
          await sleep(2000);
          const ok = await hasImageInPage(page);
          console.log(`[cdp-upload] Strategy3: input[${i}] hasImageInPage = ${ok}`);
          if (ok) {
            await cdp.detach();
            return { ok: true, method: 'cdp-global' };
          }
        } catch (e: any) {
          console.log(`[cdp-upload] Strategy3: input[${i}] exception: ${e.message}`);
        }
      }
      await cdp.detach();
    }
  } catch (e: any) {
    console.log(`[cdp-upload] Strategy3 outer exception: ${e.message}`);
  }

  console.log(`[cdp-upload] All strategies failed for ${fileName}`);
  return {
    ok: false,
    error: `Failed to upload image to Gemini composer: No file input found (CDP search). File: ${fileName}`,
  };
}

// ── Sleep helper ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

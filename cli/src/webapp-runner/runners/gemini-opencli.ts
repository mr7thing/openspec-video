/**
 * Gemini OpenCLI Runner
 *
 * Drives Gemini image generation through the OpenCLI CLI subprocess layer
 * instead of raw CDP. This is the **simpler, lower-friction** path:
 *   - No Chrome CDP port binding required
 *   - No headless-vs-headed wrestling
 *   - Reuses the same Chrome + OpenCLI Browser Bridge extension the
 *     agent is already using for manual work
 *   - Reuses logged-in session automatically
 *
 * Prerequisites:
 *   1. Chrome running with OpenCLI Browser Bridge extension installed
 *   2. `opencli profile use <name>` (or auto-pick if only one profile)
 *   3. `chrome://settings/downloads` → "Ask where to save" = OFF
 *   4. Download dir is per-Chrome setting (zh-CN: ~/下载/, en: ~/Downloads/)
 *
 * Config via env:
 *   OPSV_OPENCLI_SESSION  (default: "work")
 *   OPSV_OPENCLI_BIN      (default: "opencli" — must be in PATH)
 *   OPSV_CDP_DOWNLOAD     (default: ~/下载/) — must match Chrome's setting
 *
 * Flow:
 *   opsv compile --model webapp.gemini-opencli <scene.md>
 *   opsv run <queue-dir>
 *     → WebappProvider → dispatcher (modelKey: "webapp.gemini-opencli")
 *     → runners/gemini-opencli.ts
 *     → spawn `opencli browser $SESSION ...` per step
 *     → return local image paths to pipeline (watermark + rename)
 */

import { execFile, execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';

// ── Config ──────────────────────────────────────────────────────────────────

const OPENCLI_BIN = process.env.OPSV_OPENCLI_BIN || 'opencli';
const SESSION = process.env.OPSV_OPENCLI_SESSION || 'work';
const DOWNLOAD_DIR = process.env.OPSV_CDP_DOWNLOAD || path.join(os.homedir(), '下载');
const POLL_INTERVAL_MS = 5_000;
const GENERATION_TIMEOUT_MS = 240_000;     // 4 min
const DOWNLOAD_WAIT_MS = 20_000;
const MAX_RETRIES = 3;
const CHAT_STATE_FILE = 'chat_state.json';  // written into taskInfo.queueDir

interface ChatState {
  shot: string;
  chatId: string;
  chatUrl: string;
  createdAt: string;
  updatedAt: string;
  tasks: { taskId: string; successAt: string; imagePath: string; md5: string }[];
}

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [gemini-opencli] ${msg}`);
}

// ── Subprocess Helpers ──────────────────────────────────────────────────────

interface OpenCLIResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

function runOpenCLI(args: string[], timeoutMs = 30_000): Promise<OpenCLIResult> {
  return new Promise((resolve) => {
    execFile(OPENCLI_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'utf-8',
    }, (err, stdout, stderr) => {
      const outStr = (typeof stdout === 'string' ? stdout : (stdout as any)?.toString?.() || '');
      const errStr = (typeof stderr === 'string' ? stderr : (stderr as any)?.toString?.() || '');
      resolve({
        ok: !err,
        stdout: outStr,
        stderr: errStr,
        code: (err as any)?.code || 0,
      });
    });
  });
}

function ok(result: OpenCLIResult): string {
  if (!result.ok && result.code !== 0) {
    throw new Error(`opencli ${result.code ? 'failed' : 'timed out'}: ${result.stderr.slice(0, 200) || result.stdout.slice(0, 200)}`);
  }
  return result.stdout.trim();
}

// ── Atomic Helpers ───────────────────────────────────────────────────────────

async function preflight(): Promise<void> {
  // 1. opencli on PATH
  const which = execSync(`which ${OPENCLI_BIN}`, { encoding: 'utf-8' }).trim();
  if (!which) throw new Error(`opencli binary not found: ${OPENCLI_BIN}`);
  log(`opencli binary: ${which}`);

  // 2. doctor (cheap connectivity check)
  const doctor = await runOpenCLI(['doctor'], 15_000);
  if (!doctor.ok) {
    // Doctor may exit non-zero if profile is missing; check stdout
    if (doctor.stdout.includes('Connectivity: connected')) {
      log('doctor reports connectivity OK despite non-zero exit');
    } else {
      throw new Error(`opencli doctor failed: ${doctor.stdout.slice(0, 300)}`);
    }
  }
  log('doctor OK');

  // 3. profile (auto-pick if 1 connected)
  const profileList = await runOpenCLI(['profile', 'list'], 5_000);
  if (!profileList.ok) throw new Error(`profile list failed: ${profileList.stderr.slice(0, 200)}`);
  const profileText = profileList.stdout;
  if (profileText.includes('2 profiles connected, none selected')) {
    log('Auto-picking first connected profile');
    // Try common profile names
    for (const name of ['wx6jpujj', 'default']) {
      if (profileText.includes(name)) {
        const use = await runOpenCLI(['profile', 'use', name], 5_000);
        if (use.ok) {
          log(`Selected profile: ${name}`);
          break;
        }
      }
    }
  }

  // 4. bind
  const bind = await runOpenCLI(['browser', SESSION, 'bind'], 15_000);
  if (!bind.ok) {
    if (bind.stderr.includes('already') || bind.stdout.includes('already')) {
      log(`Session "${SESSION}" already bound, continuing`);
    } else {
      throw new Error(`bind failed: ${bind.stderr.slice(0, 200) || bind.stdout.slice(0, 200)}`);
    }
  } else {
    log(`Bound to session: ${SESSION}`);
  }

  // 5. open Gemini
  await runOpenCLI(['browser', SESSION, 'open', 'https://gemini.google.com/app'], 30_000);
  log('Opened Gemini');
}

async function getURL(): Promise<string> {
  const r = await runOpenCLI(['browser', SESSION, 'eval', 'window.location.href'], 15_000);
  return ok(r);
}

// ── Chat ID Persistence ─────────────────────────────────────────────────────

function readChatState(queueDir: string): ChatState | null {
  const p = path.join(queueDir, CHAT_STATE_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function writeChatState(queueDir: string, state: ChatState): void {
  const p = path.join(queueDir, CHAT_STATE_FILE);
  state.updatedAt = new Date().toISOString();
  if (!state.createdAt) state.createdAt = state.updatedAt;
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  log(`Persisted chat state: ${state.chatId} → ${p}`);
}

async function resolveOrCreateChat(taskInfo: TaskInfo): Promise<string> {
  // 1. Task JSON has explicit chatId?
  if (taskInfo.chatId) {
    const url = `https://gemini.google.com/app/${taskInfo.chatId}`;
    log(`Reusing chat from task JSON: ${taskInfo.chatId}`);
    await openURL(url);
    await new Promise(r => setTimeout(r, 2000));
    return taskInfo.chatId;
  }

  // 2. Queue dir has chat_state.json?
  const existing = readChatState(taskInfo.queueDir);
  if (existing?.chatId) {
    log(`Reusing chat from ${CHAT_STATE_FILE}: ${existing.chatId}`);
    await openURL(`https://gemini.google.com/app/${existing.chatId}`);
    await new Promise(r => setTimeout(r, 2000));
    return existing.chatId;
  }

  // 3. Fresh chat
  log('No existing chat — starting fresh');
  await openURL('https://gemini.google.com/app');
  return '';
}

async function recordChatSuccess(taskInfo: TaskInfo, chatId: string, imagePath: string, md5: string): Promise<void> {
  if (!chatId) return;
  let state = readChatState(taskInfo.queueDir);
  if (!state) {
    state = {
      shot: path.basename(taskInfo.queueDir),
      chatId,
      chatUrl: `https://gemini.google.com/app/${chatId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [],
    };
  }
  state.chatId = chatId;
  state.chatUrl = `https://gemini.google.com/app/${chatId}`;
  state.tasks = state.tasks.filter(t => t.taskId !== taskInfo.shotId);  // dedupe on retry
  state.tasks.push({
    taskId: taskInfo.shotId,
    successAt: new Date().toISOString(),
    imagePath,
    md5,
  });
  writeChatState(taskInfo.queueDir, state);
}

// ── Retry & Chrome Kill ─────────────────────────────────────────────────────

/**
 * Detect if the page is in a "stuck" state — composer locked, picker open,
 * uploading flag still true. Used to decide whether to escalate the retry.
 */
async function isPageStuck(): Promise<boolean> {
  try {
    const state = await evalJS(`
      JSON.stringify({
        hasDialog: !!document.querySelector('mat-dialog-container, [role=dialog]'),
        fileInputFocused: [...document.querySelectorAll('input[type=file]')].some(i => i === document.activeElement),
        uploadingFlag: !!document.querySelector('.upload-progress, .upload-overlay, [data-test-id*=uploading]'),
        composerLocked: !!document.querySelector('[role=textbox][aria-disabled="true"], [role=textbox][data-sending="true"]'),
      })
    `);
    const s = JSON.parse(state);
    return s.hasDialog || s.fileInputFocused || s.uploadingFlag || s.composerLocked;
  } catch {
    return false;
  }
}

/**
 * Kill Chrome processes owned by opencli daemon. Daemon will respawn on next bind.
 * Filters out any "Brave" browser (snap/brave) and shared-client-connection children.
 */
function killOpenCLIBrowser(): number {
  try {
    // Find Chrome masters (the actual browser process, not children)
    const out = execSync(
      `ps -ef | grep -E "/opt/google/chrome/chrome( |$)" | grep -v "shared-client-connection\\|grep" || true`,
      { encoding: 'utf-8' }
    ).trim();
    if (!out) return 0;
    const pids = out.split('\n').filter(Boolean).map(line => {
      const m = line.trim().split(/\s+/);
      return parseInt(m[1], 10);
    }).filter(n => Number.isFinite(n) && n > 1);
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); log(`Killed Chrome PID ${pid}`); } catch {}
    }
    return pids.length;
  } catch (e: any) {
    log(`killOpenCLIBrowser error: ${e.message}`, 'WARN');
    return 0;
  }
}

/**
 * Retry wrapper with escalating recovery:
 *   attempt 1 → retry as-is
 *   attempt 2 → press Escape + verify
 *   attempt 3 → reopen URL (kills tab)
 *   attempt 4 → kill Chrome + preflight (last resort)
 */
async function retryOnFailure<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) log(`Recovered on attempt ${attempt}`, 'INFO');
      return result;
    } catch (e: any) {
      lastErr = e;
      log(`Attempt ${attempt}/${MAX_RETRIES} for ${label} failed: ${e.message}`, 'WARN');
      if (attempt >= MAX_RETRIES) break;

      // Escalating recovery between attempts
      const stuck = await isPageStuck().catch(() => false);
      if (stuck) {
        if (attempt === 1) {
          log('Page stuck — pressing Escape × 2 + reload', 'WARN');
          await runOpenCLI(['browser', SESSION, 'keys', 'Escape'], 5_000);
          await new Promise(r => setTimeout(r, 1500));
          await runOpenCLI(['browser', SESSION, 'keys', 'Escape'], 5_000);
          await new Promise(r => setTimeout(r, 1500));
          const url = await getURL().catch(() => 'https://gemini.google.com/app');
          await openURL(url);
          await new Promise(r => setTimeout(r, 3000));
        } else {
          log('Page stuck — killing Chrome + re-preflight', 'WARN');
          const killed = killOpenCLIBrowser();
          await new Promise(r => setTimeout(r, 5000));
          await preflight();
          log(`Killed ${killed} Chrome process(es), re-bound`);
        }
      } else {
        // Not stuck — just transient. Sleep and retry.
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  throw lastErr!;
}

async function evalJS(expression: string): Promise<any> {
  const r = await runOpenCLI(['browser', SESSION, 'eval', expression], 15_000);
  return ok(r);
}

async function findByName(name: string): Promise<number | null> {
  const r = await runOpenCLI(['browser', SESSION, 'find', '--name', name], 10_000);
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.stdout);
    if (data.matches_n > 0) return data.entries[0].ref;
  } catch { /* fall through */ }
  return null;
}

async function findByCSS(css: string): Promise<number | null> {
  const r = await runOpenCLI(['browser', SESSION, 'find', '--css', css], 10_000);
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.stdout);
    if (data.matches_n > 0) return data.entries[0].ref;
  } catch { /* fall through */ }
  return null;
}

async function clickRef(ref: number): Promise<void> {
  const r = await runOpenCLI(['browser', SESSION, 'click', String(ref)], 10_000);
  if (!r.ok) throw new Error(`click ${ref} failed: ${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`);
}

async function clickSelector(css: string): Promise<void> {
  const r = await runOpenCLI(['browser', SESSION, 'click', css], 10_000);
  if (!r.ok) throw new Error(`click ${css} failed: ${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`);
}

async function uploadFiles(ref: number, files: string[]): Promise<void> {
  // Strategy: JS DataTransfer injection (bypasses OS file picker)
  //  - We CANNOT inline the full base64 in a single eval call (E2BIG, line-length limits)
  //  - Instead, we chunk-assemble a base64 string on `window` via many small evals
  //  - Then a final eval decodes it into File objects and assigns to input.files
  //  - This NEVER clicks the input → no OS native file chooser dialog → no composer lock
  log(`Injecting ${files.length} file(s) via chunked DataTransfer (bypass OS picker)`);

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    const buf = fs.readFileSync(f);
    const b64 = buf.toString('base64');
    const fname = path.basename(f);
    const slot = `__upload_b64_${fi}`;

    // Reset the slot to empty
    await runOpenCLI(['browser', SESSION, 'eval', `window['${slot}']=''; 'reset'`], 5_000);

    // Chunk-assemble: each eval appends a chunk to window[slot]
    // ARG_MAX is ~128 KiB on Linux, leave headroom for command wrapping
    const CHUNK = 60_000;
    for (let off = 0; off < b64.length; off += CHUNK) {
      const piece = b64.slice(off, off + CHUNK);
      // Wrap in single quotes; need to escape backslashes and single quotes for JS literal
      const escaped = piece.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const expr = `window['${slot}'] += '${escaped}'; 'ok'`;
      const r = await runOpenCLI(['browser', SESSION, 'eval', expr], 10_000);
      if (!r.ok) throw new Error(`chunk ${off} for ${fname} failed: ${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`);
    }
    log(`Assembled ${fname} (${b64.length} b64 chars) into window['${slot}']`);
  }

  // Final eval: decode all slots into File objects, build DataTransfer, inject
  const slots = files.map((_, i) => `__upload_b64_${i}`);
  const names = files.map(f => path.basename(f));
  const finalScript = `
    (() => {
      const slots = ${JSON.stringify(slots)};
      const names = ${JSON.stringify(names)};
      const input = document.querySelector('input[type=file]');
      if (!input) return JSON.stringify({ ok: false, reason: 'no input' });
      const files = [];
      for (let i = 0; i < slots.length; i++) {
        const b64 = window[slots[i]];
        if (!b64) { return JSON.stringify({ ok: false, reason: 'empty slot ' + slots[i] }); }
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        files.push(new File([bytes], names[i], { type: 'image/png' }));
      }
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Cleanup slots
      for (const s of slots) delete window[s];
      return JSON.stringify({ ok: true, count: files.length });
    })()
  `;
  const final = await runOpenCLI(['browser', SESSION, 'eval', finalScript], 30_000);
  log(`Final injection stdout: ${final.stdout.slice(0, 200)}`);

  let result: any = null;
  try {
    // OpenCLI may wrap in JSON envelope; the script returns a JSON string
    const inner = JSON.parse(final.stdout.trim());
    result = typeof inner === 'string' ? JSON.parse(inner) : inner;
  } catch (e: any) {
    throw new Error(`Final injection parse failed: ${e.message} | stdout: ${final.stdout.slice(0, 300)}`);
  }

  if (!result || !result.ok) {
    throw new Error(`DataTransfer injection failed: ${JSON.stringify(result)}`);
  }
  log(`Injected ${result.count} file(s) via DataTransfer`);
}

async function typeText(ref: number, text: string): Promise<void> {
  const r = await runOpenCLI(['browser', SESSION, 'type', '--role', 'textbox', text], 30_000);
  if (!r.ok) throw new Error(`type failed: ${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`);
}

async function openURL(url: string): Promise<void> {
  const r = await runOpenCLI(['browser', SESSION, 'open', url], 30_000);
  if (!r.ok) throw new Error(`open ${url} failed: ${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`);
}

// ── Pipeline Steps ──────────────────────────────────────────────────────────

async function resetChat(): Promise<void> {
  // Check current URL
  const url = await getURL();

  // If on a chat URL, navigate to /app to start fresh
  if (url.includes('/app/') && !url.endsWith('/app')) {
    log('Resetting chat — opening fresh /app');
    await openURL('https://gemini.google.com/app');
  }

  // Wait for composer to be ready
  await runOpenCLI(['browser', SESSION, 'wait', 'selector', '[role=textbox][contenteditable=true]'], 30_000);

  // If still in video mode (Omni), click new chat one more time
  const inVideoMode = await evalJS(
    'document.querySelector("media-gen-zero-state, media-gen-zero-state-shell") !== null'
  );
  if (inVideoMode === 'true') {
    log('In video mode — clicking 新对话 to reset');
    // Click the link to /app
    const newChatRef = await findByName('新对话');
    if (newChatRef) {
      await clickRef(newChatRef);
    } else {
      // Fallback: open a fresh /app
      await openURL('https://gemini.google.com/app');
    }
    await runOpenCLI(['browser', SESSION, 'wait', 'selector', '[role=textbox][contenteditable=true]'], 30_000);
  }
  log('Chat reset complete');
}

async function uploadRefs(refs: string[]): Promise<void> {
  if (refs.length === 0) return;

  // Resolve to absolute paths
  const resolved: string[] = [];
  for (const rf of refs) {
    let p = rf;
    if (!path.isAbsolute(p)) {
      const fromCwd = path.resolve(process.cwd(), p);
      if (fs.existsSync(fromCwd)) p = fromCwd;
    }
    if (!fs.existsSync(p)) {
      log(`Reference file not found, skipping: ${rf}`, 'WARN');
      continue;
    }
    resolved.push(p);
  }
  if (resolved.length === 0) {
    throw new Error(`All reference files not found: ${refs.join(', ')}`);
  }

  log(`Uploading ${resolved.length} ref(s): ${resolved.map(r => path.basename(r)).join(', ')}`);

  // 1. Click "上传和工具"
  const uploadRef = await findByName('上传和工具');
  if (!uploadRef) throw new Error('Upload button "上传和工具" not found');
  await clickRef(uploadRef);
  await new Promise(r => setTimeout(r, 1500));

  // 2. Click first menuitem (CDK overlay pane button)
  await evalJS(
    'document.querySelectorAll(".cdk-overlay-pane button")[0]?.click()'
  );
  await new Promise(r => setTimeout(r, 1500));

  // 3. Find file input and upload
  const inputRef = await findByCSS('input[type=file]');
  if (!inputRef) throw new Error('File input not found after menuitem click');
  await uploadFiles(inputRef, resolved);

  // 4. CRITICAL: Close any open file picker / file input
  // — without this, composer stays locked in `sending: true` state
  // — multiple uploads stack file picker dialogs on top of each other
  // We try three mechanisms in order, each stronger than the last:
  //   (a) Press Escape via opencli's real keyboard command (`keys Escape`)
  //       — this is the documented way; `press` is NOT a valid opencli subcommand
  //   (b) Clear the input value + blur, click body to release focus
  //   (c) Reload the page (last-resort — nukes any OS-level picker too)
  // The page reload means we'll re-call resetChat on the next iteration;
  // for now, the runner will detect state and skip re-uploading if refs are
  // already attached.
  await runOpenCLI(['browser', SESSION, 'keys', 'Escape'], 5_000);
  await evalJS(`
    (() => {
      const input = document.querySelector('input[type=file]');
      if (input) { try { input.value = ''; } catch(e){} }
      document.body.click();
      if (input) input.blur();
      return 'cleared';
    })()
  `);
  // Second Escape in case the first only dismissed the file input highlight
  await runOpenCLI(['browser', SESSION, 'keys', 'Escape'], 5_000);
  await new Promise(r => setTimeout(r, 1500));

  // 5. Verify composer is unlocked (no stuck `sending: true`, no dialog open)
  const composerState = await evalJS(`
    JSON.stringify({
      hasDialog: !!document.querySelector('mat-dialog-container, [role=dialog]'),
      fileInputOpen: [...document.querySelectorAll('input[type=file]')].some(i => i.matches(':focus') || i === document.activeElement),
      uploadingFlag: !!document.querySelector('.upload-progress, .upload-overlay, [data-test-id*=uploading]'),
    })
  `);
  log(`Composer state after upload: ${composerState}`);

  // 6. If still locked, hard-reload the page (kills any OS-level picker)
  if (composerState.includes('"hasDialog":true') || composerState.includes('"fileInputOpen":true') || composerState.includes('"uploadingFlag":true')) {
    log('Composer still locked after cleanup — reloading page to kill OS picker', 'WARN');
    const currentUrl = await getURL();
    await openURL(currentUrl);
    await new Promise(r => setTimeout(r, 3000));
    // Re-reset chat after reload
    await resetChat();
  }

  await new Promise(r => setTimeout(r, 1000));
  log('Upload complete');
}

async function sendPrompt(prompt: string): Promise<string> {
  log(`Sending prompt (${prompt.length} chars)`);

  // Type into composer
  await typeText(0, prompt);  // 0 = --role textbox flag handles selector
  await new Promise(r => setTimeout(r, 500));

  // Click send
  const sendRef = await findByName('发送');
  if (!sendRef) throw new Error('Send button "发送" not found');
  await clickRef(sendRef);

  // Wait for URL to jump to /app/{chatId}
  // The URL jumps within ~3-10s of click if prompt went through. We poll up to 20s.
  let chatUrl = '';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    chatUrl = await getURL();
    // /app/{hex_id} is a "real" chat URL — /app alone (or with trailing slash) is the landing page
    if (chatUrl.match(/\/app\/[a-f0-9]{8,}/)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  log(`Chat URL after send: ${chatUrl}`);

  if (!chatUrl.match(/\/app\/[a-f0-9]{8,}/)) {
    throw new Error(
      `Send button clicked but URL did not jump to /app/{chatId} within 20s. ` +
      `Current URL: ${chatUrl}. Likely causes: OS file picker still stealing focus, ` +
      `composer in sending:true state, or Gemini rejected prompt (e.g. video mode).`
    );
  }

  return chatUrl;
}

async function waitForImages(): Promise<number> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  // Pre-encode the alt substring for the alt*='…' selector (single-quoted attribute matcher)
  const aiAlt = 'AI 生成';
  while (Date.now() < deadline) {
    const r = await evalJS(
      `document.querySelectorAll("img[alt*='${aiAlt}']").length`
    );
    const count = parseInt(r, 10);
    if (count > 0) {
      // Wait for naturalWidth > 0 (image actually loaded)
      await new Promise(res => setTimeout(res, 3000));
      const ready = await evalJS(
        `(function(){var imgs=document.querySelectorAll("img[alt*='${aiAlt}']");var n=0;imgs.forEach(function(i){if(i.naturalWidth>=512)n++;});return n;})()`
      );
      if (parseInt(ready, 10) >= count) return count;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return 0;
}

async function downloadImages(): Promise<string[]> {
  // Snapshot before
  const before = new Set(fs.existsSync(DOWNLOAD_DIR)
    ? fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.png') && !f.includes(' (') && !f.startsWith('.'))
    : []);

  // Find download buttons
  const DL_LABEL = '下载完整尺寸的图片';
  const btnCountStr = await evalJS(
    'document.querySelectorAll("button[aria-label=\\"' + DL_LABEL + '\\"]").length'
  );
  const btnCount = parseInt(btnCountStr, 10);
  log(`Found ${btnCount} download button(s)`);

  if (btnCount === 0) {
    // Try alternative selector
    const altCount = await evalJS(
      '[...document.querySelectorAll("button")].filter(b => b.getAttribute("aria-label")?.includes("下载")).length'
    );
    if (parseInt(altCount, 10) === 0) {
      throw new Error('No download buttons found — generation may have failed');
    }
  }

  const saved: string[] = [];
  for (let i = 0; i < btnCount; i++) {
    // Click via JS (CDP click on icon button is fragile)
    await evalJS(
      '[...document.querySelectorAll("button")].filter(b => b.getAttribute("aria-label")?.includes("' + DL_LABEL + '")).pop()?.click()'
    );
    await new Promise(r => setTimeout(r, 1500));

    // Wait for new file to appear
    const dl = await waitForNewDownload(before);
    if (dl) {
      saved.push(dl);
      before.add(path.basename(dl));
    }
  }

  // Final cleanup pass
  if (saved.length === 0) {
    log('No download detected yet, waiting additional 10s...');
    await new Promise(r => setTimeout(r, 10_000));
    const dl = await waitForNewDownload(before);
    if (dl) saved.push(dl);
  }

  log(`Downloaded ${saved.length} image(s)`);
  return saved;
}

async function waitForNewDownload(before: Set<string>): Promise<string | null> {
  const deadline = Date.now() + DOWNLOAD_WAIT_MS;
  while (Date.now() < deadline) {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    const current = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.png') && !f.includes(' (') && !f.startsWith('.'));
    const newFiles = current.filter(f => !before.has(f));
    if (newFiles.length > 0) {
      // Pick newest
      const newest = newFiles.map(f => ({ name: f, mtime: fs.statSync(path.join(DOWNLOAD_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0];
      const full = path.join(DOWNLOAD_DIR, newest.name);
      const size = fs.statSync(full).size;
      if (size > 1000) {
        const md5 = require('crypto').createHash('md5').update(fs.readFileSync(full)).digest('hex');
        log(`Downloaded: ${newest.name} (${(size / 1024 / 1024).toFixed(2)}MB, md5:${md5.slice(0, 8)})`);
        return full;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  Main Runner
// ════════════════════════════════════════════════════════════════════════════

export async function run(taskInfo: TaskInfo): Promise<RunnerResult> {
  const { shotId, prompt, referenceFiles } = taskInfo;

  if (!prompt) {
    return { status: 'failed', images: [], error: 'Empty prompt' };
  }

  log(`=== ${shotId} ===`);
  log(`Prompt: ${prompt.length} chars`);
  if (referenceFiles?.length) {
    log(`Refs: ${referenceFiles.map(r => path.basename(r)).join(', ')}`);
  }
  if (taskInfo.chatId) log(`task JSON chatId hint: ${taskInfo.chatId}`);

  try {
    return await retryOnFailure(async () => {
      // 1. Pre-flight: doctor, profile, bind, open
      await preflight();

      // 2. Resolve chat: explicit > manifest > fresh
      const reusedChatId = await resolveOrCreateChat(taskInfo);
      if (!reusedChatId) {
        // Fresh chat — wait for composer + verify not in video mode
        await resetChat();
      } else {
        // Existing chat — just wait for composer to be ready
        await runOpenCLI(['browser', SESSION, 'wait', 'selector', '[role=textbox][contenteditable=true]'], 30_000);
        log(`Reused chat ready: ${reusedChatId}`);
      }

      // 3. Upload refs (chunked DataTransfer, bypasses OS picker)
      if (referenceFiles?.length) {
        await uploadRefs(referenceFiles);
      }

      // 4. Send prompt — this returns the chatUrl we should reuse next time
      const chatUrl = await sendPrompt(prompt);
      const newChatId = chatUrl.match(/\/app\/([a-f0-9]+)/)?.[1] || reusedChatId;

      // 5. Wait for generation
      log('Waiting for Gemini to generate...');
      const imgCount = await waitForImages();
      log(`Generated ${imgCount} image(s)`);
      if (imgCount === 0) {
        const errText = await evalJS('document.querySelector("#chat-history")?.innerText?.slice(-300) || ""').catch(() => '');
        if (errText.includes("can't make") || errText.includes('video')) {
          throw new Error(`Gemini refused: "${errText.slice(0, 100)}" — likely in video mode`);
        }
        throw new Error(`No images after ${GENERATION_TIMEOUT_MS / 1000}s`);
      }

      // 6. Download
      log('Downloading images...');
      const rawImages = await downloadImages();
      if (rawImages.length === 0) {
        throw new Error('Download produced no files');
      }

      // 7. Persist chatId + per-image metadata for next tasks to reuse
      for (const imgPath of rawImages) {
        const md5 = require('crypto').createHash('md5').update(fs.readFileSync(imgPath)).digest('hex');
        await recordChatSuccess(taskInfo, newChatId, imgPath, md5);
      }

      log(`=== ${shotId} complete: ${rawImages.length} image(s), chatId=${newChatId} ===`);
      return { status: 'success', images: rawImages, error: null };
    }, shotId);
  } catch (e: any) {
    log(`FAILED after retries: ${e.message}`, 'ERROR');
    return { status: 'failed', images: [], error: e.message };
  }
}

// ── Standalone CLI (for testing/debugging) ──────────────────────────────────

if (require.main === module) {
  (async () => {
    const taskPath = process.argv[2];
    if (!taskPath) {
      console.error('Usage: npx ts-node gemini-opencli.ts <task.json>');
      process.exit(1);
    }
    const { parseTask } = await import('../core/task');
    const taskInfo = parseTask(taskPath);
    const result = await run(taskInfo);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'success' ? 0 : 1);
  })();
}

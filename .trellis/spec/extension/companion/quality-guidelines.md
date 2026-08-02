# Extension Quality Guidelines

> Conventions and fragile areas for `extension/`. Plain JavaScript — no TypeScript, no bundler, no linter, no tests. Discipline is entirely by convention.

---

## Conventions

- **Module pattern**: classic scripts. `content.js` and `main-world-bridge.js` are IIFEs (guarded by `window.hasOpsVContentScript` against double-injection); `sidepanel.js` and `background.js` are top-level script scope; `native-host.js` is Node CommonJS. Do not introduce ES modules or a bundler without a dedicated plan.
- **Naming**: camelCase functions/vars; message types `SCREAMING_SNAKE_CASE`; private-ish fields underscore-prefixed (`_originalPrompt`, `_batchColorIdx`). Job wire fields are snake_case (see [Message Protocols](./message-protocols.md)).
- **Async**: `async/await` in the extension; polling loops (`while Date.now()-start < timeout` + `sleep(ms)`) are the dominant synchronization primitive; the daemon uses callbacks and sync `fs`.
- **Style**: 2-space indent; section banners `// ── Title ──`; dated change markers (`// CHANGED 2026-06-22: ...`) are the local habit for risky edits. Comments mix Chinese and English; new comments in English.
- **UI**: no framework; innerHTML template strings with programmatically bound listeners — deliberate, because MV3 CSP forbids inline handlers. Do not add inline `onclick` attributes.
- **Logging**: `remoteLog(...)` (duplicated in `content.js` and `sidepanel.js`) — console + fire-and-forget `REMOTE_LOG`, wrapped so logging can never throw. Use it instead of bare `console.log` in content/sidepanel code.

## New Code Rules

- `content.js` (~1650 lines) and `sidepanel.js` (~1840 lines) are already too big, mixing networking, state machine, DOM heuristics, and rendering. **New features go in new classic-script files** loaded via manifest/HTML, not appended to these two.
- `watermark-engine.js` is a vendored bundle from another project. **Never hand-edit it.** Exposed surface is only `window.WatermarkEngine` and `window.canvasToBlob`.
- Respect state ownership ([Architecture](./architecture.md)): no scheduling in the daemon, no queue state in background.js/content.js.
- `alert()`/`confirm()` is the current UI-error pattern in the sidepanel; acceptable for now, but don't spread it to new flows that can render inline.

## Fragile Areas (handle with care)

1. **Upload path is known-broken at HEAD.** All three in-page upload strategies fail against current Gemini; direction is CDP/OpenCLI trusted input. Read `extension/docs/gemini-upload-mechanism.md` before touching `uploadViaDragDrop`, `main-world-bridge.js`, or manifest `content_scripts`.
2. **Brittle DOM coupling**: heuristic selectors, class-substring matching (`[class*="chip"]`), hard-coded English+Chinese aria-labels (`"发送消息"`, `"上传和工具"`) for a SPA that changes often. Isolate new heuristics in named strategy functions so they can be swapped.
3. **Timing-based readiness**: content-script readiness uses fixed backoffs (`[1500, 3000, 5000]`) rather than a handshake (TODO I2). Prefer handshake-style checks (`CONTENT_READY`) in new code.
4. **Duplicate state mutation**: recovery logic is spread across three files (`checkRecovery`, refresh watcher, `SYNC_QUEUE` handler) with overlapping responsibilities. Consolidate rather than add a fourth path.
5. **`watermark_removal` flag is plumbed through every layer but nothing consumes it** (`processWatermarkIfEnabled` is defined, never called). Wire it up or remove it — don't add more dead plumbing.

## Known Bugs (visible in code, not yet fixed)

- `content.js` logs `$_opsvDragPreCheck` — an undefined variable baked into a template string.
- `sidepanel.js` uses an implicit global `event` in the prompt-editor code.
- `sidepanel.js` "Clear Done" filters status `'completed'` but jobs use `'done'` — it clears the wrong set.
- Dead `try/require` block in `sidepanel.js` ("Sidepanel can't require").

When you fix one of these, remove it from this list.

## Security Posture (documented, deliberate — tighten only by decision)

- Daemon HTTP has `Access-Control-Allow-Origin: *`; `/files` serves paths the client requests (anchored to `currentQueueDir` for relative paths); `/agent/cmd` has a type whitelist but no auth; base64 payloads cross WS/IPC unbounded.
- This is a localhost-only tool; do not expose these ports beyond `127.0.0.1` without adding auth first.

## Verification

No automated tests. Manual verification loop:

1. Load unpacked at `chrome://extensions`; click the toolbar action to open the side panel.
2. Start the daemon: `cd cli && npm run daemon`.
3. Drive scenarios through the opsv CLI (`webapp` provider).
4. Debug aids: `REMOTE_LOG` piped into daemon stdout, `/tmp/opsv-reports/agent-requests.log`, `POST /agent/state` snapshots.

`extension/PLAN-v5.4.md` §6 lists the intended end-to-end scenarios (CLI → extension → Gemini → `INCREMENTAL_RESULT` → CLI; modified-prompt iteration; multi-task concurrency).

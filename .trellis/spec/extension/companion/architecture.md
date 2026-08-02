# Extension Architecture

> Runtime topology of the Chrome extension + companion daemon. Plain JavaScript, no build step, no framework, no ES modules.

---

## Components

| File | Lines | Runtime context | Owns |
|------|------:|----------------|------|
| `manifest.json` | — | MV3 manifest | Permissions (`sidePanel`, `activeTab`, `scripting`, `storage`, clipboard), host access to `gemini.google.com`, `ws://127.0.0.1:3061-3065`, `http://127.0.0.1:9700` |
| `background.js` | ~80 | MV3 service worker | Message ACK/forwarding hub only. No state. |
| `content.js` | ~1650 | Content script (isolated world) on gemini.google.com | All Gemini DOM automation: job execution, upload strategies, result extraction |
| `main-world-bridge.js` | ~63 | Content script | Intended main-world file-input patch. **Currently dead code** — nothing sends it `PATCH_INPUT_CLICK` |
| `sidepanel.js` + `sidepanel.html` | ~1840 + ~775 | Side panel page | Queue UI, batch state machine, WS client. **The single source of truth for queue/batch state.** |
| `native-host.js` | ~560 | Standalone Node daemon (CommonJS) | IPC↔WS relay + static file server. **Despite the name, NOT a Chrome Native Messaging host.** Started via `npm run daemon` in `cli/` |
| `watermark-engine.js` | ~1016 | Classic script loaded by `sidepanel.html` | Gemini watermark removal. **Vendored bundle from another project — do not hand-edit.** Exposes only `window.WatermarkEngine` and `window.canvasToBlob` |

## State Ownership Rules (from `PLAN-v5.4.md`)

These are the rules most often violated — follow them strictly:

1. **sidepanel.js is the single source of truth** for prompts, attachments, queue, and batch state. Module-level `let` variables at `sidepanel.js` top (`queuedJobs`, `batches`, `activeBatchId`, `currentJob`, …).
2. **The daemon is a pure relay** (纯中继). It does no scheduling, no queue logic — it relays IPC↔WS, serves files, persists results to disk.
3. **content.js does page automation only.** No queue decisions.
4. **The CLI is the task source** and owns iterate logic (creates `task_mN.json`, never overwrites).

Consequences:

- All queue/batch state lives in sidepanel memory and is **lost on panel close**; recovery relies on the daemon replaying `lastSyncPayload` on WS reconnect plus `checkRecovery()` scraping the Gemini page. Do not add state to background.js or the daemon that belongs in the sidepanel.
- `chrome.storage.local` currently holds exactly one key (`removeWatermark`). Anything more durable than a UI toggle should go through the CLI's document model, not extension storage.
- Manual edits in the UI are tracked as `_originalPrompt/_modifiedPrompt/_originalRefs/_modifiedRefs` on the job object — "every manual edit = automatic iteration". Preserve this tracking when touching job shapes.

## Daemon Servers (`native-host.js`)

| Server | Endpoint | Purpose |
|--------|----------|---------|
| HTTP :9700 | `/health`, `/agent/cmd`, `/agent/state`, `/files/<path>` | Port discovery, whitelisted agent-command relay, state dumps, static file serving |
| WebSocket :3061 | — | Sidepanel clients; replays `lastSyncPayload` on connect |
| Unix socket `/tmp/opsv-gemini.sock` (named pipe on Windows) | newline-delimited JSON | CLI ↔ daemon: `ping`, `status`, `generate`, `sync` |

`WORKSPACE_ROOT` resolves to the repo root; `findTaskDir` walks it (skipping `.git`/`node_modules`/`dist`) to locate task directories for saving results. Reports go to `/tmp/opsv-reports/`.

## Content Script Worlds

Manifest-injected content scripts **run in the isolated world** — `manifest.json` sets no `world: "MAIN"`. This is why the Strategy-3 inline `<script>` injection in `content.js` cannot patch the page's real `HTMLInputElement.prototype` (isolated-world prototypes differ from main-world ones). The full analysis is in `extension/docs/gemini-upload-mechanism.md`. Any fix involving main-world patching must use `world: "MAIN"` script registration or CDP — do not assume manifest content scripts reach the main world.

## Relationship to the CLI

The CLI side of this channel lives in `cli/src/webapp-runner/` (runners `gemini.ts`, `gemini-cdp.ts`, `gemini-opencli.ts`). The extension is the execution backend for the `webapp` provider. Field naming crosses a boundary here: camelCase (`referenceFiles`) on the IPC socket, snake_case (`reference_files`) inside the extension — normalized in `native-host.js`. Keep that normalization in one place.

Reference files: `extension/manifest.json`, `extension/PLAN-v5.4.md`, `extension/docs/gemini-upload-mechanism.md`.

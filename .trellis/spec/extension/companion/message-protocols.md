# Extension Message Protocols

> Four distinct channels connect CLI, daemon, sidepanel, background, and content script. Message types are `SCREAMING_SNAKE_CASE` strings. When you add a message: name it consistently, handle it at exactly one authoritative place, and update this file.

---

## Channel A: `chrome.runtime` messages (content ↔ background ↔ sidepanel)

| Message | Direction | Payload | Notes |
|---------|-----------|---------|-------|
| `REMOTE_LOG` | content → background → sidepanel | `{message}` | Fire-and-forget logging pipe; sidepanel forwards to WS as `{type:'LOG'}` |
| `CONTENT_READY` | content → background | `{isFreshLoad, url, ts}` | Boot signal |
| `CONV_URL_CHANGED` | content → background → sidepanel (re-broadcast) | `{convId, url, ts, source}` | SPA navigation tracking |
| `GEMINI_TAB_READY` | content → background → sidepanel (re-broadcast) | `{url, convId, ts}` | Fresh-conversation probe |
| `FOCUS_TAB` | sidepanel → background | — | Tab focusing |
| `ASSET_SAVED` | content → sidepanel (direct broadcast) | `{shotId, paths, base64Data}` | Job result |
| `JOB_FAILED` | content → sidepanel (direct broadcast) | `{shotId, error}` | Job failure; user stop is `Error('Stopped by user')` gated by the `isStopped` flag |
| `EXECUTE_JOB` | sidepanel → content (`chrome.tabs.sendMessage`) | `{job: {id, prompt, reference_files, watermark_removal, _original, _modified}}` | 3-attempt backoff `[1500, 3000, 5000]` |
| `STOP_JOB`, `CHECK_RESPONSE`, `CHECK_LAST_IMAGE`, `INJECT_PROMPT`, `INJECT_REF_IMAGE`, `INJECT_ALL` | sidepanel → content | varies | Manual intervention commands |

Async `onMessage` handlers must `return true` to keep `sendResponse` valid.

## Channel B: WebSocket JSON (sidepanel ↔ daemon :3061)

- daemon → sidepanel: `NEW_JOB {job}`, `SYNC_QUEUE {jobs}`, `FINAL_ASSET_SAVED`, `INCREMENTAL_SAVED`, and agent-command relays `CONTINUE_BATCH`, `DENY_BATCH`, `STOP_BATCH_ACK`, `GET_STATE`, `LIST_BATCHES`.
- sidepanel → daemon: `LOG`, `JOB_STARTED`, `ASSET_SAVED` (carries `originalPrompt/modifiedPrompt/originalRefs/modifiedRefs`), `JOB_FAILED`, `INCREMENTAL_RESULT {shotId, fileName, dataUrl, ...}`, `OPSV_REPORT {batchId, done, failed, elapsedSec}`.
- **Agent handshake protocol** (sidepanel → daemon, see `sidepanel.js` batch section): `BATCH_REQUEST_RUN` → `BATCH_READY` → `BATCH_RETRY {attempt, maxAttempts}` → `BATCH_DONE` / `BATCH_ESCALATE` / `BATCH_STOP_REQUEST`. Batch states: `queued → gating → ready → running → done/partial/failed/denied/escalated/stopped`. This handshake is the stable contractual surface of the extension — do not bypass it from new code.

## Channel C: HTTP (sidepanel/CLI ↔ daemon :9700)

`GET /health` (returns `wsPort` for WS discovery), `GET /files/...` (static serving), `POST /agent/cmd` (whitelisted command types only), `POST /agent/state` (state dump to `/tmp/opsv-reports/sidepanel-state.json`).

## Channel D: IPC socket (CLI ↔ daemon, newline-delimited JSON)

`ping`/`pong`, `status`, `generate {shotId, prompt, referenceFiles, watermarkRemoval}` → later `task_result {status, imageUrl|error}` (5-min waiter keyed by shotId), `sync {queueDir, jobs[]}` → `ack`, plus `incremental_result` pushes.

## Protocol Rules

- **Case boundary**: camelCase on the IPC socket (`referenceFiles`), snake_case inside the extension (`reference_files`, `watermark_removal`, `result_files`). Normalization happens once in `native-host.js` — do not re-normalize elsewhere or mix cases on the same channel.
- **Fire-and-forget is the norm** (`chrome.runtime.sendMessage(...).catch(() => {})`): logging and notifications must never throw. But do not extend this to messages where the sender needs the result — those use `sendResponse` or the IPC waiter map.
- **Handle each message once.** Known wart: `CONV_URL_CHANGED`/`GEMINI_TAB_READY` are handled twice in `sidepanel.js` (WS `handleMsg` switch and the runtime listener), and both paths mutate batch state. New handlers must have a single authoritative site.
- **Known dead messages**: `OPEN_SIDEPANEL` (sent, no handler), `CONTENT_BOOTSTRAP_BRIDGE` (explicit no-op hook in `background.js`). Do not build on them.

Reference files: `extension/background.js`, `extension/sidepanel.js`, `extension/content.js`, `extension/native-host.js`, `extension/PLAN-v5.4.md` (message format definitions).

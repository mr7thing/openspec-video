# Extension Guidelines

> Coding guidelines for `extension/` — the "OpenSpec-Video Companion" Chrome extension (Manifest V3, plain JavaScript, no build step) plus its companion Node daemon. It automates gemini.google.com as a fallback "webapp" provider for the opsv CLI.
>
> **Note**: `extension/` is a **git submodule** (`opsv-chrome-extgension`). Commits there belong to a separate repository.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Architecture](./architecture.md) | Component roles, state ownership, runtime topology |
| [Message Protocols](./message-protocols.md) | The four message channels and their contracts |
| [Quality Guidelines](./quality-guidelines.md) | Conventions, fragile areas, known bugs, security posture |

---

## Before You Code In `extension/`

1. Read [Architecture](./architecture.md) — state ownership rules are the most violated thing here (sidepanel is the single source of truth; the daemon is a pure relay).
2. If you add or change a message type, read [Message Protocols](./message-protocols.md) and update both ends plus this spec.
3. There are **no automated tests and no build step** — verification is manual (load unpacked at `chrome://extensions`, run the daemon, drive via CLI). See [Quality Guidelines](./quality-guidelines.md#verification).

## Current Direction (read before changing upload code)

The extension is mid-pivot. The Gemini upload path (in-page DOM tricks) is **known-broken at HEAD** and migrating to CDP/OpenCLI trusted input events. The authoritative investigation is `extension/docs/gemini-upload-mechanism.md`; the target architecture is `extension/PLAN-v5.4.md`. Treat the message protocols and state ownership as the stable surface; treat Gemini DOM heuristics as volatile and isolate them behind swappable strategy functions.

---

**Language**: All spec documentation is written in **English**.

# OPSV Gemini Architecture Proposal: Extension-Only

## Current Problem

`gemini-daemon.ts` launches a **separate** Chromium via Puppeteer to control Gemini. This fails because:
1. User's system Chrome is already running (singleton lock)
2. Bundled Chromium's DISPLAY doesn't match user's desktop
3. Extension is tightly coupled to daemon (WS connection required)

## Proposed Architecture

```
User's existing Chrome (already logged into Google)
  └→ Companion Extension (loaded unpacked)
       ├→ content.js  ← runs on gemini.google.com, handles automation
       └→ background.js ← receives Native Messaging commands
                              ↑
                     ┌─────────┴──────────┐
                     │  Native Messaging   │
                     │  Host (JS / Node.js)│
                     └─────────┬──────────┘
                              ↑
                    OpenCLI / OPSV pipeline

## Advantages
- No separate browser process needed
- Uses user's existing Chrome + Google login
- Extension works independently (just load in Chrome)
- Native Messaging is Chrome's built-in IPC for extensions
- OpenCLI sends commands, extension executes them in Gemini tab

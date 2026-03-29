# OpsV CLI Reference

> Standardized command-line interface for the OpenSpec-Video production pipeline (v0.4.3).

---

## Command Quick Reference

| Command | Responsibility | Key Options |
|---------|----------------|-------------|
| `opsv init` | Initialize project | `[projectName]` |
| `opsv serve` | Start background service | — |
| `opsv generate` | Compile image jobs | `--preview`, `--shots` |
| `opsv gen-image` | Execute image generation | `--model`, `--dry-run` |
| `opsv review` | Write results back to docs | `--all` |
| `opsv animate` | Compile video jobs | — |
| `opsv gen-video` | Execute video generation | `--model`, `--dry-run` |

---

## 1. Project Initialization

### `opsv init [projectName]`
Sets up a new project skeleton.
- **Actions**: Creates directory structure, copies `.agent/` and `.env/` templates.
- **Interactions**: Prompts to select AI assistant support (Gemini, OpenCode, or Trae).

---

## 2. Background Service (Daemon)

### `opsv serve` / `opsv start`
Starts the OpsV background WebSocket daemon (`ws://127.0.0.1:3061`).
- Used for global task tracking and project registration.

### `opsv stop`
Stops the daemon using the PID file in `~/.opsv/daemon.pid`.

---

## 3. Image Pipeline

### `opsv generate [targets...]`
Compiles Markdown specifications into a JSON task queue (`queue/jobs.json`).
- **Options**:
    - `-p, --preview`: Only generate key shots or single character sketches.
    - `--shots 1,5`: Generate jobs for specific shot IDs.
- **Principle**: Injects `@entity` details and `global_style_postfix` into prompts.

### `opsv gen-image`
Executes image rendering.
- **Parallel Universe Mode**: By default (`--model all`), it runs all enabled models concurrently.
- **Output**: `artifacts/drafts_N/[EngineName]/`.
- **Dry Run**: Use `--dry-run` to validate configurations without spending credits.

---

## 4. Video Pipeline

### `opsv animate`
Compiles `Shotlist.md` into video job queue (`queue/video_jobs.json`).
- Translates `motion_prompt_en` and `reference_image` into absolute paths.

### `opsv gen-video`
Executes video rendering.
- **Serial Execution**: Unlike image generation, video tasks run serially if `@FRAME` inheritance is used (requiring the last frame of the previous video).
- **Output**: `artifacts/videos/[EngineName]/`.

---

## 5. Review & Feedback

### `opsv review [path]`
Scans generation artifacts and writes links/previews back into Markdown files (e.g., `Script.md`).
- **Options**:
    - `--all`: Includes all historical drafting batches.

---

## 6. Environment & Variables

CLI loads variables in this priority:
1. `.env/secrets.env` (Recommended)
2. `.env` file (Root)
3. System Environment Variables

| Variable | Usage |
|----------|-------|
| `VOLCENGINE_API_KEY` | Unified key for SeaDream and Seedance. |
| `SILICONFLOW_API_KEY` | For Wan 2.1 video models. |

---

> *OpsV 0.4.3 | Latest Update: 2026-03-29*

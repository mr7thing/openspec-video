# OpsV CLI Reference

> Standardized command-line interface for the OpenSpec-Video production pipeline (v0.4.3).

---

## 1. Global Setup

### Authentication (Environment Variables)
Set these in `.env/secrets.env`:
- `VOLCENGINE_API_KEY`: For SeaDream and Seedance engines.
- `MINIMAX_API_KEY`: For Minimax video engine.
- `SILICON_FLOW_API_KEY`: For SiliconFlow image engines.

---

## 2. Command Reference

### `opsv init [projectName]`
Initializes a new project skeleton.
- Sets up `.agent/`, `.antigravity/`, and directory structure.
- Copies template configs to `.env/`.

### `opsv generate`
Compiles static narrative assets into image generation jobs.
- **Inputs**: `videospec/elements/`, `videospec/scenes/`, `videospec/shots/Script.md`.
- **Outputs**: `queue/jobs.json`.
- **Options**:
  - `--preview`: Generates only one keyframe per shot.
  - `--shots 1,2`: Generates jobs for specific short IDs.

### `opsv gen-image`
Executes image rendering via API.
- **Parallel Universe Sandbox**: Defaults to `--model all`, running all models concurrently.
- **Output**: `artifacts/drafts_N/[EngineName]/`.

### `opsv review`
Updates Markdown files with the latest generation results.
- Scans `artifacts/drafts_N/` and writes image links into `Script.md`.
- **Options**:
  - `--all`: Includes results from all historical drafting batches.

### `opsv animate`
Compiles the animation script into video generation jobs.
- **Inputs**: `videospec/shots/Shotlist.md`.
- **Outputs**: `queue/video_jobs.json`.

### `opsv gen-video`
Executes video rendering via API.
- Supports long-running job polling and status monitoring.
- **Output**: `artifacts/videos/[EngineName]/`.

---

## 3. Advanced Usage

### Parallel Scheduling
When using `--model all`, the system reads `api_config.yaml` and executes tasks for every entry where `enable: true`.
- Each engine gets its own subdirectory to avoid file naming collisions.
- Task status is tracked independently.

### Project Refresh
To sync your project structure with the latest global templates:
```bash
opsv init . --update
```

---

> *OpsV 0.4.3 | Latest Update: 2026-03-28*

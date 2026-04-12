# Workflow: Auto Executor (Batch Processing) - v0.5.1

This workflow explains how the OpenSpec-Video pipeline handles batch processing of image and video generations without any external browser automation. **Everything runs natively via internal API dispatcher paths.**

## Prerequisites
- Generation strictly depends on the compiler creating `queue/jobs.json` or `queue/video_jobs.json`.
- The `api_config.yaml` and `.env` files must be populated with appropriate API keys (`VOLCENGINE_API_KEY`, `SILICONFLOW_API_KEY`, etc.).

## Execution Steps

### 1. Job Queue Generation
- Compile the Markdown specification into actionable jobs using:
  ```bash
  npx opsv parse
  ```
- The `JobGenerator` automatically reads all valid markdown documents and resolves the `@` entity references.

### 2. Batch Dispatch
**To generate images** (Storyboards, Elements, Scenes):
```bash
npx opsv gen --model <target_model>
```
*Note: Options like SeaDream or Minimax exist under `target_model` bindings specified in api_config.*

**To generate videos** (Seedance Pro, Wan 2.1, etc.):
```bash
npx opsv video --model <target_model> --skip-failed
```

### 3. Under the Hood (The v0.5.1 Architecture)
- The Dispatchers (`ImageModelDispatcher` / `VideoModelDispatcher`) iterate through queued jobs continuously.
- Each API `Provider` implements a unified, native `generateAndDownload` promise contract.
- The system polls the API directly through native integrations, downloads the returned data/buffer, and logs execution to `artifacts/`.
- **NO BROWSER SUBAGENTS** are required or allowed. All web GUI mockups (e.g. Nano Banana Pro mockings) have been deprecated globally.

### 4. Verification Checkpoint
- Rerun `npx opsv parse` at any time to print the Dependency Graph.
- A green checkmark ✅ clearly indicates a completed visual sequence node.

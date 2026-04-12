# Workflow: Generate Video - v0.5.1

This workflow orchestrates the creation of video clips directly via OpenSpec-Video API wrapper interfaces (such as ByteDance Seedance 1.5 Pro or SiliconFlow Wan 2.1).

## Prerequisites
- **Storyboards Completed**: The shot visual representation must exist in `artifacts/shots/` or respective folders (rendered initially via `opsv gen`).
- **Motion Settings Validated**: `videospec/shots/Shotlist.md` must be correctly formatted to include action and motion instructions readable by the compiler.

## Steps

### 1. Compilation
Run the parse command to re-build the specific dependencies and ensure video jobs are generated inside `queue/video_jobs.json`:
```bash
npx opsv parse
```

### 2. CLI Execution
Execute the video command natively from root:
```bash
npx opsv video --model <model_name>
```
**Examples for `<model_name>`** *(MUST match your `api_config.yaml` definitions)*:
- `doubao-seedance-1-5-pro` (Volcengine Seedance 1.5 Pro)
- `wan-ai/Wan2.1-T2V-14B` (SiliconFlow Wan 2.1)
- `veo_3_1` (If supported and mapped)

If the pipeline encounters an unexpected timeout or logic failure but you wish to enforce skipping failure states, pass `--skip-failed`:
```bash
npx opsv video --model <model_name> --skip-failed
```

### 3. Verification & Results Logging
- A summary output `DispatchSummary` will explicitly log successful (`succeeded`) vs failed (`failed`) items post-execution.
- MP4 outputs are persistently stored under `artifacts/videos/`.

*Note: Legacy browser GUI automation for Veo or other platforms is abolished. Do NOT attempt to spawn web components.*

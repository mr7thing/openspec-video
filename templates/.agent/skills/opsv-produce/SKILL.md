# opsv-produce Skill

## Overview
Compile generation tasks for specific models. Each produce command reads `_assets.json`, skips approved assets, and writes provider-specific `.json` files to `circle/provider.model/` directories.

## Commands

### imagen — Image generation
```bash
opsv imagen --model volcengine.seadream
opsv imagen --model siliconflow.qwenimg --circle zerocircle --dry-run
```

### animate — Video generation
```bash
opsv animate --model volcengine.seedance2
opsv animate --model siliconflow.wan --circle firstcircle
```

### comfy — ComfyUI workflow
```bash
opsv comfy --model comfy.sdxl
opsv comfy --model runninghub.default --param '{"input-style":"anime"}'
```

### audio — Audio generation [planned]
```bash
opsv audio --model test  # Not yet implemented
```

### app — Browser automation
```bash
opsv app --model gemini.flash
```

## Compilation Flow
1. Read `_assets.json` from target circle
2. Filter out `approved` assets
3. Load asset frontmatter and resolve `@ref` references
4. Build `Job` objects with prompt, references, frame_ref
5. Call `TaskBuilder.compileToDir()` → provider-specific `TaskJson`
6. Write to `opsv-queue/videospec/<circle>/<provider.model>/<shotId>.json`

## Key Files
- `src/commands/imagen.ts`, `animate.ts`, `comfy.ts`, `audio.ts`, `app.ts`
- `src/core/compiler/TaskBuilder.ts` — Shared compile orchestrator
- `src/core/compiler/ProviderCompiler.ts` — Interface
- `src/core/compiler/providers/` — Volcengine, SiliconFlow, Minimax, RunningHub, ComfyUI
- `src/types/Job.ts` — Job, TaskJson types

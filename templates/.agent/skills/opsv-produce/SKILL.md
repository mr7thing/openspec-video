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
opsv webapp --model webapp.gemini
```

## Compilation Flow
1. Read `_assets.json` from target circle
2. Filter out `approved` assets
3. Load asset frontmatter and resolve `@ref` references
4. Build `Job` objects with prompt, references, frame_ref
5. Call `TaskBuilder.compileToDir()` → provider-specific `TaskJson`
6. Write to `opsv-queue/videospec/<circle>/<provider.model>/<id>.json`

## Task JSON & Output Naming Convention

| Scenario | Task JSON | Output | Review Result |
|----------|-----------|--------|---------------|
| Initial compile | `@hero.json` | `@hero_1.png` | Original → directly `approved` |
| Modified re-compile | `@hero_2.json` | `@hero_2_1.png` | Modified → `syncing`, Agent must align |

**Rules**:
- Initial: `id.json` → output `id_1.ext`
- Modified tasks increment sequence: `id_2.json`, `id_3.json`...
- Modified task outputs: `id_N_1.ext` (extra `_1` level)
- Agent iteration: `cp @hero.json @hero_2.json` → edit → `opsv run @hero_2.json` → output `@hero_2_1.png`

## Key Files
- `src/commands/imagen.ts`, `animate.ts`, `comfy.ts`, `audio.ts`, `app.ts`
- `src/core/compiler/TaskBuilder.ts` — Shared compile orchestrator
- `src/core/compiler/ProviderCompiler.ts` — Interface
- `src/core/compiler/providers/` — Volcengine, SiliconFlow, Minimax, RunningHub, ComfyUI
- `src/types/Job.ts` — Job, TaskJson types

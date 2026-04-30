# opsv-produce Skill

## Overview
Compile generation tasks for specific models. Each produce command reads `_manifest.json` (including `assets` field), skips approved assets, validates ref dependencies, and writes provider-specific `.json` files to `{basename}.circle{N}/provider.model/` directories.

## Commands

### imagen — Image generation
```bash
opsv imagen --model volcengine.seadream
opsv imagen --model siliconflow.qwenimg --dry-run
```

### animate — Video generation
```bash
opsv animate --model volcengine.seedance2
opsv animate --model siliconflow.wan
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

### webapp — Browser automation
```bash
opsv webapp --model webapp.gemini
```

## CLI Options (v0.8.8)

| Option | Description |
|--------|-------------|
| `--manifest <path>` | Path to `_manifest.json` (or directory containing it) |
| `--file <id>` | Run specific asset by id from manifest |
| `--category <cat>` | Filter assets by category |
| `--status-skip <statuses>` | Comma-separated statuses to skip (default: approved, use "none" to skip nothing) |
| `--dry-run` | Show compiled tasks without writing files |

## Compilation Flow (v0.8.8)
1. Read `_manifest.json` from target circle (including `assets` field)
2. Filter by `--file`, `--category`, `--status-skip`
3. **Validate ref statuses**: all `@ref` references must point to `approved` assets (syncing blocks downstream)
4. Load asset frontmatter and resolve `@ref` references
5. Read reference images via two readers (v0.8.3):
   - **`ApprovedRefReader`**: reads `## Approved References` from **referenced documents** → `Asset.approvedRefs`
   - **`DesignRefReader`**: reads `## Design References` from **own document** → `Asset.designRefs`
6. Build `Job` objects with prompt, references, frame_ref
7. Call `TaskBuilder.compileToDir()` → provider-specific `TaskJson`
8. Write to `opsv-queue/{basename}.circle{N}/<provider.model>/<id>.json`

**Syncing Gate**: `syncing` assets block downstream compilation. If an asset's `@ref` points to a `syncing` asset, compilation is skipped with a warning.

**`@FRAME:` resolution**: searches `.circleN/<provider.model>/` directories instead of hardcoded `opsv-queue/videospec/`

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
- `src/commands/imagen.ts`, `animate.ts`, `comfy.ts`, `webapp.ts`
- `src/commands/produceUtils.ts` — Shared utilities (v0.8.8)
- `src/core/compiler/TaskBuilder.ts` — Shared compile orchestrator
- `src/core/compiler/ProviderCompiler.ts` — Interface
- `src/core/compiler/providers/` — Volcengine, SiliconFlow, Minimax, RunningHub, ComfyUI
- `src/types/Job.ts` — Job, TaskJson types

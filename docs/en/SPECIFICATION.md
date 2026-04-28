# OpsV v0.8 Specification

## Overview

OpsV (OpenSpec-Video) is a cinematic AI automation framework that transforms structured narrative specifications into production-ready media via a multi-provider pipeline.

## Core Principles

1. **Spec-as-Code**: Markdown narrative specs are the single source of truth
2. **Intent-Execution Decoupling**: Produce commands compile; `opsv run` executes
3. **Physical State Machine**: Task state = file existence (crash-safe)
4. **Circle Architecture**: Dependency-layered batch execution with topological sorting
5. **By-Provider Parallelism**: Same provider serial, different providers parallel

## Command Tree (11 commands)

```
opsv
├── init [name]                   # Project scaffold
├── validate [-d]                 # Document validation
├── circle
│   ├── create [--dir] [--skip-middle-circle]
│   └── refresh [--dir]
├── imagen --model <m>            # Compile image tasks
├── animate --model <m>           # Compile video tasks
├── comfy --model <m> [--param]   # Compile ComfyUI tasks
├── audio --model <m>             # [planned]
├── app --model <m>               # Browser automation
├── run <path...> [--retry]       # Execute tasks
├── review [--port] [--latest|--all] [--ttl]
└── script [-d] [-o] [--dry-run]
```

## Directory Structure

```
project/
  videospec/                       <- Graph root (source docs)
    elements/                      <- Characters, props, costumes
      @hero.md
      @villain.md
    scenes/                        <- Scenes, shots
      scene_forest.md
      shot_01.md
  .opsv/
    api_config.yaml                <- Provider/model configuration
    .env                           <- API keys
  opsv-queue/
    videospec/                     <- Build output
      _manifest.json               <- Global status snapshot
      zerocircle/
        _assets.json               <- Circle asset list + status
        volcengine.seadream/       <- provider.model
          @hero.json               <- Compiled task
          @hero_1.png              <- Output
      firstcircle/
        _assets.json
        volcengine.seedance2/
          shot_01.json
          shot_01_1.mp4
          shot_01_first.png
          shot_01_last.png
```

## Status State Machine

```
drafting -> syncing -> approved
```

- `drafting`: Asset specification in progress (default, no review history)
- `syncing`: Modified task approved, source document needs field alignment (blocks downstream)
- `approved`: Output accepted, downstream dependencies unblocked

Review approve sets status based on output filename pattern:
- `id_1.ext` (original task) → directly `approved`
- `id_N_N.ext` (modified task) → `syncing` + review record includes `modified_task` path; agent aligns fields then sets `approved`

CLI never modifies `prompt_en` or other content fields during review — only appends review records and sets status.

## Frontmatter Schema

### Base (all asset categories)
```yaml
category: character | prop | costume | scene | shot-design | shot-production | project
status: drafting | syncing | approved
visual_brief: "Brief description for prompt generation"
visual_detailed: "Detailed description for video prompt"
prompt_en: "English prompt for AI generation"
refs: ["@hero:portrait", "@villain"]
reviews: ["2026-01-15 Approved by director"]
```

`category` is a document management classification — it does NOT determine generation type. Any document can be used with any `--model` (imagen/video/comfy/etc.). Generation type comes from `api_config.yaml` via the `--model` parameter.

### Project
```yaml
category: project
aspect_ratio: "16:9"
resolution: "1920x1080"
global_style_postfix: "cinematic, film grain"
vision: "A dark thriller about..."
```

### Shot Production
```yaml
category: shot-production
title: "Hero enters forest"
id: "shot_01"
first_frame: "@hero_standing.png"
last_frame: "@hero_walking.png"
duration: "5s"
frame_ref:
  first: "path/to/first_frame.png"
  last: "path/to/last_frame.png"
video_path: "path/to/output.mp4"
```

## Circle Architecture

Circles represent dependency layers determined by topological sort:

1. **ZeroCircle**: Assets with no dependencies (characters, props, scenes)
2. **FirstCircle / Circle1**: Assets depending on ZeroCircle outputs
3. **EndCircle**: Final outputs (video shots depending on approved images)

`opsv circle create` builds the graph and creates directory structure.
`opsv circle refresh` rebuilds the graph and diffs against existing state.

## Task JSON & Output Naming Convention

| Scenario | Task JSON | Output | Review Result |
|----------|-----------|--------|---------------|
| Initial compile | `@hero.json` | `@hero_1.png` | Original → directly `approved` |
| Modified re-compile | `@hero_2.json` | `@hero_2_1.png` | Modified → `syncing`, agent must align |

Rules:
- Initial: `id.json` → output `id_1.ext`
- Modified tasks increment sequence: `id_2.json`, `id_3.json`...
- Modified task outputs: `id_N_1.ext` (extra `_1` level, N≥2)
- Agent iteration: `cp @hero.json @hero_2.json` → edit → `opsv run @hero_2.json` → output `@hero_2_1.png`

## @ Reference Syntax

```
@asset_id description text
@asset_id:variant description text
@FRAME:shot_01_last frame reference
(@asset_id:variant) description text  <- parenthesized form
```

## Compilation Flow

1. Produce command (imagen/animate/comfy) reads `_assets.json`
2. Filters out `approved` assets
3. Resolves `@ref` references -> approved image paths
4. Builds `Job` objects from frontmatter
5. `TaskBuilder.compileToDir()` calls provider-specific `ProviderCompiler`
6. Writes `TaskJson` to `circle/provider.model/shotId.json`

## Execution Flow

1. `opsv run <path...>` scans for `.json` task files
2. Groups tasks by `_opsv.provider`
3. Runs providers in parallel, tasks within each provider serially
4. Downloads outputs to same directory as task `.json`
5. Returns success/failure per task

## Error Codes

| Range | Domain |
|-------|--------|
| E1xxx | Asset errors |
| E2xxx | Config errors |
| E3xxx | Compilation errors |
| E4xxx | Execution errors |
| E5xxx | Network/file errors |
| E6xxx | Validation errors |
| E7xxx | Scheduling errors |
| E9999 | Unknown error |

## Breaking Changes from v0.7

- `opsv queue compile` removed; compilation is inline via `--model`
- `opsv deps` removed; replaced by `opsv circle refresh`
- `opsv daemon` removed; Chrome extension now exposes HTTP API, CLI uses standard submit-poll via `opsv webapp`
- `jobs.json` intermediate layer eliminated
- `--model` is mandatory for imagen/animate/comfy/webapp
- `pending_sync` status removed; use `syncing`
- `draft` status removed; only `drafting`, `syncing`, `approved`
- `type` frontmatter field renamed to `category` (document management classification, NOT generation type)
- Generation type is determined solely by `--model` (from `api_config.yaml`), not by document category
- Review approve no longer modifies `prompt_en` or content fields — CLI only appends review records + sets status
- Review approve sets `approved` for original task outputs, `syncing` for modified task outputs
- No iteration numbers in directory names (A1 incremental update)
- Output naming convention: `id_1.ext` (original), `id_N_1.ext` (modified, N≥2)

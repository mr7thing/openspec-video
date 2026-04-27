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
drafting -> draft -> syncing -> approved
```

- `drafting`: Asset specification in progress
- `draft`: Specification complete, ready for generation
- `syncing`: Output generated, under review (blocks downstream)
- `approved`: Output accepted, downstream dependencies unblocked

## Frontmatter Schema

### Base (all asset types)
```yaml
type: character | prop | costume | scene | shot-design | shot-production | project
status: drafting | draft | syncing | approved
visual_brief: "Brief description for prompt generation"
visual_detailed: "Detailed description for video prompt"
prompt_en: "English prompt for AI generation"
refs: ["@hero:portrait", "@villain"]
reviews: ["2026-01-15 Approved by director"]
```

### Project
```yaml
type: project
aspect_ratio: "16:9"
resolution: "1920x1080"
global_style_postfix: "cinematic, film grain"
vision: "A dark thriller about..."
```

### Shot Production
```yaml
type: shot-production
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
- `opsv daemon serve/start/stop/status` removed; daemon lifecycle implicit in `opsv app`
- `jobs.json` intermediate layer eliminated
- `--model` is mandatory for imagen/animate/comfy/app
- `pending_sync` status removed; use `syncing`
- No iteration numbers in directory names (A1 incremental update)

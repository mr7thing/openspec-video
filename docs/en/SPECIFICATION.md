# OpsV v0.8.6 Specification

## Overview

OpsV (OpenSpec-Video) is a cinematic AI automation framework that transforms structured narrative specifications into production-ready media via a multi-provider pipeline.

## Core Principles

1. **Spec-as-Code**: Markdown narrative specs are the single source of truth
2. **Intent-Execution Decoupling**: Produce commands compile; `opsv run` executes
3. **Physical State Machine**: Task state = file existence (crash-safe)
4. **Circle Architecture**: Dependency-layered batch execution with topological sorting
5. **By-Provider Parallelism**: Same provider serial, different providers parallel
6. **Manifest-First**: Produce commands read from circle manifest, never scan directories

## Command Tree (11 commands)

```
opsv
├── init [name]                   # Project scaffold
├── validate [-d]                 # Document validation
├── circle
│   ├── create [--dir] [--name] [--skip-middle-circle]
│   └── refresh [--dir]
├── imagen --model <m> [--category <cat>] [--status-skip <statuses>]
├── animate --model <m> [--category <cat>] [--status-skip <statuses>]
├── comfy --model <m> [--category <cat>] [--status-skip <statuses>] [--workflow] [--workflow-dir] [--param]
├── audio --model <m>             # [planned]
├── webapp --model <m> [--category <cat>] [--status-skip <statuses>]
├── run <path...> [--retry]       # Execute tasks
├── review [--port] [--latest|--all] [--ttl]
└── script [-d] [-o] [--dry-run]
```

### Produce Command Options

| Option | Description |
|--------|-------------|
| `--category <cat>` | Filter assets by category (user-defined in frontmatter) |
| `--status-skip <statuses>` | Comma-separated statuses to skip (default: approved, use "none" to skip nothing) |

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
    videospec.circle1/             <- Build output (basename.circleN)
      _manifest.json               <- Circle manifest: id, status, layer, category
      volcengine.seadream/         <- provider.model
        @hero.json                 <- Compiled task
        @hero_1.png                <- Output
    role.circle2/                  <- Next circle batch
      _manifest.json
      volcengine.seedance2/
        shot_01.json
        shot_01_1.mp4
        shot_01_first.png
        shot_01_last.png
```

## Manifest Structure

The `_manifest.json` is the **single source of truth** for asset state:

```json
{
  "version": "0.8.6",
  "target": "videospec",
  "generatedAt": "2026-04-30T00:00:00.000Z",
  "circles": [...],
  "assets": {
    "hero": { "status": "approved", "layer": 1, "category": "character" },
    "scene_01": { "status": "drafting", "layer": 2, "category": "scene" }
  }
}
```

**Critical**: Produce commands read from manifest ONLY, never scan directories.

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

`opsv circle create` builds the graph and creates a new circle directory (`basename.circleN`). The `--name` parameter sets the basename; `--dir` scopes creation to a specific directory. Each `circle create` increments the circle batch number (`.circle1`, `.circle2`, etc.).
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

- External references (`@assetId:variant` in body + `refs:` in frontmatter) → reads `## Approved References` from the **referenced document** via `ApprovedRefReader`
- Internal references (`## Design References` section in own document) → reads images from own document's `## Design References` section via `DesignRefReader`

### Design References vs Approved References

| Section | Direction | Purpose | Reader |
|---------|-----------|---------|--------|
| `## Design References` | **Input-side** | Design reference images bundled with the document; used as `reference_images` during compilation | `DesignRefReader` → `Asset.designRefs` |
| `## Approved References` | **Output-side** | Images placed here after review approve; used when OTHER documents reference this one via `@assetId:variant` | `ApprovedRefReader` → `Asset.approvedRefs` |

### @FRAME Resolution

`@FRAME:shot_XX_last` resolution searches `.circleN/<provider.model>/` directories (v0.8.3) instead of hardcoded `opsv-queue/videospec/`.

## Compilation Flow (v0.8.6)

1. Produce command (imagen/animate/comfy/webapp) reads `_manifest.json`
2. Filters by `--category` (if specified) and `--status-skip` (default: approved)
3. For each filtered asset, finds the `.md` file via `findAssetFilePath()` (searches `elements/` and `scenes/`)
4. Resolves `@ref` references:
   - **`ApprovedRefReader`**: reads `## Approved References` from **referenced documents** → used for `@assetId:variant` resolution
   - **`DesignRefReader`**: reads `## Design References` from **current document** → used as `reference_images`
5. Builds `Job` objects from frontmatter
6. `TaskBuilder.compileToDir()` calls provider-specific `ProviderCompiler`
7. Writes `TaskJson` to `basename.circleN/provider.model/shotId.json`

**Key Change (v0.8.6)**: Produce commands no longer scan directories. They read only from manifest and resolve file paths on-demand.

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

## Breaking Changes from v0.8.1

- Circle directories renamed: `zerocircle/`, `firstcircle/`, `endcircle/` → `basename.circleN/` (e.g., `videospec.circle1/`, `role.circle2/`). Each `opsv circle create` produces a new `.circleN` batch.
- `_assets.json` eliminated; its contents merged into `_manifest.json` with an `assets` field. `_manifest.json` now lives inside each `.circleN/` directory, not at the `opsv-queue/videospec/` level.
- `opsv circle create` gains `--name` parameter to set the circle directory basename.
- `--dir` on `circle create` now scopes creation to a specific directory rather than the whole videospec.

## Breaking Changes from v0.8.2

- Two reference types now properly distinguished: external references (`@assetId:variant` + `refs:`) read `## Approved References` from the referenced document; internal references read `## Design References` from the own document
- New `DesignRefReader` class reads `## Design References` section (parallel to `ApprovedRefReader` which reads `## Approved References`)
- `Asset.designRefs` field added alongside `Asset.approvedRefs`
- Produce commands: second reference block now reads `designRefs` (from `## Design References`) instead of `approvedRefs` (from `## Approved References`)
- `@FRAME:` resolution updated: now searches `.circleN/<provider.model>/` directories instead of hardcoded `opsv-queue/videospec/`
- Section distinction clarified: `## Approved References` = output-side (images placed after review, referenced by other docs); `## Design References` = input-side (design reference images, used as `reference_images` during compilation)

## Breaking Changes from v0.8.5

- **Manifest-First Architecture**: Produce commands (`imagen`, `animate`, `comfy`, `webapp`) no longer scan directories. They read only from circle `_manifest.json`.
- **`_manifest.json` now includes `category`**: Each asset entry contains `{ status, layer, category }` instead of just `{ status, layer }`.
- **`--category` option added**: Produce commands accept `--category <cat>` to filter assets by their frontmatter category field.
- **`--status-skip` option added**: Produce commands accept `--status-skip <statuses>` (default: approved). Use `none` to skip nothing, or comma-separated list.
- **Removed `getAllElements()` and `getAllScenes()`**: Category is user-defined; no hardcoded character/prop/scene filters. Use `--category` to filter.
- **`CircleAssetEntry` now includes `filePath`**: `AssetManager.loadCircleAssets()` returns file paths for direct .md file access.
- **No directory scanning in produce commands**: `AssetManager.loadFromVideospec()` no longer called by produce commands.

# OpsV Specification

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
| `--manifest <path>` | Path to _manifest.json (or directory containing it). If not specified, auto-detects from current/parent directory. |
| `--file <id>` | Run specific asset by id from manifest |
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
    videospec_circle1/             <- Build output (basename.circleN)
      _manifest.json               <- Circle manifest: id, status, layer, category
      volcengine.seadream_001/     <- provider.model + sequence
        @hero.json                 <- Compiled task
        @hero_1.png                <- Output
    role_circle2/                  <- Next circle batch
      _manifest.json
      volcengine.seedance2_001/
        shot_01.json
        shot_01_1.mp4
        shot_01_first.png
        shot_01_last.png
```

## Manifest Structure

The `_manifest.json` is the **single source of truth** for asset state:

```json
{
  "version": "0.8.27",
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
drafting ──┬──> syncing ──> approved
           └──> drafting (stays)
```

- `drafting`: Asset specification in progress (default, no review history)
- `syncing`: Modified task approved, source document needs field alignment (blocks downstream)
- `approved`: Output accepted, downstream dependencies unblocked

### Review Actions (v0.10.1)

Every review action **always** writes a review entry to `frontmatter.reviews[]`, recording timestamp, action, output files, and note. This ensures review history is the authoritative truth source — even if `## Approved References` or `## Design References` sections are missing, the review log can reconstruct which files were associated with each decision.

| Action | Button | Requires image? | Status | `## Approved Refs` | `## Design Refs` | Description |
|--------|--------|----------------|--------|-------------------|-----------------|-------------|
| `approve` | ✓ Approve | ✅ | `approved` or `syncing` | ✅ append | — | Accept output as final |
| `design_feedback` | ✎ Design Feedback | ✅ | `drafting` | — | ✅ append | Attach image as design reference + feedback note |
| `revise_prompt` | ✏ Revise Prompt | ❌ | `drafting` | — | — | Request prompt revision (note required) |

#### Approve → `approved` vs `syncing`

The `approve` action detects whether the output came from an **original** or **modified** task:

- `id_1.ext` (original task) → status = `approved`
- `id_m{n}_1.ext` (modified/iterated task, e.g. `hero_m1_1.png`) → status = `syncing`

When `syncing`, the output is provisionally approved and written to `## Approved References`, but the source document still needs field alignment (e.g. prompt was edited in the task JSON before running, and the edit hasn't been synced back). An agent or user must align the source document fields, then manually set `status: approved`.

Both paths write the output image to `## Approved References` — `syncing` does NOT delay reference writing.

#### Redundancy mechanism

Review records and reference sections serve as dual guarantees:

1. **Review entry** (`frontmatter.reviews[]`) — Always written. Contains action, output file paths, note. Cannot be lost unless frontmatter is deleted.
2. **References section** (`## Approved References` / `## Design References`) — Index of images. Can be rebuilt from review history if lost.

When downstream compilation resolves `@assetId` refs, it reads `## Approved References` via `ApprovedRefReader`. If that section is empty but review history shows an approved output, the section can be reconstructed.

#### Review Entry Schema

```yaml
reviews:
  - "2026-05-22T12:00:00Z approved output: hero_1.png | note: perfect"
  - "2026-05-22T12:30:00Z design_feedback output: hero_2.png | note: eyes need more intensity"
  - "2026-05-22T13:00:00Z syncing output: hero_m1_1.png | modified_task: hero_m1.json | note: adjusted prompt"
  - "2026-05-22T14:00:00Z revise_prompt | note: add more setting detail"
```

Fields:
- `timestamp` — ISO 8601
- `action` — `approved` | `syncing` | `design_feedback` | `revise_prompt` | `rejected`
- `output` — Comma-separated list of output filenames
- `modified_task` — (optional) path to modified task JSON, only for `syncing`
- `note` — (optional) review feedback text

CLI never modifies `prompt` or other content fields during review — only appends review records and sets status.

## Frontmatter Schema

### Base (all asset categories)
```yaml
category: character | prop | costume | scene | shot-design | shot-production | project
status: drafting | syncing | approved
visual_brief: "Brief description for prompt generation"
visual_detailed: "Detailed description for video prompt"
prompt: "Prompt for AI generation"
refs:
  image:
    "@hero": ["/elements/hero.md"]
  video: {}
reviews:
  - "2026-05-22T12:00:00Z approved output: hero_1.png"
  - "2026-05-22T12:30:00Z design_feedback output: hero_2.png | note: adjust lighting"
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

Circles represent dependency layers determined by topological sort. Circle names use `zerocircle`, `firstcircle`, `secondcircle`, etc. (distinct from iteration-based `circleN` directory names):

| Circle Name | Condition | Example |
|-------------|-----------|---------|
| `zerocircle` | Layer 1 (no dependencies) | Characters, props, scenes |
| `firstcircle` | Layer 2 (depends on zerocircle), or final layer when exactly 2 layers | Assets depending on zero outputs |
| `secondcircle` | Layer 3 (when ≥4 layers) | Middle layers |
| `thirdcircle` | Layer 4 (when ≥5 layers) | Middle layers |
| `endcircle` | Final layer contains `shotlist.md` | Final video shot outputs (batch video generation) |

`opsv circle create` builds the graph and creates a new circle directory (`basename.circleN`). The `--name` parameter sets the basename; `--dir` scopes creation to a specific directory. Each `circle create` increments the circle batch number (`_circle1`, `_circle2`, etc.).

### Directory Scanning Rules

**`--dir` accepts a single path only** — multiple directories are not supported.

Scanning depth is **one level** under `--dir`:

```
--dir videospec/
├── *.md                     ← scanned
├── elements/
│   ├── *.md                ← scanned
│   └── nested/             ← NOT scanned (too deep)
└── scenes/
    ├── *.md                ← scanned
    └── subdir/             ← NOT scanned
```

Rule: `opsv circle create --dir videospec` scans `videospec/*.md` and `videospec/*/*.md` (one level only). Deeper nesting like `videospec/elements/characters/hero.md` is ignored.

**Workaround for multiple source directories**: place all assets under a common root (`videospec/`) with subdirectories for organization. One circle command scans the entire tree.

**`opsv circle refresh`** rebuilds the graph using the same `--dir` used in `create`. To scan a different directory structure, create a new circle batch with `circle create --dir <path>`.

## Task JSON & Output Naming Convention

| Scenario | Task JSON | Output | Review Result |
|----------|-----------|--------|---------------|
| Initial compile | `@hero.json` | `@hero_1.png` | Original → directly `approved` |
| Modified (iterated) | `@hero_m1.json` | `@hero_m1_1.png` | Modified → `syncing`, agent must align |

Rules:
- Initial: `id.json` → output `id_1.ext`
- Iterated tasks use `_m{N}` marker: `id_m1.json`, `id_m2.json`...
- Iterated outputs: `id_m{n}_1.ext` (the `_m` prefix distinguishes from numeric asset IDs like `shot_01_frame_04`)
- Agent iteration: `opsv iterate @hero.json` → edit generated `@hero_m1.json` → `opsv run @hero_m1.json` → output `@hero_m1_1.png`

**No backward compatibility**: old `_N` naming (e.g. `@hero_2.json`) is ignored by v0.8.27+. Old output files are dead data.

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

| Section | Direction | When Written | Purpose | Reader |
|---------|-----------|-------------|---------|--------|
| `## Design References` | **Input-side** | Review `design_feedback` action | Design reference images + feedback; used as `reference_images` during compilation | `DesignRefReader` → `Asset.designRefs` |
| `## Approved References` | **Output-side** | Review `approve` action (both `approved` and `syncing` status) | Accepted output images; used when OTHER documents reference this one via `@assetId:variant` | `ApprovedRefReader` → `Asset.approvedRefs` |

### @FRAME Resolution

`@FRAME:shot_XX_last` resolution searches `.circleN/<provider.model>/` directories (v0.8.3) instead of hardcoded `opsv-queue/videospec/`.

## Compilation Flow (v0.8.6)

1. Produce command (imagen/animate/comfy/webapp) locates `_manifest.json` via `--manifest` or auto-detection
2. Reads asset list from manifest (includes filePath for each asset)
3. Filters by `--file` (if specified), `--category` (if specified), and `--status-skip` (default: approved)
4. For each filtered asset, reads the `.md` file using the filePath from manifest
5. Resolves `@ref` references:
   - **`ApprovedRefReader`**: reads `## Approved References` from **referenced documents** → used for `@assetId:variant` resolution
   - **`DesignRefReader`**: reads `## Design References` from **current document** → used as `reference_images`
7. Builds `Job` objects from frontmatter
8. `await TaskBuilder.compileToDir()` calls provider-specific `ProviderCompiler` (async since v0.8.22)
9. Writes `TaskJson` to `{circleDir}/{provider.model}_NNN/shotId.json`

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
- Review approve no longer modifies `prompt` or content fields — CLI only appends review records + sets status
- Review approve sets `approved` for original task outputs, `syncing` for modified task outputs
- Model queue directories use `_NNN` sequence suffixes for traceability (e.g. `volcengine.seadream_001`, `volcengine.seadream_002`)
- Output naming convention: `id_1.ext` (original), `id_N_1.ext` (modified, N≥2)

## Breaking Changes from v0.8.1

- Circle directories renamed: `zerocircle/`, `firstcircle/`, `endcircle/` → `basename.circleN/` (e.g., `videospec_circle1/`, `role_circle2/`). Each `opsv circle create` produces a new `.circleN` batch.
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
- **`--manifest` option**: Produce commands accept `--manifest <path>` to specify manifest location. Auto-detects from current/parent directory if not specified.
- **`--file` option**: Produce commands accept `--file <id>` to run specific assets from manifest.
- **`_manifest.json` now includes `category`**: Each asset entry contains `{ status, layer, category }` instead of just `{ status, layer }`.
- **`--category` option added**: Produce commands accept `--category <cat>` to filter assets by their frontmatter category field.
- **`--status-skip` option added**: Produce commands accept `--status-skip <statuses>` (default: approved). Use `none` to skip nothing, or comma-separated list.
- **Removed `getAllElements()` and `getAllScenes()`**: Category is user-defined; no hardcoded character/prop/scene filters. Use `--category` to filter.
- **`CircleAssetEntry` now includes `filePath`**: `AssetManager.loadCircleAssets()` returns file paths for direct .md file access.
- **No directory scanning in produce commands**: `AssetManager.loadFromVideospec()` no longer called by produce commands.

## Breaking Changes from v0.8.5

- **`endcircle` condition clarified**: `endcircle` is only used when the final layer contains `shotlist.md`. Regular shot assets (shot-production/shot-design category) do not trigger `endcircle` naming.

# OpenSpec-Video (OpsV) v0.8.6

> **Spec-as-Code** framework that compiles narrative Markdown into production-ready media via a multi-provider pipeline with circle-centric dependency management.

---

## What is OpsV?

OpsV is a **spec-driven** cinematic AI automation framework. You write narrative specifications in Markdown with YAML frontmatter; OpsV builds dependency graphs, compiles provider-specific tasks, executes them, and manages the review loop.

---

## Quick Start

```bash
# Install
npm install -g videospec

# Initialize project (in current directory)
opsv init

# Or create a named subdirectory
opsv init my-project
cd my-project

# 1. Build dependency graph and create circle directories
opsv circle create

# 2. Compile image tasks (direct, no intermediate jobs.json)
opsv imagen --model volcengine.seadream

# 3. Execute compiled tasks
opsv run opsv-queue/videospec.circle1/

# 4. Review and approve
opsv review

# 5. Compile video tasks after approval
opsv animate --model volcengine.seedance2

# 6. Execute video tasks
opsv run opsv-queue/videospec.circle2/
```

---

## Command Tree (11 commands)

```
opsv
├── init [name]                   # Project scaffold
├── validate [-d]                 # Document validation
├── circle
│   ├── create [--dir] [--name] [--skip-middle-circle]
│   └── refresh [--dir]           # Replaces old status + deps
├── imagen --model <m> [--category <cat>] [--status-skip <statuses>]
├── animate --model <m> [--category <cat>] [--status-skip <statuses>]
├── comfy --model <m> [--category <cat>] [--status-skip <statuses>] [--workflow] [--workflow-dir] [--param]
├── audio --model <m>             # [planned]
├── webapp --model <m> [--category <cat>] [--status-skip <statuses>]
├── run <paths...> [--retry]      # Execute by path reference
├── review [--port] [--latest|--all] [--ttl]
└── script [-d] [-o] [--dry-run]
```

### Produce Command Options

| Option | Description |
|--------|-------------|
| `--category <cat>` | Filter assets by category (from frontmatter) |
| `--status-skip <statuses>` | Comma-separated statuses to skip (default: approved, use "none" to skip nothing) |

---

## Core Architecture

### Circle-Centric Dependency

Tasks are organized into **Circles** (dependency layers via topological sort):

```
opsv-queue/
  videospec.circle1/            # Build output (basename.circleN)
    _manifest.json              # Circle manifest: id, status, layer, category
    volcengine.seadream/        # provider.model flat (no iteration numbers)
      @hero.json
      @hero_1.png
  role.circle2/                 # Depends on circle1
    _manifest.json
    volcengine.seedance2/
      shot_01.json
      shot_01_1.mp4
```

### Manifest Structure

The `_manifest.json` contains all assets with their metadata:

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

### Status Flow

```
drafting → syncing → approved
```

- **drafting**: No review action recorded. Default for new assets.
- **syncing**: Output reviewed and accepted, but fields not yet aligned with task JSON. Agent must verify visual descriptions match the actual generation result.
- **approved**: Fully aligned and locked. Unblocks downstream circles.

### Type Values

Aligned with produce commands: `imagen` | `video` | `audio` | `comfy` | `webapp`

---

## Key Design Principles

See [Design Philosophy](./docs/en/DESIGN-PHILOSOPHY.md) for the full rationale behind these rules.

1. **Spec-as-Code**: Markdown is the single source of truth. All generation parameters originate from frontmatter.
2. **Intent-Execution Decoupling**: Produce commands compile; `opsv run` executes. No mixed responsibilities.
3. **Physical State Machine**: Task state = file existence. Crash-safe, no in-memory dispatcher.
4. **CLI Does Only Deterministic Actions**: CLI never modifies content fields. It only appends review records and updates status. All field alignment is the agent's responsibility.
5. **By-Provider Parallelism**: Same provider serial, different providers parallel.
6. **No Iteration Numbers**: Directories use circle names without `_1` suffixes. Incremental updates via `circle refresh`.
7. **Manifest-First**: Produce commands read from circle manifest, never scan directories.

---

## Supported Providers

| Provider | Models | Type |
|----------|--------|------|
| Volcengine | SeaDream 5.0, Seedance 2.0/2.0 Fast | imagen, video |
| SiliconFlow | Qwen-Image, Wan 2.2 T2V/I2V | imagen, video |
| MiniMax | image-01, Hailuo 2.3 | imagen, video |
| RunningHub | ComfyUI Cloud | comfy |
| ComfyUI Local | SDXL, custom workflows | comfy |
| Browser (extension) | Gemini UI automation | webapp |

---

## Documentation

- [Specification](./docs/en/SPECIFICATION.md) — Complete v0.8 spec
- [Design Philosophy](./docs/en/DESIGN-PHILOSOPHY.md) — Principles and rationale

---

## License

MIT

> *OpsV v0.8.6 | 2026-04-30*

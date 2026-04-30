# OpenSpec-Video (OpsV) v0.8.8

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

# 2. Enter circle directory and compile image tasks
cd opsv-queue/videospec.circle1
opsv imagen --model volcengine.seadream

# 3. Execute compiled tasks
opsv run

# 4. Review and approve
opsv review

# 5. Compile video tasks (only on circles with shot assets)
opsv animate --model volcengine.seedance2

# 6. Execute video tasks
opsv run
```

---

## Command Tree (11 commands)

```
opsv
├── init [name]                   # Project scaffold
├── validate [-d]                 # Document validation
├── circle
│   ├── create [--dir] [--name] [--skip-middle-circle]
│   └── refresh [--dir]           # Rebuild graph, diff, update manifest
├── imagen --model <m>            # Compile image tasks
├── animate --model <m>           # Compile video tasks
├── comfy --model <m>             # Compile ComfyUI tasks
├── audio --model <m>             # [planned]
├── webapp --model <m>            # Browser automation
├── run                           # Execute tasks in current circle
├── review                        # Review and approve outputs
└── script [-d] [-o] [--dry-run]
```

---

## Circle Workflow

Produce commands (`imagen`, `animate`, `comfy`, `webapp`) run inside a circle directory or with `--manifest`:

```bash
# Enter circle directory and run
cd opsv-queue/videospec.circle1
opsv imagen --model volcengine.seadream

# Or specify manifest path
opsv imagen --model volcengine.seadream --manifest opsv-queue/videospec.circle1/_manifest.json

# Run specific asset by id
opsv imagen --model volcengine.seadream --file hero

# Filter by category
opsv imagen --model volcengine.seadream --category character

# Skip specific statuses (default: approved)
opsv imagen --model volcengine.seadream --status-skip approved,drafting
```

### Produce Command Options

| Option | Description |
|--------|-------------|
| `--manifest <path>` | Path to _manifest.json (or directory containing it) |
| `--file <id>` | Run specific asset by id from manifest |
| `--category <cat>` | Filter assets by category (from frontmatter) |
| `--status-skip <statuses>` | Comma-separated statuses to skip (default: approved, use "none" to skip nothing) |

---

## Core Architecture

### Circle-Centric Dependency

Tasks are organized into **Circles** (dependency layers via topological sort):

```
opsv-queue/
  videospec.circle1/            # Circle directory (basename.circleN)
    _manifest.json              # Circle manifest: circles[], assets{}
    volcengine.seadream/       # provider.model/
      @hero.json
      @hero_1.png
  role.circle2/                # Terminal circle (contains shots)
    _manifest.json
    volcengine.seedance2/
      shot_01.json
      shot_01_1.mp4
```

### Manifest Structure

```json
{
  "version": "0.8.8",
  "target": "videospec",
  "generatedAt": "2026-04-30T00:00:00.000Z",
  "circles": [
    { "circle": "zerocircle", "layer": 1, "assetIds": ["hero", "villain"] },
    { "circle": "endcircle", "layer": 2, "assetIds": ["shot_01"] }
  ],
  "assets": {
    "hero": { "status": "approved", "layer": 1, "category": "character" },
    "shot_01": { "status": "drafting", "layer": 2, "category": "shot-production" }
  }
}
```

### Status Flow

```
drafting → syncing → approved
```

- **drafting**: No review action recorded. Default for new assets.
- **syncing**: Output reviewed and accepted, but fields not yet aligned with task JSON.
- **approved**: Fully aligned and locked. Unblocks downstream circles.

### API Configuration

All provider API URLs and models must be configured in `.opsv/api_config.yaml`. No hardcoded defaults.

---

## Key Design Principles

See [Design Philosophy](./docs/en/DESIGN-PHILOSOPHY.md) for the full rationale.

1. **Spec-as-Code**: Markdown is the single source of truth.
2. **Intent-Execution Decoupling**: Produce commands compile; `opsv run` executes.
3. **Physical State Machine**: Task state = file existence.
4. **CLI Does Only Deterministic Actions**: CLI never modifies content fields.
5. **By-Provider Parallelism**: Same provider serial, different providers parallel.
6. **No Iteration Numbers**: Directories use circle names without `_N` suffixes.
7. **Manifest-First**: Produce commands read from manifest only, never scan directories.
8. **Circle-Bound Execution**: Produce commands run within or reference a specific circle.

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

> *OpsV v0.8.8 | 2026-04-30*

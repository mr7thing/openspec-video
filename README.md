# OpenSpec-Video (OpsV) v0.8.15

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
opsv imagen --model volc.seadream5

# 3. Execute compiled tasks
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/

# 4. Review and approve
opsv review

# 5. Compile video tasks (only on circles with shot assets)
opsv animate --model volc.seedance2

# 6. Execute video tasks
opsv run opsv-queue/videospec.circle2/volcengine.seedance2_001/
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

## `--model` 参数与 API Config 别名

`--model` 参数使用 `api_config.yaml` 中定义的**模型别名**（key），不是 API 模型名。所有配置从 `api_config.yaml` 读取，代码无硬编码。

```bash
# 使用 api_config 中的别名
opsv imagen --model volc.seadream5    # 不是 "doubao-seedream-5-0-260128"
opsv animate --model volc.seedance2   # 不是 "doubao-seedance-2-0-260128"
opsv imagen --model minimax.img01     # 不是 "image-01"
opsv imagen --model siliconflow.qimg  # Qwen-Image T2I
opsv imagen --model siliconflow.edit2509  # Qwen-Image-Edit I2I
```

### 可用模型别名

| 别名 | 类型 | 说明 |
|------|------|------|
| `volc.seadream5` | imagen | 豆包 SeaDream 5.0 |
| `volc.seedance2` | video | 豆包 Seedance 2.0 |
| `volc.seedance2f` | video | 豆包 Seedance 2.0 Fast |
| `siliconflow.qimg` | imagen | 硅基 Qwen-Image T2I |
| `siliconflow.edit2509` | imagen | 硅基 Qwen-Image-Edit I2I |
| `siliconflow.want2v` | video | 硅基 Wan T2V |
| `siliconflow.wani2v` | video | 硅基 Wan I2V |
| `minimax.img01` | imagen | MiniMax Image-01 |
| `minimax.vid01` | video | MiniMax Hailuo 2.3 |
| `comfylocal.workflow` | comfy | ComfyUI Local |
| `runninghub.default` | comfy | RunningHub Cloud |
| `webapp.gemini` | webapp | Gemini 浏览器自动化 |

完整配置见 `.opsv/api_config.yaml`。

---

## Circle Workflow

Produce commands (`imagen`, `animate`, `comfy`, `webapp`) run inside a circle directory or with `--manifest`:

```bash
# Enter circle directory and run
cd opsv-queue/videospec.circle1
opsv imagen --model volc.seadream5

# Or specify manifest path
opsv imagen --model volc.seadream5 --manifest opsv-queue/videospec.circle1/_manifest.json

# Run specific asset by id
opsv imagen --model volc.seadream5 --file hero

# Filter by category
opsv imagen --model volc.seadream5 --category character

# Skip specific statuses (default: approved)
opsv imagen --model volc.seadream5 --status-skip approved,drafting
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
    volc.seadream5_001/         # api_config model alias + sequence
      @hero.json
      @hero_1.png
  role.circle2/                # Terminal circle (contains shots)
    _manifest.json
    volc.seedance2_001/
      shot_01.json
      shot_01_1.mp4
```

### Manifest Structure

```json
{
  "version": "0.8.15",
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
6. **Model Queue Versioning**: Each compile creates a new model queue directory with a `_NNN` suffix (e.g. `volc.seadream_001`), preserving prior compilations for traceability and A/B adjustment.
7. **Manifest-First**: Produce commands read from manifest only, never scan directories.
8. **Circle-Bound Execution**: Produce commands run within or reference a specific circle.

---

## Git Integration

OpsV uses git as the version control layer for all project assets.

### Automatic Git Operations

| Command | Git Action |
|---------|------------|
| `opsv init` | Runs `git init` after scaffolding |
| `opsv review` | Auto-commits with `git add -A` before starting |

### Commit Conventions

- **Pre-review checkpoint**: `git commit -m "pre-review checkpoint: <ISO timestamp>"` — committed automatically by `opsv review` before the review server starts
- All other commits are manual

### Git Init Failure Handling

- `opsv init`: If `git init` fails (e.g., git not installed, repo already exists), a warning is printed after scaffolding:
  ```
  Warning: git init failed. Run "git init" manually to enable version control.
  ```

---

## Supported Providers

| Provider | Aliases | Type |
|----------|---------|------|
| Volcengine | `volc.seadream5`, `volc.seedance2`, `volc.seedance2f` | imagen, video |
| SiliconFlow | `siliconflow.qimg`, `siliconflow.edit2509`, `siliconflow.want2v`, `siliconflow.wani2v` | imagen, video |
| MiniMax | `minimax.img01`, `minimax.vid01` | imagen, video |
| RunningHub | `runninghub.default` | comfy |
| ComfyUI Local | `comfylocal.workflow` | comfy |
| Browser (extension) | `webapp.gemini` | webapp |

---

## Documentation

- [Specification](./docs/en/SPECIFICATION.md) — Complete v0.8 spec
- [Design Philosophy](./docs/en/DESIGN-PHILOSOPHY.md) — Principles and rationale

---

## License

MIT

> *OpsV v0.8.15 | 2026-05-02*

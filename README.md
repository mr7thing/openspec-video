# OpenSpec-Video (OpsV) v0.9.0

> **Spec-as-Code** framework that compiles narrative Markdown into production-ready media via a multi-provider pipeline with circle-centric dependency management.

---

## What is OpsV?

OpsV is a **spec-driven** cinematic AI automation framework. You write narrative specifications in Markdown with YAML frontmatter; OpsV builds dependency graphs, compiles provider-specific tasks, executes them, and manages the review loop.

All project assets live under `videospec/`. OpsV never modifies content fields — it only reads specs and produces task artifacts.

---

## Quick Start

```bash
# Install
npm install -g videospec

# Initialize project
opsv init my-project
cd my-project

# 1. Build dependency graph → create circle directories
opsv circle create

# 2. Compile and execute image tasks
cd opsv-queue/videospec_circle1
opsv imagen --model volc.seadream5
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/

# 3. Review and approve outputs
opsv review

# 4. Advance to next circle
opsv circle refresh
```

---

## Command Tree (11 commands)

```
opsv
├── init [name]                      # Project scaffold + git init
├── validate [-d]                     # Document validation
├── circle
│   ├── create [--dir] [--name]      # Build graph, create circle directories
│   └── refresh [--dir]              # Rebuild graph, diff manifest, update
├── imagen --model <m>               # Compile image tasks (Volc/Minimax/SiliconFlow)
├── animate --model <m>              # Compile video tasks
├── comfy --model <m>                # Compile ComfyUI workflow tasks
├── audio --model <m>                # [planned]
├── webapp --model <m>               # Browser automation via Gemini
├── run <paths...>                   # Execute compiled task .json files
├── review                           # Visual review server
└── iterate <path>                   # Clone task JSON or model queue dir
```

**Stand-alone utility:**
```
opsv comfy-node-mapping <workflow-file>   # Analyze ComfyUI JSON → node_mappings for api_config
```

---

## Core Concepts

### Videospec Directory Structure

```
videospec/
  elements/          # Characters, props, locations (approved upstream assets)
  scenes/            # Scene compositions (reference elements)
  shots/             # Shot specifications (reference scenes/elements)
opsv-queue/
  {target}_circle1/  # Circle directory (incremental, never overwritten)
    _manifest.json   # Circle manifest: layer index + all assets
    {provider}_{seq}/ # Model queue directory (incremental per compile)
      @assetId.json  # Task JSONs
      @assetId_1.png
```

### Circle

A **circle** is a dependency layer produced by topological sort of the asset graph.

- `circle create` scans `elements/`、`scenes/`、`shots/` by default
- `circle refresh` rebuilds the graph and updates manifest (does not overwrite existing circle dirs)
- Circles are named `{target}.circle{N}` (e.g. `videospec_circle1`)
- Zero-dependency assets land in `zerocircle` (index 0)

### Incremental Preservation Principle

**All task outputs in `opsv-queue/` are append-only. OpsV never deletes them.**

- `circle create` creates a **new** circle directory. Existing circles are preserved.
- `imagen` / `animate` / `comfy` compile into a **new** model queue directory (e.g. `volc.seadream_002/`). Prior compilations are never touched.
- `iterate` clones task JSONs or model queue dirs with `_m{N}` / `_{seq}` suffixes, preserving the originals.
- `run` executes tasks but does not delete outputs.

This means every version of every asset is always reachable. Delete manually only when you are certain.

### Produce Commands (imagen / animate / comfy / webapp)

All four share the same execution model:

```bash
# Enter circle directory and compile
cd opsv-queue/videospec_circle1
opsv imagen --model volc.seadream5

# Or specify manifest explicitly
opsv imagen --model volc.seadream5 --manifest opsv-queue/videospec_circle1/_manifest.json

# Target specific asset
opsv imagen --model volc.seadream5 --file hero

# Filter by category
opsv imagen --model volc.seadream5 --category character

# Dry run (show tasks without writing)
opsv imagen --model volc.seadream5 --dry-run
```

| Option | Description |
|--------|-------------|
| `--manifest <path>` | Path to _manifest.json (or directory containing it) |
| `--file <id>` | Run specific asset by id from manifest |
| `--category <cat>` | Filter assets by category (from frontmatter) |
| `--status-skip <statuses>` | Comma-separated statuses to skip (default: approved; use "none" to skip nothing) |
| `--dry-run` | Show compiled tasks without writing files |

---

## `--model` 参数与 API Config 别名

`--model` 参数使用 `api_config.yaml` 中定义的**模型别名**（key），不是 API 模型名。所有配置从 `api_config.yaml` 读取，代码无硬编码。

```bash
opsv imagen --model volc.seadream5       # 不是 "doubao-seedream-5-0-260128"
opsv animate --model volc.seedance2      # 不是 "doubao-seedance-2-0-260128"
opsv imagen --model minimax.img01        # 不是 "image-01"
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
| `comfylocal.*` | comfy | ComfyUI Local (workflow_path + node_mapping in frontmatter) |
| `runninghub.*` | comfy | RunningHub Cloud (workflow_id + node_mapping in frontmatter) |
| `webapp.gemini` | webapp | Gemini 浏览器自动化 |

完整配置见 `.opsv/api_config.yaml`。

---

## Workflow: Node Mapping → Compile → Iterate

### Workflow File Convention

Each workflow has **two files** living side by side:

```
workflows/
  my_workflow.json              # ComfyUI API workflow JSON (editable)
  my_workflow.opsv-workflow.json  # OpsV metadata: workflowId + node_mappings (generated)
```

**`.opsv-workflow.json` 结构：**

```json
{
  "workflowId": "rh_abc123",       // RunningHub ID (null if local-only)
  "workflowPath": "workflows/my_workflow.json",  // local path (null if cloud-only)
  "nodeMappings": {
    "prompt": { "nodeId": "3", "fieldName": "text" },
    "image":  { "nodeId": "5", "fieldName": "image" }
  },
  "opsvVersion": "0.9.0"
}
```

**约定：**
- `opsv-workflow.json` 由 `opsv comfy-node-mapping` 自动生成，不要手动编辑
- `workflow.json` 是你的工作区，可以在 ComfyUI/RunningHub 中任意修改
- 在 `opsv-workflow.json` 中可以同时设置 `workflowId` + `workflowPath`（同时支持本地和云端）
- 只有你需要 opsv 控制的节点才需要在 ComfyUI 中用 `opsv-` 前缀命名（输入/输出相关）

**`opsv-` 前缀映射规则**：
- 前缀后的字符串 = 映射键（如 `opsv-prompt` → key `prompt`，`opsv-image1` → key `image1`）
- 映射键对齐 api_config `inputs` key 和 frontmatter `refs.type`
- fieldName 自动推断，优先级：`text` → `image` → `video` → `audio` → `seed` → `width` → `height` → 第一个输入字段

### Step 1: Extract node mappings

Design your workflow in ComfyUI, name nodes with prefix `opsv-` (right-click → Title), then:

```bash
# Print to stdout (copy-paste or redirect yourself)
opsv comfy-node-mapping workflows/my_workflow.json

# Write directly to .opsv-workflow.json
opsv comfy-node-mapping workflows/my_workflow.json -o workflows/my_workflow.opsv-workflow.json

# Cloud workflow (RunningHub) → embed workflow-id
opsv comfy-node-mapping workflows/my_workflow.json --workflow-id rh_abc123 -o workflows/my_workflow.opsv-workflow.json
```

**输出格式（`.opsv-workflow.json`）：**

```json
{
  "workflowId": "rh_abc123",       // RunningHub ID (null if local-only)
  "workflowPath": "workflows/my_workflow.json",
  "nodeMappings": {
    "prompt": { "nodeId": "3", "fieldName": "text" },
    "image":  { "nodeId": "5", "fieldName": "image" }
  },
  "opsvVersion": "0.9.0"
}
```

**约定：**
- `workflowId` + `workflowPath` 可以同时存在（同时支持本地和云端执行）
- `opsv-workflow.json` 由命令生成，不要手动编辑（重新跑命令即可覆盖）

### Step 2: Configure api_config.yaml

Add the model to `.opsv/api_config.yaml`, pointing to the `.opsv-workflow.json`:

```yaml
models:
  comfylocal.myworkflow:
    type: comfy
    provider: comfylocal
    templateDir: workflows/
    workflowFile: workflows/my_workflow.opsv-workflow.json

  runninghub.cloudflow:
    type: comfy
    provider: runninghub
    templateDir: workflows/
    workflowFile: workflows/cloud_workflow.opsv-workflow.json
```

### Step 3: Compile and run

```bash
opsv circle create
cd opsv-queue/videospec_circle1
opsv comfy --model comfylocal.myworkflow
opsv run opsv-queue/videospec_circle1/comfylocal.myworkflow_001/

# Force using api_config node_mappings (ignore frontmatter)
opsv comfy --model runninghub.default --force-api-mapping
```

**Node Mapping 降级策略**（优先级从高到低）：

| 优先级 | 来源 | 触发条件 |
|--------|------|----------|
| 1 | `api_config.yaml` `node_mappings` | `--force-api-mapping` |
| 2 | 文档 frontmatter `node_mapping` | 默认，frontmatter 有值时优先 |
| 3 | `api_config.yaml` `node_mappings` | frontmatter 无值时兜底 |

**inputs + node_mappings 协作**（v0.9.0）：`inputs` 定义数据来源（source），`node_mappings` 定义注入位置（nodeId + fieldName）。inputs key 与 node_mappings key 对齐。

### Step 4: Iterate (preserve previous, clone new)

```bash
# Clone a single task JSON
opsv iterate opsv-queue/videospec_circle1/comfylocal.myworkflow_001/@hero.json
# → @hero_m1.json (same dir, next seq)

# Clone an entire model queue directory
opsv iterate opsv-queue/videospec_circle1/comfylocal.myworkflow_001/
# → comfylocal.myworkflow_001_1/ (new dir, all task JSONs cloned)
```

`iterate` 两种模式：
- **文件模式**：`@hero.json` → `@hero_m1.json`（同一目录，找最大 `_mN` 后缀递增）
- **目录模式**：`model_001/` → `model_001_1/`（复制所有 task JSON，去掉 `_opsv.compiledAt`）

---

## Circle Workflow

Produce commands (`imagen`, `animate`, `comfy`, `webapp`) run inside a circle directory or with `--manifest`:

```bash
# Enter circle directory and run
cd opsv-queue/videospec_circle1
opsv imagen --model volc.seadream5

# Or specify manifest path
opsv imagen --model volc.seadream5 --manifest opsv-queue/videospec_circle1/_manifest.json
```

---

## Core Architecture

### Circle-Centric Dependency

Tasks are organized into **Circles** (dependency layers via topological sort):

```
opsv-queue/
  videospec_circle1/              # Circle directory (incremental, never overwritten)
    _manifest.json                # Circle manifest: circles[], assets{}
    volc.seadream5_001/          # Model queue dir (incremental per compile)
      @hero.json
      @hero_1.png
  videospec_circle2/              # Next circle, previous preserved
    _manifest.json
    volc.seedance2_001/
      shot_01.json
      shot_01_1.mp4
```

### Manifest Structure

```json
{
  "version": "0.9.0",
  "target": "videospec",
  "generatedAt": "2026-04-30T00:00:00.000Z",
  "circles": [
    { "circle": "zerocircle", "index": 0, "assetIds": ["hero", "villain"] },
    { "circle": "firstcircle", "index": 1, "assetIds": ["shot_01"] }
  ],
  "assets": {
    "hero": { "status": "approved", "index": 0, "category": "character" },
    "shot_01": { "status": "drafting", "index": 1, "category": "shot-production" }
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

### Input Binding (v0.9.0)

OpsV v0.9.0 introduces a unified input binding chain: **frontmatter refs → type classification → api_config inputs → API payload**.

**Structured refs** in frontmatter (replaces string array):

```yaml
refs:
  - id: "@hero"
    type: image            # image / video / audio / bvh / mask / custom
  - id: "@bgm"
    type: audio
  - id: "@style:night"     # variant reference
    type: image
```

**Typed sections** in body (aligns with api_config `inputs` keys):

```markdown
### image
[Hero design](#hero)         # internal ref → resolves to hero's image output
[Style ref](#style:night)     # variant ref

### audio
[Background music](#bgm)
```

**api_config inputs** (configurable, zero-hardcode):

```yaml
volc.seedance2:
  inputs:
    prompt:
      source: prompt
      target: content[0].text
    first_frame:
      source: first_frame
      target: content[].image_url
    image:
      source: reference_images
      target: content[].image_url
    audio:
      source: reference_audios
      target: content[].audio_url
```

**Source shortcuts**: `prompt`, `negative_prompt`, `first_frame`, `last_frame`, `reference_images[N]`, `reference_videos`, `reference_audios`, `job.payload.X`, `default.X`

Compilers use `InputEvaluator` when `inputs` is configured, falling back to legacy naming convention for backward compatibility.

---

## Key Design Principles

See [Design Philosophy](./docs/en/DESIGN-PHILOSOPHY.md) for the full rationale.

1. **Spec-as-Code**: Markdown is the single source of truth.
2. **Intent-Execution Decoupling**: Produce commands compile; `opsv run` executes.
3. **Physical State Machine**: Task state = file existence.
4. **CLI Does Only Deterministic Actions**: CLI never modifies content fields.
5. **By-Provider Parallelism**: Same provider serial, different providers parallel.
6. **Incremental Preservation**: Queue outputs are never deleted. `circle create` creates new circles; produce commands create new model queue dirs; `iterate` clones rather than modifies.
7. **Manifest-First**: Produce commands read from manifest only, never scan directories.
8. **Circle-Bound Execution**: Produce commands run within or reference a specific circle.
9. **Model Queue Versioning**: Each compile creates a new model queue directory with a `_NNN` suffix (e.g. `volc.seadream_001`), preserving prior compilations for traceability and A/B adjustment.

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

> *OpsV v0.9.0 | 2026-05-19*

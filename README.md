# OPSV

> **Video production like software development.** Define specs in Markdown. Agents build, validate, iterate. OPSV compiles to images and video. Change a prompt, recompile, ship a new version — without touching a timeline.

---

## The Big Idea

OPSV is a **compiler for video**. Your Markdown documents are source code. OPSV reads them, validates them, resolves dependencies, and compiles them into AI API calls. Outputs: images, videos, voiceovers — versioned, traceable, never overwritten.

```
Your Markdown docs        OPSV Engine              AI-generated output
───────────────     →     ────────────     →     ───────────────────
@hero.md                  validate                 @hero_1.png
@temple.md                resolve deps             @temple_1.png
shot_01.md                compile tasks            shot_01_1.mp4
                          execute API              final_video.mp4
```

OPSV is **designed for AI agents**. Define validation contracts per document type, and the agent writes, validates, and iterates in a loop — automatically — until it passes. Humans step in at the Review checkpoint, not at every trivial decision.

---

## Design Principles

| Principle | Meaning |
|-----------|---------|
| **Documents are source code** | Markdown frontmatter is the single source of truth. No database. |
| **Compile / Execute / Review are separate** | Inspect before running. Debug step by step. |
| **Incremental, never destructive** | Every run appends. Full history preserved. |
| **Three-tier config** | Built-in defaults → `~/.opsv/` (user) → `./.opsv/` (project). Only override what differs. |
| **Hooks, not opinions** | OPSV validates and compiles. Creative decisions belong to the agent. |

---

## Install

```bash
npm install -g videospec
```

Or from source:

```bash
git clone https://github.com/mr7thing/openspec-video.git
cd openspec-video/cli
npm install && npm run build && npm link
```

---

## Quick Start

```bash
opsv init my-project
cd my-project

# Setup your API keys
cp .env.sample .env           # then edit .env with your keys
# Or: opsv api-setup          # interactive guided setup

# Write your documents in videospec/
opsv validate
opsv circle create
opsv imagen --model volcengine.seadream
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/
opsv review
```

---

## How It Works

### The core loop

```
validate → circle create → compile (imagen/animate) → run → review → approve (or iterate)
```

### `opsv init` — scaffold project

Creates the directory skeleton, copies built-in configs as `.sample` files (rename to activate), and generates `.env.sample` with all required API key placeholders.

Config is loaded from a **three-tier config** system:

| Tier | Location | Purpose |
|------|----------|---------|
| Built-in | `cli/.opsv/` | Provider registry, defaults |
| User | `~/.opsv/` | API keys, personal overrides |
| Project | `./.opsv/` | Project-specific overrides |

Config is loaded bottom-up. A project only needs files for what it overrides.

### Category-driven validation

Every document declares a `category`. Categories have rules defined in `category_validate.yaml` (three-tier: built-in → `~/.opsv/` → project `videospec/_category_validate.yaml`). `opsv validate` catches missing fields, placeholders, and dead references before any API call.

### Reference-driven dependency graph

Documents declare dependencies with `@`-syntax:

```yaml
refs:
  image:
    "@lu_ran": [path/to/lu_ran.png]
    "@temple_hall": [path/to/temple.png]
```

OPSV resolves these into a DAG. Zero-dependency docs run first; dependent docs wait. `opsv refs check` ensures prompt ↔ refs alignment. `opsv refs fill` auto-fills missing refs.

### Never overwrite

Every iteration produces a new suffix (`_m1`, `_m2`). Failed tasks leave logs. You can always compare `shot_01_1.png` vs `shot_01_m1_1.png` and pick.

---

## Commands

| Command | What it does |
|---------|-------------|
| `opsv init` | Create project skeleton (dirs + `.sample` configs + `.env.sample`) |
| `opsv validate` | Check documents against category rules |
| `opsv circle create` | Analyze deps, build execution DAG |
| `opsv circle refresh` | Refresh status without re-creating circles |
| `opsv imagen` | Compile image generation tasks |
| `opsv animate` | Compile video generation tasks |
| `opsv comfy` | Compile ComfyUI workflow tasks |
| `opsv run` | Execute compiled tasks against AI providers |
| `opsv review` | Visual review & approve / reject |
| `opsv approve <file>` | Approve a single output — adds to ## Approved References |
| `opsv iterate` | Clone task for retry with modified params |
| `opsv api-setup` | Configure API keys and providers (interactive + agent mode) |
| `opsv refs check` | Diagnose prompt ↔ refs alignment |
| `opsv refs fill` | Auto-fill missing refs keys + paths |
| `opsv login / logout` | OPSV Cloud auth |

> Full reference: `opsv-cli-skill/references/cli_reference.md`

---

## Supported Providers

| Provider | Image | Video | Notes |
|----------|:-----:|:-----:|-------|
| **Volcengine** (Seedream / Seedance) | ✅ | ✅ | seadream5 / seadream5pro / seedance2 / seedance2f / seedance2mini |
| **SiliconFlow** (Qwen / Wan) | ✅ | ✅ | |
| **Minimax** | ✅ | ✅ | |
| **RunningHub** | ✅ | — | Grid storyboard |
| **RunningHub API** (rhapi) | ✅ | ✅ | Direct REST |
| **ComfyUI Local** | — | ✅ | Custom workflows |
| **RH Workflow** (rhworkflow) | ✅ | ✅ | Workflow Run API, `opsv comfy` mode |
| **Webapp** | ✅ | ✅ | Browser automation |

---

## Changelog

### v0.14.7 (2026-07-11)

- **feat(volcengine)**: Add SeaDream 5.0 Pro (`volc.seadream5pro`) — flagship single-image generation, up to 10 reference images, 1K/2K resolution presets
- **feat(volcengine)**: Add Seedance 2.0 Mini (`volc.seedance2mini`) — high cost-efficiency video generation
- **feat(rhworkflow)**: New `rhworkflow.*` provider for RunningHub Workflow Run API (`/run/workflow/{apiId}`), comfy mode, supports base64 / rh_upload file modes, sync + async response handling
- **docs**: Usage examples for all new models in SKILL.md and provider table

### v0.14.6

- Previous release

---

## Project Structure

```
my-project/                    ← created by opsv init
├── videospec/
│   ├── elements/              # Characters, props
│   ├── scenes/                # Scene descriptions
│   └── shots/                 # Shot designs
├── opsv-queue/                # Build output (gitignored)
├── .opsv/                     # Project config overrides (optional)
└── .gitignore
```

---

## Customize Your Pipeline with Skill Packs

OPSV doesn't force one pipeline. Skill Packs let you define **your own** production workflow — stages, document types, validation rules, prompt frameworks, and agent instructions. Compose packs like libraries: swap storyboard styles, change character design rules, add new stages.

### Anatomy of a Skill Pack

```
my-pack/
├── SKILL_PACK.md                 # Standard pack descriptor (agent framework entry)
├── README.md                     # Install & usage guide
├── manifest.json                 # OPSV runtime metadata (optional)
├── SKILL.md                      # Entry skill (pack navigator)
├── guides/                       # Shared prompt frameworks
├── references/                   # Shared reference docs (CLI, refs, file specs)
├── .opsv/
│   └── _category_validate.yaml   # Per-category validation contracts
└── skills/                       # Stage skills (one dir per stage)
    ├── opsv-<stage-1>/           #   SKILL.md + references per stage
    ├── opsv-<stage-2>/
    └── ...
```

### Per-category validation

Define what "done" means for each document type:

```yaml
# _category_validate.yaml
project:
  required_fields: [status]
  skip_prompt_check: true

character:
  required_fields: [prompt, visual_brief, refs]
  field_schema:
    prompt:
      min_length: 50
      no_placeholder: true
```

### Stage skills

Each stage is a self-contained SKILL.md that tells the agent **what to produce, how to produce it, and what rules to follow**. The agent reads the pack, understands the pipeline, and executes stage by stage — invoking `opsv` commands for validation, compilation, and execution.

### Multi-Ref Pack (9-stage short-drama pipeline)

A reference implementation: from drama graph extraction through to editable video clips — an S0→S6 production pipeline.

```
S0: Pipeline Navigator     S4: Asset Creation (characters + scenes)
S1: Drama Graph            S5: Shot Reference Frames
S2: Beat Script            S5.5: Storyboard (6-color motion annotation)
S3: Shotlist               S6: Video Clips (4-shot / 12s)
```

The pipeline goes up to **asset/clip generation**. Final editing, sound mixing, color grading, and mastering are handled by human editors or dedicated editing skills downstream.

### Get started

1. **Mount a pack** into your project's agent skills discovery path:
   ```bash
   cp -r my-pack  <project>/.agents/skills/my-pack
   ```
2. The agent discovers the entry skill and executes stage by stage
3. Customize `_category_validate.yaml` to match your quality standards
4. Add new stages by creating new skill directories under `skills/`

> The repo includes `opsv-cli-skill/` — the CLI operator skill (standard agent format). It teaches agents opsv commands, document specs, and antipatterns. It's the foundation layer any pipeline pack builds on — **installed independently** as a separate skill.

---

## License

MIT

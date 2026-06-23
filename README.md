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
opsv circle create --dir videospec
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
| `opsv approved` | Agent-driven batch approval |
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
| **Volcengine** (Seedream / Seedance) | ✅ | ✅ | |
| **SiliconFlow** (Qwen / Wan) | ✅ | ✅ | |
| **Minimax** | ✅ | ✅ | |
| **RunningHub** | ✅ | — | Grid storyboard |
| **RunningHub API** (rhapi) | ✅ | ✅ | Direct REST |
| **ComfyUI Local** | — | ✅ | Custom workflows |
| **Webapp** | ✅ | ✅ | Browser automation |

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
├── .agent/skills/            # Agent instructions per stage
│   ├── opsv-ref-pipeline/    #   Pipeline navigator (S0)
│   ├── beat-script/          #   Script breakdown (S1)
│   ├── create-elements/      #   Asset generation (S2)
│   ├── shot-storyboard/      #   Storyboard design (S3)
│   └── shotgen/              #   Video production (S4)
├── videospec/
│   └── _category_validate.yaml  # Per-category validation contracts
├── SKILL_SPEC.md                 # Skill authoring spec
└── README.md
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

### Multi-Ref Pack (example 8-stage pipeline)

A reference implementation showing the full capability — from drama graph extraction through final video production:

```
S0: Pipeline Navigator     S4: Asset Creation
S1: Drama Graph            S5: Shot Reference
S2: Beat Script            S5.5: Storyboard
S3: Shortlist              S6: Video Generation
```

### Get started

1. Symlink a pack into your project as `.agent/skills/`
2. The agent discovers the pipeline and executes stage by stage
3. Customize `_category_validate.yaml` to match your quality standards
4. Add new stages by creating new skill directories

> The repo includes `opsv-cli-skill/` — the operator manual AI agents use to drive the CLI. It's the base layer every pack builds on.

---

## License

MIT

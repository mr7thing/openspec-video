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
git clone https://github.com/mr7thing/openspec-video.git
cd openspec-video/cli
npm install
npm run build
npm link                    # makes `opsv` available globally
```

> The CLI lives in `cli/`. Skills and packs are at the repo root — the agent reads them directly.

---

## Quick Start

```bash
opsv init my-project
cd my-project

# Setup your API keys in ~/.opsv/.env
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

### `opsv init` — scaffold only

Creates the directory skeleton. No config files are copied — OPSV uses a **three-tier config** system:

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
| `opsv init` | Create project skeleton (dirs + .gitignore only) |
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

## Skill Packs

Skill Packs define production workflows — stages, validation rules, prompt frameworks, and agent instructions. They live in `opsv-packs/` and are symlinked as needed. The repo ships with:

- `opsv-cli-skill/` — Operator manual for AI agents using the OPSV CLI

---

## License

MIT

# OPSV

> **Video production should feel like software development.** You define the spec in Markdown. Agents build, validate, and iterate. OPSV compiles everything into images and video. Change a prompt, recompile, ship a new version — all without touching a timeline.

---

## The Big Idea

Think of OPSV like a **compiler for video**. Your Markdown documents are the source code. OPSV's engine reads them, validates them, resolves dependencies, and compiles them into AI API calls. The outputs? Images, videos, voiceovers — versioned, traceable, never overwritten.

```text
Your Markdown docs        OPSV Engine              AI-generated output
───────────────     →     ────────────     →     ───────────────────
@hero.md                  validate                 @hero_1.png
@temple.md                resolve deps             @temple_1.png
shot_01.md                compile tasks            shot_01_1.mp4
shotdeck.md               execute API              final_video.mp4
```

**And here's where it gets different**: you don't have to follow one fixed pipeline. You compose your workflow through **Skill Packs** — reusable bundles of stages, validation rules, prompt frameworks, and agent instructions. Need a 7-stage comic production pipeline? There's a pack for that. Need a lightweight single-shot prototyping flow? Use a different one. Need something entirely new? Build your own.

OPSV is **designed for AI agents**. Define what "done" looks like for each document type, and the agent will write, validate, and iterate in a loop — automatically — until it passes. Humans step in at the Review checkpoint, not at every trivial decision.

It's like software development. You have the right documents and the right validation contracts, you can build any video application.

---

## What Makes OPSV Different

### Built for agents first. Humans where it matters.

OPSV is designed from the ground up for AI agents to work autonomously. Every document type has a **validation contract** — required fields, minimum lengths, forbidden placeholders, bidirectional reference checks. The agent writes a document, runs `opsv validate`, sees what failed, fixes it, and loops.

```
Agent writes doc  →  opsv validate  →  ✗ 3 errors
                                    →  Agent fixes field X
                                    →  opsv validate  →  ✗ 1 error
                                    →  Agent fixes refs
                                    →  opsv validate  →  ✓ pass
```

This loop can run **hundreds of times without human intervention**. The validation rules are defined per category in a simple YAML file — you decide what "done" means for a character design, a shot breakdown, or a storyboard. The agent iterates until the contract is satisfied.

When human judgment is needed — visual quality, narrative feel, creative direction — there's the **Review checkpoint**. `opsv review` opens a visual interface where you approve or reject. One click, and the pipeline continues. No futzing with file paths or JSON manifests.

### Full lifecycle management. Iteration is the engine.

Every document in OPSV has a managed lifecycle: `drafting` → `approved`. But that's just the surface. The real story is **iteration** — the ability to refine a document's output without starting over.

```text
drafting ──→ compile ──→ execute ──→ review
    │                                    │
    │                              ┌─────┴──────┐
    │                              │  approve    │  reject
    │                              │  status →   │  status →
    │                              │  approved   │  drafting
    │                              └─────┬───────┘
    │                                    │
    └── iterate ←── modify prompt  ←────┘
         │
         └── compile ──→ execute ──→ review ──→ approve
```

`opsv iterate` creates a new compiled task with modified parameters — a refined prompt, a different model, adjusted reference weights. The output gets a new version suffix (`_2`, `_3`, `_4`). Every attempt is preserved. You compare `shot_01_1.png` vs `shot_01_3.png` and pick the winner.

An agent can run this cycle autonomously: generate → review result → iterate with a better prompt → generate again → until the output meets quality standards. The human approves once, at the end.

This is how OPSV manages **the entire lifecycle of a document artifact** — from first draft to final approved output, through as many iterations as needed.

### Documents are the source code.

Characters, scenes, props, shots — all live as Markdown files with YAML frontmatter. Their `status` field (`drafting` → `approved`) drives the entire pipeline. No database. No hidden state. Git tracks every change. You can branch, diff, revert, and collaborate like you would with code.

```yaml
---
asset_id: lu_ran
category: character
status: drafting
visual_brief: 青年男子，玄黑长袍，剑眉星目...
refs:
  image:
    @style_donghua: null
---
```

### Define the contract. The agent delivers.

Every Skill Pack defines a `category_validate.yaml` — the contract for each document type:

```yaml
comic_character:
  required_fields: [prompt, visual_brief, voice_profile, refs]
  checks:
    - min_length: { field: prompt, min: 50 }
    - no_placeholder: [TODO, FIXME, TBD]
    - refs_in_prompt_must_match_refs: true
```

The agent reads this contract. It knows exactly what constitutes a valid character document. It doesn't guess. It doesn't need a human to check every field. It validates, iterates, and only asks for review when the contract is met.

### Flexible like code. Composable like functions.

Most video tools give you one pipeline. OPSV gives you the primitives to build any pipeline. Skill Packs are like libraries — each defines a production workflow. You can mix, match, and customize.

Want different character design rules for different projects? Switch the validation config. Want a different storyboard style? Swap the prompt framework. Want to add a new AI provider? Implement two interfaces and register it. Nothing is hardcoded.

### Hooks for the engine. Decisions for the agent.

OPSV validates, resolves, and compiles. It never injects its own opinions about lighting, composition, or how references should influence generation. That's the agent's domain, guided by your Skill Pack. The engine provides the hooks — the agent decides how to use them.

---

## Skill Packs: Build Once, Reuse Forever

A Skill Pack is a complete, shareable production workflow. It contains everything needed to go from script to final video — stages, validation rules, prompt templates, and agent instructions.

```
my-skill-pack/
├── SKILL.md                  # The workflow: stages, I/O contracts, agent roles
├── category_validate.yaml    # What "done" means for every document type
├── prompts/                  # Prompt frameworks for consistency
└── references/               # Guides, schemas, naming conventions
```

### What a Skill Pack defines

| Concern | How the pack defines it |
|---------|----------------------|
| **Production stages** | How many phases, what each produces, what feeds into what |
| **Document types** | What categories exist, what fields they require, how they validate |
| **Quality gates** | What checks run before a document can move to the next stage |
| **Prompt style** | Six-segment formula for character design, grid layout rules for storyboards, delta-edit conventions for iteration |
| **Agent behavior** | What the AI collaborator does at each stage, what it reads, what it writes |

### The Multi-Ref Pack (built-in example)

A complete 7-stage production pipeline, from script to video:

```
S0: Setup               →  Project scaffold + navigation
S1: Script Breakdown    →  Entity extraction + shot list
S2: Visual Design       →  Character / scene / prop design specs
S3: Shot Planning       →  Shot sheet + asset inventory
S4: Asset Generation    →  Visual assets + voice / BGM
S5: Storyboard          →  Multi-panel storyboard sketches
S6: Production          →  Final video generation
```

Each stage has its own validation rules. Documents flow from one stage to the next with explicit I/O contracts. An AI agent can run the entire pipeline autonomously.

### Build your own

The `opsv-pack-creator` guides you through creating a new Skill Pack:

```
1. Define your pipeline stages
2. Register document categories with validation rules
3. Write stage skills with input/output contracts
4. Create prompt frameworks
5. Validate end-to-end
```

---

## How It Works

### The core loop: validate → compile → execute → review

```
┌──────────────────────────────────────┐
│           Your workspace              │
│                                       │
│  videospec/                           │
│  ├── elements/@hero.md                │
│  ├── scenes/@temple.md                │
│  └── shots/shot_01.md                 │
│      (refs: @hero, @temple)           │
└──────────────┬───────────────────────┘
               │
               ▼
       opsv validate          ←  Category rules check every document
               │
               ▼
       opsv circle create     ←  Dependency graph → execution order
               │
               ▼
       opsv imagen / animate  ←  Compile Markdown → provider-specific JSON
               │
               ▼
       opsv run               ←  Execute against AI APIs
               │
               ▼
       opsv review            ←  Visual review → approve / reject
               │
               ▼
       status: approved       ←  Unlocks downstream compilation
```

### Category-driven validation

Every document declares a `category`. Every category has rules:

```yaml
comic_character:
  required_fields: [prompt, visual_brief, voice_profile, refs]
  checks:
    - min_length: { field: prompt, min: 50 }
    - no_placeholder: [TODO, FIXME, TBD]
    - refs_in_prompt_must_match_refs: true   # bidirectional check
```

`opsv validate` catches missing fields, placeholder text, and dangling references before a single API call is made.

### Reference-driven dependency graph

Documents declare what they depend on through `@-syntax`:

```yaml
# shot_01.md
refs:
  image:
    @lu_ran: null        # ← depends on elements/@lu_ran.md
    @temple_hall: null    # ← depends on scenes/@temple_hall.md
```

OPSV resolves these into a dependency graph. Character and scene documents go into early circles because they have no dependencies. Shot documents go into later circles because they reference characters and scenes. The result: safe parallelism within each circle, guaranteed ordering across circles.

### Never overwrite. Always version.

Every compilation creates a new directory. Every iteration produces a new suffix (`_1`, `_2`, `_3`). Failed tasks leave error logs. You can always go back to `shot_01_2.png` if the third attempt goes sideways.

---

## At a Glance

| Command | What it does |
|---------|-------------|
| `opsv init` | Scaffold a new project |
| `opsv validate` | Check all documents against category rules |
| `opsv circle create` | Analyze dependencies, build execution order |
| `opsv imagen` | Compile image generation tasks |
| `opsv animate` | Compile video generation tasks |
| `opsv run` | Execute compiled tasks against AI providers |
| `opsv review` | Visual review & approve / reject |
| `opsv iterate` | Modify and retry a task |

---

## Supported Providers

OPSV compiles your specs into provider-specific API calls. Switch providers without touching your documents.

| Provider | Image | Video | Notes |
|----------|:-----:|:-----:|-------|
| **Volcengine** (Seedream / Seedance) | ✅ | ✅ | Highest quality, 24fps video |
| **SiliconFlow** (Qwen / Wan) | ✅ | ✅ | Reliable, wide model availability |
| **Minimax** | ✅ | ✅ | |
| **RunningHub** (GPT Image 2) | ✅ | — | Grid storyboard generation |
| **RunningHub API** (rhapi) | ✅ | ✅ | Direct REST, multi-model |
| **ComfyUI Local** | — | ✅ | Custom node workflows |

Add a new provider by implementing two interfaces: `ProviderCompiler` + `Provider`. One line to register.

---

## Project Structure

```
my-project/
├── videospec/                  # ← Your workspace (git tracked)
│   ├── project.md              # Global config + asset registry
│   ├── elements/               # Characters, props
│   ├── scenes/                 # Scene descriptions
│   ├── shots/                  # Shot designs
│   └── _category_validate.yaml # Per-project validation rules
│
├── opsv-queue/                 # ← Build output (gitignored, never deleted)
│   └── videospec_circle1/
│       ├── _manifest.json
│       └── volcengine.seadream_001/
│           ├── @lu_ran.json    # Compiled task
│           └── @lu_ran_1.png   # Generated output
│
└── .opsv/                      # Project config
    ├── api_config.yaml         # Provider + model settings
    └── input_types.yaml        # Registered input types
```

---

## Quick Start

```bash
npm install -g videospec
mkdir my-project && cd my-project
opsv init

# Write your specs, then:
opsv validate
opsv circle create
opsv imagen --model volcengine.seadream5
opsv run ./opsv-queue/videospec_circle1
opsv review
```

---

## Design Principles

| Principle | Meaning |
|-----------|---------|
| **Documents are source code** | Markdown frontmatter is the single source of truth. No database. |
| **Lifecycle with iteration** | Every artifact goes `drafting → approved` through as many iterations as needed. Agents loop autonomously. Humans approve at the end. |
| **Define contracts, let agents iterate** | `category_validate.yaml` defines what "done" means. Agents validate and fix until the contract is met. |
| **Flexibility over convention** | Skill Packs define the workflow, not the engine. Compose freely. |
| **Hooks, not rules** | The CLI validates and compiles. The agent makes creative decisions. |
| **Incremental, never destructive** | Every run appends. Nothing is overwritten. Full history preserved. |
| **Compile / Execute / Review are separate** | Inspect before running. Re-run against different providers. Debug step by step. |

Read the full [Design Document](docs/DESIGN.md).

---

## Documentation

| Document | Topic |
|----------|-------|
| [Pipeline Guide](docs/PIPELINE.md) | End-to-end flow, circles, state machine |
| [Design Document](docs/DESIGN.md) | Why each architectural decision was made |
| [Architecture](docs/ARCHITECTURE.md) | Layered architecture, data flow |
| [Skill Pack Guide](templates/.agent/skills/opsv/references/skill_package_guide.md) | Creating and structuring skill packs |
| [CLI Reference](templates/.agent/skills/opsv/references/cli_reference.md) | Complete command reference |

---

## Contribute

OPSV is a platform — it grows through Skill Packs, providers, and hooks.

**Build a Skill Pack** — the most impactful way to contribute. Every production style, every animation technique, every creative workflow can become a reusable, shareable pack.

**Add a Provider** — implement `ProviderCompiler` + `Provider` for a new AI backend. One registration line.

**Propose a Hook** — think the engine should expose a new primitive? Open an issue with the use case.

MIT licensed. Build what you want.

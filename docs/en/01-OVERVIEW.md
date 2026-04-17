# OpsV Project Panorama

> **OpenSpec-Video (OpsV) 0.5.19** — An automation framework that compiles Markdown narratives into video/image generation tasks.

---

## 1. What is OpsV?

OpsV is a **Spec-as-Code** video production pipeline. It allows creators (directors, PMs, art directors) to write stories, independently define assets (characters/scenes/props), and design shots in Markdown. The CLI then "compiles" these text specifications into executable JSON job queues.
With the v0.5 refactoring, OpsV has fully moved into the **Spec-First** era. It now leverages **Dependency Graph Topological Sorting** and **Two-Stage Runtime Validation** to ensure a rock-solid automation engine.

**Core Principles**:

- **Spec-as-Code**: `.md` files are the single source of truth; images and videos are merely compilation artifacts.
- **Dependency-Driven**: Relies on `## Approved References` to establish causal constraints between entities.
- **Format Review**: Ensures 100% synchronization between metadata and output artifacts via the Review UI.
- **Motion-Static Separation**: Decouples image generation from video generation pipelines to maintain consistency.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | TypeScript | Core logic |
| CLI Framework | Commander.js | Command Line Interface |
| Communication | WebSocket (ws) | Daemon ↔ Browser Extension |
| Configuration | dotenv + js-yaml | Env variables + YAML config |
| Validation | Zod | Job schema validation |
| Logging | Winston | Unified logging system |
| Parsing | unified + remark | Markdown/YAML parsing |
| HTTP | Axios | API requests |

---

## 3. Standard Directory Structure

Project structure created by `opsv init`:

```
project/
├── .agent/                     # AI Agent configuration
│   ├── Creative-Agent.md       # Creator: brainstorming + spec settlement
│   ├── Guardian-Agent.md       # Guardian: validation + reflective sync
│   ├── Runner-Agent.md         # Runner: compilation + rendering
│   └── skills/                 # Skills library (9 Skills)
│       ├── opsv-architect/
│       ├── opsv-asset-designer/
│       ├── opsv-script-designer/
│       ├── opsv-animator/
│       ├── opsv-brainstorming/
│       ├── opsv-pregen-review/
│       ├── opsv-ops-mastery/
│       ├── opsv-enlightenment/
│       └── animation-director/
├── .antigravity/               # Antigravity tool configuration
│   ├── rules/                  # Behavioral rules
│   └── workflows/              # Workflow templates
├── .env/                       # Environment config (git ignored)
│   ├── secrets.env             # API keys
│   └── api_config.yaml         # Engine parameters
├── videospec/                  # Core narratives (Source of Truth)
│   ├── project.md              # Global config & asset manifest
│   ├── stories/                # Story outlines
│   │   └── story.md
│   ├── elements/               # Character/prop definitions
│   │   ├── @role_hero.md
│   │   └── @prop_sword.md
│   ├── scenes/                 # Scene definitions
│   │   └── @scene_forest.md
│   └── shots/                  # Storyboards & animation scripts
│       ├── Script.md           # Static composition
│       └── Shotlist.md         # Motion & animation
├── artifacts/                  # Generated outputs
│   └── drafts_N/               # Batch N rendering drafts
├── queue/                      # Job queues
│   ├── jobs.json               # Image generation jobs
│   └── video_jobs.json         # Video generation jobs
├── GEMINI.md                   # Gemini persona config
└── AGENTS.md                   # OpenCode/Trae unified protocol
```

---

## 4. Vocabulary

| Concept | Definition |
|---------|------------|
| **Spec-as-Code** | Using structured Markdown as the source code for video production. |
| **Dependency Graph** | `New in v0.5`. Performs topological parsing at compile time. Blocks generation if prerequisite assets are not formally approved. |
| **Review UI** | `New in v0.5`. Local Express Web interface replacing legacy CLI logic, allowing visual image selection, naming, and automated metadata writebacks. |
| **@ Reference Syntax** | Invokes approved asset variants using tags like `@role_K` or `@scene_bar:morning`. |
| **Motion-Static Separation** | Image pipeline (Script.md + Generator) and Video pipeline (Shotlist.md + Animator) are strictly independent. |
| **frame_ref** | `New in v0.5`. Replaces schema_0_3. Standard data payload to pass first/last frame reference images to models. |
| **Two-Stage Validation** | `New in v0.5`. Compile-time format checks combined with runtime hard-constraints (pixel sizes, aspect ratios, model token limits). |
| **Graceful Degradation** | `New in v0.5.14`. Dispatcher dynamically detects model capability boundaries before dispatch, auto-stripping unsupported parameters with warnings. |

---

## 5. Quick Start

```bash
# 1. Install
npm install -g videospec

# 2. Init
opsv init my-project

# 3. Configure
echo "VOLCENGINE_API_KEY=your_key" > .env/secrets.env

# 4. Write assets and shots (see Workflow guide)

# 5. Analyze dependencies
opsv deps

# 6. Generate jobs
opsv generate

# 7. Image generation
opsv gen-image

# 8. Web Review
opsv review

# 9. Animate & generate video
opsv animate
opsv gen-video
```

---

## 6. Documentation (EN)

| Document | Description |
|----------|-------------|
| [Workflow Guide](./02-WORKFLOW.md) | Three-role collaboration cycle |
| [CLI Reference](./03-CLI-REFERENCE.md) | All 9 commands in detail |
| [Agents & Skills](./04-AGENTS-AND-SKILLS.md) | 3 Agents + 9 Skills |
| [Document Standards](./05-DOCUMENT-STANDARDS.md) | Four-layer architecture, YAML templates, @ syntax |
| [Configuration](./06-CONFIGURATION.md) | .env directory & engine parameters |
| [API Reference](./07-API-REFERENCE.md) | Multi-model interface protocol |

---

> *"Code is for humans to read, and only incidentally for machines to execute."*
> *OpsV 0.5.19 | Latest Update: 2026-04-17*

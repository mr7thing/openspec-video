# OpsV Project Panorama

> **OpenSpec-Video (OpsV) 0.5.0** — An automation framework that compiles Markdown/YAML narratives into video/image generation tasks.

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
|------|------|------|
| Language | TypeScript | Core logic |
| CLI Framework | Commander.js | Command Line Interface |
| Communication | WebSocket (ws) | Daemon 鈫?Browser Extension |
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
鈹溾攢鈹€ .agent/                     # AI Agent configuration
鈹?  鈹溾攢鈹€ Architect.md            # Role definition: Architect
鈹?  鈹溾攢鈹€ Screenwriter.md         # Role definition: Screenwriter
鈹?  鈹溾攢鈹€ AssetDesigner.md        # Role definition: Asset Designer
鈹?  鈹溾攢鈹€ ScriptDesigner.md       # Role definition: Script Designer
鈹?  鈹溾攢鈹€ Animator.md             # Role definition: Animator
鈹?  鈹溾攢鈹€ Supervisor.md           # Role definition: Supervisor (QA)
鈹?  鈹斺攢鈹€ skills/                 # Skills library
鈹溾攢鈹€ .antigravity/               # Antigravity tool configuration
鈹溾攢鈹€ .env/                       # Environment config (git ignored)
鈹?  鈹溾攢鈹€ secrets.env             # API keys
鈹?  鈹斺攢鈹€ api_config.yaml         # Engine parameters
鈹溾攢鈹€ videospec/                  # Core narratives (Source of Truth)
鈹?  鈹溾攢鈹€ project.md              # Global config & asset manifest
鈹?  鈹溾攢鈹€ stories/                # Story outlines
鈹?  鈹溾攢鈹€ elements/               # Character/prop definitions
鈹?  鈹溾攢鈹€ scenes/                 # Scene definitions
鈹?  鈹斺攢鈹€ shots/                  # Storyboards & animation scripts
鈹?      鈹溾攢鈹€ Script.md           # Static composition
鈹?      鈹斺攢鈹€ Shotlist.md         # Motion & animation
鈹溾攢鈹€ artifacts/                  # Generated outputs
鈹溾攢鈹€ queue/                      # Job queues
鈹斺攢鈹€ README.md                   # Project landing page
```

---

## 4. Vocabulary

| Concept | Definition |
|------|------|
| **Spec-as-Code** | Using structured Markdown as the source code for video production. |
| **Dependency Graph** | `New in v0.5`. Performs topological parsing at compile time. Blocks generation if prerequisite assets are not formally approved. |
| **Review UI** | `New in v0.5`. Local Express Web interface replacing legacy CLI logic, allowing visual image selection, naming, and automated metadata writebacks. |
| **@ Reference Syntax** | Invokes approved asset variants using tags like `@role_K` or `@scene_bar:morning`. |
| **Motion-Static Separation** | Image pipeline (Script.md + Generator) and Video pipeline (Shotlist.md + Animator) are strictly independent. |
| **frame_ref** | `New in v0.5`. Replaces schema_0_3. Standard data payload to pass first/last frame reference images to models. |
| **Two-Stage Validation** | `New in v0.5`. Compile-time format checks combined with runtime hard-constraints (pixel sizes, aspect ratios, model token limits). |

---

## 5. Quick Start

```bash
# 1. Install
npm install -g videospec

# 2. Init
opsv init my-project

# 3. Configure
echo "VOLCENGINE_API_KEY=your_key" > .env/secrets.env

# 3. Analyze dependencies
opsv deps

# 4. Generate jobs
opsv generate

# 5. Image generation
opsv gen-image

# 6. Web Review
opsv review

# 7. Animate & generate video
opsv animate
opsv gen-video
```

---

## 6. Documentation (EN)

- [Workflow Guide](./02-WORKFLOW.md)
- [CLI Reference](./03-CLI-REFERENCE.md)
- [Agents & Skills](./04-AGENTS-AND-SKILLS.md)
- [Document Standards](./05-DOCUMENT-STANDARDS.md)

---

> *"Code is for humans to read, and only incidentally for machines to execute."*
> *OpsV 0.5.0 | Latest Update: 2026-04-09*

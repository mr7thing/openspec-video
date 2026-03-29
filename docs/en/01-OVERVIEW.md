# OpsV Project Panorama

> **OpenSpec-Video (OpsV) 0.4.3** 鈥?An automation framework that compiles Markdown/YAML narratives into video/image generation tasks.

---

## 1. What is OpsV?

OpsV is a **Spec-as-Code** video production pipeline. It allows creators (directors, PMs, art directors) to write stories, define assets, and design shots in Markdown. The CLI then "compiles" these text specifications into executable JSON job queues, driving AI models like **SeaDream, Seedance, Minimax, and SiliconFlow** to generate visual content concurrently.

**Core Principles**:

- **Spec-as-Code**: `.md` files are the single source of truth; images and videos are compilation artifacts.
- **Asset-First**: Characters, scenes, and props must be defined independently before being referenced in shots via `@` syntax.
- **Motion-Static Separation**: Decouples visual appearance from animation instructions to maintain consistency.
- **Dual-Channel References**: Uses `Design References` (d-ref) for generation input and `Approved References` (a-ref) for fixed output references.

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
| **Parallel Universe Sandbox** | Concurrent execution across multiple models; results isolated by engine name in `artifacts/`. |
| **Spec-as-Code** | Using structured Markdown as the source code for video production. |
| **Asset-First** | Assets exist before shots; shots reference but do not describe assets. |
| **d-ref (Design References)** | Reference images for generation input (img2img). |
| **a-ref (Approved References)** | Approved images used as references when an entity is cited (feature stability). |
| **Concept Bleeding** | When character appearance details leak into shot descriptions, causing rendering conflicts. |
| **Keyframe Collapse** | `@FRAME:<shot_id>_last` pointer to inherit the last frame of a previous shot. |

---

## 5. Quick Start

```bash
# 1. Install
npm install -g videospec

# 2. Init
opsv init my-project

# 3. Configure
echo "VOLCENGINE_API_KEY=your_key" > .env/secrets.env

# 4. Generate
opsv generate
opsv gen-image

# 5. Review
opsv review

# 6. Animate
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
> *OpsV 0.4.3 | Latest Update: 2026-03-28*

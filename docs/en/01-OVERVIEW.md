# OpsV Project Overview

> **OpenSpec-Video (OpsV) 0.6.3** �?An automation framework that compiles Markdown narrative specs into video/image generation tasks.

---

## 1. What is OpsV

OpsV is a **Spec-as-Code** video production pipeline. It allows creators (directors/PMs/art directors) to write stories in Markdown, define assets (characters/scenes/props) independently, design storyboards, then compile these text specs into executable JSON task queues via CLI commands.

With the v0.6.0 architecture revolution, OpsV achieves **physical isolation of intent and execution**:
- `opsv generate` outputs pure intent outlines (`jobs.json`)
- `opsv queue compile` compiles intents into API-specific atomic task cards
- `opsv queue run` consumes task cards sequentially in single-threaded safety

**Core Beliefs**:

- **Docs as Code**: `.md` files are the single source of truth; images and videos are merely compiled artifacts
- **Dependency Driven**: `## Approved References` establishes causal constraints between entities
- **Intent-Execution Separation**: Generate produces intent, Compile translates to API instructions, Run passively consumes
- **Physical State Machine**: Tasks flow as atomic files through `inbox �?working �?done` directories via atomic `fs.rename`
- **Static-Dynamic Separation**: Image and video pipelines are independent, non-interfering

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript | Core codebase |
| CLI Framework | Commander.js | Command-line interface |
| Communication | WebSocket (ws) | Daemon �?Browser Extension |
| Configuration | dotenv + js-yaml | Env vars + YAML config |
| Validation | Zod | Job structure validation |
| Logging | Winston | Unified logging system |
| Parsing | unified + remark | Markdown/YAML parsing |
| HTTP | Axios | API requests |

---

## 3. Standard Directory Structure

Project skeleton created by `opsv init`:

```
project/
├── .agent/                     # AI Agent configuration
�?  ├── Creative-Agent.md       # Creative Agent: brainstorm + spec anchoring
�?  ├── Guardian-Agent.md       # Guardian Agent: validation + sync
�?  ├── Runner-Agent.md         # Runner Agent: compile + render
�?  └── skills/                 # Skill manuals
├── .env                        # Service management config (ports)
├── .env/                       # Environment config (git ignored)
�?  ├── secrets.env             # API keys
�?  └── api_config.yaml         # Engine parameters
├── .opsv/                      # Runtime state (git ignored)
�?  └── dependency-graph.json   # Dependency graph snapshot
├── .opsv-queue/                # Spooler physical mailbox (git ignored)
�?  ├── inbox/{provider}/       # Pending tasks
�?  ├── working/{provider}/     # In-progress tasks
�?  ├── done/{provider}/        # Completed/failed tasks
�?  └── corrupted/{provider}/   # Corrupted JSON isolation
├── videospec/                  # Core narrative assets (source of truth)
�?  ├── project.md
�?  ├── stories/
�?  ├── elements/
�?  ├── scenes/
�?  └── shots/
├── artifacts/                  # Generated outputs
├── queue/                      # Intent queue
�?  └── jobs.json
└── AGENTS.md                   # OpenCode/Trae unified protocol
```

---

## 4. Core Concepts

| Concept | Description |
|---------|-------------|
| **Spec-as-Code** | Using structured Markdown as the source code for video production. |
| **Spooler Queue** | `v0.6` Physical file-based state machine with atomic `fs.rename` dequeue, replacing the old in-memory Dispatcher. |
| **Dependency Graph** | `v0.5` Topological parsing at compile time; blocks tasks whose dependencies aren't Approved. |
| **Review UI** | `v0.5` Local Express web page for visual image selection, naming, and metadata writeback. |
| **@ Reference Syntax** | Tags like `@role_K`, `@scene_bar` to invoke approved asset variants. |
| **Intent-Execution Separation** | `v0.6` Generate produces pure intent JSON, Compile translates API instructions, Run passively consumes. |
| **Service Topology** | `v0.6` Global Daemon / Local Review / Task Worker three-tier service classification. |

---

## 5. Quick Start

```bash
# 1. Global install
npm install -g videospec

# 2. Create new project
opsv init my-mv-project

# 3. Configure API keys
echo "VOLCENGINE_API_KEY=your_key_here" > .env/secrets.env

# 4. Write assets and storyboards

# 5. Dependency check
opsv deps

# 6. Compile intent outline
opsv generate

# 7. Compile to API-specific atomic tasks
opsv queue compile queue/jobs.json --provider seadream

# 8. Execute tasks (single-threaded sequential)
opsv queue run seadream

# 9. Visual review
opsv review
```

---

## 6. Related Documentation

| Document | Description |
|----------|-------------|
| [Workflow Guide](./02-WORKFLOW.md) | Three-role collaboration flow |
| [CLI Reference](./03-CLI-REFERENCE.md) | Complete command reference |
| [Agents & Skills](./04-AGENTS-AND-SKILLS.md) | 3 roles + 9 skills |
| [Document Standards](./05-DOCUMENT-STANDARDS.md) | Four-layer architecture, YAML templates, @ syntax |
| [Configuration](./06-CONFIGURATION.md) | .env directory and engine parameters |
| [API Reference](./07-API-REFERENCE.md) | Spooler Queue Provider protocol |
| [Server Architecture](../Server-Architecture.md) | Service topology and lifecycle management |

---

> *"Code is written for humans to read, and only incidentally for machines to execute."*
> *OpsV 0.6.3 | Last updated: 2026-04-22*

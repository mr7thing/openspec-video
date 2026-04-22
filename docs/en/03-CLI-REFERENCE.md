# CLI Reference (v0.6.3)

## Command Overview

| Command | Description | Phase |
|---------|-------------|-------|
| `opsv init` | Initialize project structure | Project Setup |
| `opsv generate` | Compile docs to intent outline (jobs.json) | Intent Compilation |
| `opsv validate` | Validate Markdown YAML frontmatter | Quality Gate |
| `opsv queue compile` | Compile intent to API atomic tasks | Task Delivery |
| `opsv queue run` | Start QueueWatcher to consume tasks | Task Execution |
| `opsv review` | Start Review page server | Review |
| `opsv deps` | Analyze asset dependencies | Analysis |
| `opsv animate` | Compile Shotlist to video intent | Video Pipeline |
| `opsv addons` | Manage extension plugins and skill packs | Extensions |
| `opsv daemon` | Global background service management | Infrastructure |

> **v0.6.0 Breaking Change**: `opsv gen-image` and `opsv gen-video` have been removed. All execution goes through `opsv queue compile` + `opsv queue run`.

---

## opsv init

Initialize OpsV project structure.

```bash
opsv init                          # Interactive mode
opsv init my-project --claude      # Non-interactive with flags
```

### Options

| Option | Description |
|--------|-------------|
| `-g, --gemini` | Gemini support |
| `-c, --claude` | Claude Code support |
| `-x, --codex` | Codex/Cursor support |
| `-o, --opencode` | OpenCode support |
| `-t, --trae` | Trae support |

Creates: `videospec/`, `.agent/`, `.env/`, `.opsv/`, `.opsv-queue/`, `artifacts/`, `queue/`, `.gitignore`

---

## opsv generate

Compile Markdown docs to pure intent outline.

```bash
opsv generate                      # All spec directories
opsv generate videospec/elements   # Specific directory
opsv generate -p                   # Preview mode (first shot only)
opsv generate --shots 1,5,12       # Specific shots
```

**Output**: `queue/jobs.json` �?pure business intent, no API-specific parameters.

---

## opsv queue compile

Compile intent outline to API-specific atomic task cards.

```bash
opsv queue compile queue/jobs.json --provider seadream      # Standard API
opsv queue compile queue/jobs.json --provider runninghub    # ComfyUI workflow
```

| Provider | Compiler | Description |
|----------|----------|-------------|
| `comfyui_local` / `runninghub` | `ComfyUITaskCompiler` | Loads Addon workflow templates |
| Others (seadream, minimax...) | `StandardAPICompiler` | Standard HTTP API payload |

**Output**: Individual `UUID.json` files in `.opsv-queue/inbox/{provider}/`

---

## opsv queue run

Start QueueWatcher for single-threaded task consumption.

```bash
opsv queue run seadream
opsv queue run minimax
opsv queue run siliconflow
opsv queue run comfyui_local
opsv queue run runninghub
```

- Single-threaded sequential processing with atomic `fs.rename` extraction
- Physical state flow: `inbox �?working �?done`
- Ctrl+C graceful shutdown: tasks in `working/` automatically rollback to `inbox/`
- Provider names are case-insensitive

---

## opsv review

Start local Review page server.

```bash
opsv review                        # Default port from OPSV_REVIEW_PORT
opsv review -p 8080                # Custom port
opsv review -b 3                   # Specific batch
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Server port | `OPSV_REVIEW_PORT` or `3456` |
| `-b, --batch <num>` | Batch number | Latest |

---

## opsv deps

Analyze asset dependency graph.

```bash
opsv deps
```

Output: Dependency analysis with recommended generation order. Saves to `.opsv/dependency-graph.json`.

---

## opsv animate

Compile Shotlist.md to video generation intent.

```bash
opsv animate
```

---

## opsv daemon

Global background service management (Chrome Extension support).

```bash
opsv daemon start    # Port from OPSV_DAEMON_PORT or default 3061
opsv daemon stop
opsv daemon status
```

---

## opsv addons

Manage extension plugins and skill packs.

```bash
opsv addons install ./addons/comic-drama-v0.6.zip
```

---

## Typical Workflow

```bash
opsv init
# Write docs...
opsv deps
opsv generate
opsv queue compile queue/jobs.json --provider seadream
opsv queue run seadream
opsv review
# Iterate...
opsv animate
opsv queue compile queue/video_jobs.json --provider seedance
opsv queue run seedance
```

---

> *OpsV 0.6.3 | Last updated: 2026-04-22*

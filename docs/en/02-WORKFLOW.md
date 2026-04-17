# OpsV Workflow Guide

> From inspiration to final cut — the three-role collaboration loop, understanding the complete interaction between Agents and CLI commands.

---

## Pipeline Overview (Three-Role Collaboration)

```mermaid
flowchart TD
    START["💡 Creative / Addon Input"] --> INIT["opsv init"]
    
    subgraph Creative["🎨 Creative-Agent Domain"]
        BRAIN["🧠 opsv-brainstorming"]
        ARCH["🏛️ opsv-architect"]
        ASSET["🎨 opsv-asset-designer"]
        SCRIPT["📐 opsv-script-designer"]
        
        BRAIN --> ARCH
        ARCH -->|"project.md + story.md"| ASSET
        ASSET -->|"elements/ + scenes/"| SCRIPT
    end

    INIT --> BRAIN
    
    subgraph Guardian["🛡️ Guardian-Agent Domain"]
        PREGEN["🔍 opsv-pregen-review"]
        OPS["⚙️ opsv-ops-mastery"]
        PREGEN --> OPS
    end

    SCRIPT -->|"Script.md"| PREGEN
    
    subgraph Runner["🚀 Runner-Agent Domain"]
        GEN["opsv generate (intent)"]
        COMPILE["opsv queue compile (atomize)"]
        RUN["opsv queue run (consume)"]
        REVIEW["opsv review (visual review)"]
        ANIM["animation-director + opsv-animator"]
    end

    OPS -->|"✅ PASS"| GEN
    GEN -->|"jobs.json"| COMPILE
    COMPILE -->|".opsv-queue/pending/"| RUN
    RUN --> REVIEW
    REVIEW -->|"Approve ✅"| ANIM
    ANIM -->|"Shotlist.md"| GEN
    REVIEW -->|"Draft 📝"| BRAIN

    style Creative fill:#fef3e2,stroke:#e67e22,stroke-width:2px
    style Guardian fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style Runner fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
```

---

## Phase 1: Project Initialization

```bash
opsv init [projectName]
```

Creates:
- `.agent/` — 3 Agent role definitions + 9 Skills
- `.env/` — API configuration templates
- `videospec/{stories,elements,scenes,shots}/` — Narrative asset skeleton
- `artifacts/`, `queue/` — Output directories
- `.opsv/`, `.opsv-queue/` — Runtime directories (v0.6)
- `.gitignore` — Built-in generation (v0.6)

---

## Phase 2: Brainstorming & Spec Anchoring

**Agent**: Creative-Agent → `opsv-brainstorming` + `opsv-architect`

1. **Brainstorm First**: Never create documents before confirming creative direction via Trinity Choice proposals
2. **Spec Anchoring**: Generate `project.md` and `story.md` after director confirmation
3. **Handoff**: Pass to Guardian-Agent for reflection sync

**Sync Loop**: Body text (Soul) ↔ YAML (CMD) must maintain 100% semantic alignment after every review round.

---

## Phase 3: Asset Specification

**Agent**: Creative-Agent → `opsv-asset-designer`

1. Read `project.md` for global context
2. Dual-channel reference system: `## Design References` (input) + `## Approved References` (output)
3. Quality gate by Guardian-Agent: `opsv validate` + `opsv-pregen-review`

---

## Phase 4: Spooler Queue Pipeline (v0.6.0 Core)

The old `gen-image` / `gen-video` single-step model is replaced by a three-step Spooler pipeline.

### 4.1 Storyboard Design
**Agent**: Creative-Agent → `opsv-script-designer`
- Output: `videospec/shots/Script.md` (pure Markdown, no YAML arrays)
- Each shot: 3-5 seconds, max 15 seconds

### 4.2 Intent Compilation
```bash
opsv generate    # Produces queue/jobs.json — pure business intent
```

### 4.3 Atomic Delivery
```bash
opsv queue compile queue/jobs.json --provider seadream     # Standard API
opsv queue compile queue/jobs.json --provider runninghub   # ComfyUI workflow
```
- Each job becomes an independent `UUID.json` in `.opsv-queue/pending/{provider}/`

### 4.4 Single-Threaded Consumption
```bash
opsv queue run seadream
```
- Sequential processing, no concurrency conflicts
- Success → `completed/`, Failure → `failed/`
- Supports Ctrl+C breakpoint recovery

### 4.5 Visual Review
```bash
opsv review    # Port configured via OPSV_REVIEW_PORT
```
- Grid selection, variant naming, Approve/Draft dual-state

---

## Phase 5: Animation

**Agent**: Runner-Agent → `opsv-animator` + `animation-director`

```bash
opsv animate
opsv queue compile queue/video_jobs.json --provider seedance
opsv queue run seedance
```

**Static-Dynamic Separation**: Describe only camera motion, character actions, dynamic changes — never appearance details.

---

## Iterative Loop

```
Creative-Agent → Guardian-Agent → Runner-Agent → Review → (rejected) → Creative-Agent
```

Three roles ensure creativity, standards, and execution remain properly separated in each iteration.

---

> *"Let creativity flow like water, let standards stand firm like dams."*
> *OpsV 0.6.0 | Last updated: 2026-04-17*

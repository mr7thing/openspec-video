# OpsV Agents & Skills

> Agents define "what to do", Skills define "how to do it". Understanding this separation is key.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Director                        │
│              ↓ Natural language                    │
├──────────────────────────────────────────────────┤
│ Agent Layer — "Three-Role Collaboration"           │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐│
│ │ Creative    │ │   Guardian   │ │   Runner    ││
│ └──────┬──────┘ └──────┬───────┘ └──────┬──────┘│
│        ↓                ↓                ↓       │
├──────────────────────────────────────────────────┤
│ Skill Layer — "Standards & Creativity Decoupled"  │
│ ┌───────────────┐ ┌────────────────┐ ┌──────────┐│
│ │ opsv-*        │ │ comic-drama-*  │ │ others   ││
│ └───────────────┘ └────────────────┘ └──────────┘│
│                  ↓                               │
├──────────────────────────────────────────────────┤
│ CLI Layer — "Three-Step Spooler Queue"             │
│ generate → queue compile → queue run              │
└──────────────────────────────────────────────────┘
```

- **Agent** (`.agent/*.md`): Role identity, responsibilities, which Skills to invoke
- **Skill** (`.agent/skills/*/SKILL.md`): Execution specs, format templates, quality gates
- **CLI** (`opsv` commands): Three-step pipeline for compilation and execution

---

## Agent Role Matrix

| Agent | File | Responsibility | Bound Skills |
|-------|------|---------------|-------------|
| **Creative-Agent** | `Creative-Agent.md` | Brainstorming, three-way proposals, creative anchoring | `opsv-brainstorming`, `opsv-architect`, `opsv-asset-designer`, `opsv-script-designer` |
| **Guardian-Agent** | `Guardian-Agent.md` | YAML↔Body sync, pre-gen review, standards enforcement | `opsv-pregen-review`, `opsv-ops-mastery` |
| **Runner-Agent** | `Runner-Agent.md` | Task compilation, Spooler dispatch, pipeline monitoring | `opsv-animator`, `animation-director`, `opsv-enlightenment` |

---

## Skill Details

### 1. `opsv-brainstorming` — Creative Instinct
- **Trigger**: Project inception, extracting visual direction from vague inspiration
- Trinity Choice: Standard / Experimental / Zen proposals
- Visual distillation: Materials, lighting, camera language → high-density English prompts

### 2. `opsv-architect` — Project Strategist
- **Trigger**: Building a new video project from scratch
- Phase 1: Concept divergence → 3 differentiated story proposals
- Phase 2: World anchoring → `project.md` + `story.md`

### 3. `opsv-asset-designer` — Asset Specification
- **Trigger**: Creating character/scene/prop `.md` definition files
- Context-first, ultra-high detail, folded block syntax, YAML-First

### 4. `opsv-script-designer` — Storyboard Script
- **Trigger**: Translating `story.md` into structured `Script.md`
- 3-5 seconds per shot (max 15s), pure body parsing from `## Shot NN`

### 5. `opsv-animator` — Animation Execution
- **Trigger**: Extracting motion instructions from reviewed `Script.md` → `Shotlist.md`
- Static-dynamic separation: Only describe motion, never appearance

### 6. `animation-director` — Animation Director Artist
- Camera-first, physics-accurate actions, all English prompts

### 7. `opsv-pregen-review` — Pre-Generation Review
- Interactive fill, soul summary, industrial QC
- Approve/Draft dual-state flow

### 8. `opsv-ops-mastery` — Operations Instinct
- Auto-sentinel, task orchestration via `generate → queue compile → queue run`

### 9. `opsv-enlightenment` — Learning Instinct
- Dynamic skill acquisition from external sources when existing skills are insufficient

---

## Extension System: Addons

- **Standard Skills (opsv-*)**: Define the "box" shape — industrial standards
- **Creative Skills (comic-drama-*)**: Define the "soul" depth — pluggable evolution

```bash
opsv addons install ./addons/comic-drama-v0.6.zip
```

---

> *"Agent is the soul, standard Skill is the skeleton, creative Skill is the flesh, Spooler Queue is the nervous system."*
> *OpsV 0.6.1 | Last updated: 2026-04-20*

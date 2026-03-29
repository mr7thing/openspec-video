# OpsV Agents & Skills

> Agents define **"What to do"**, and Skills define **"How to do it"**. Understanding this separation is key to mastering multi-role collaboration in OpsV.

---

## Architectural Philosophy

```
┌──────────────────────────────────────────────────┐
│                   Director (User)                 │
│              ↓ Natural Language Command           │
├──────────────────────────────────────────────────┤
│ Agent Layer — "Personality & Responsibility"     │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐       │
│ │Architect │ │Screenwr. │ │AssetDesigner │ ...   │
│ └────┬─────┘ └────┬─────┘ └──────┬───────┘       │
│      ↓              ↓              ↓               │
├──────────────────────────────────────────────────┤
│ Skill Layer — "Manuals & Specifications"          │
│ ┌───────────────┐ ┌────────────────┐ ┌──────────┐│
│ │opsv-architect │ │opsv-screenwr.  │ │opsv-a-d. ││
│ └───────────────┘ └────────────────┘ └──────────┘│
├──────────────────────────────────────────────────┤
│ CLI Layer — "Compilation & Execution"            │
│ opsv generate → opsv gen-image → opsv review     │
└──────────────────────────────────────────────────┘
```

- **Agent** (`.agent/*.md`): Defines the persona, core duties, and which Skills to invoke.
- **Skill** (`.agent/skills/*/SKILL.md`): Defines execution standards, formatting templates, and quality gates.
- **CLI** (`opsv` command): Compiles Markdown assets into executable jobs.

---

## Agent Role Matrix

| Agent | File | Responsibility | Primary Skill |
|-------|------|------|-----------|
| **CLI-Agent** | `Director.md` | Auto-Executor: Drives the non-interactive CLI pipeline via cross-agent orchestration. | `opsv-cli-agent` |
| **Architect** | `Architect.md` | Strategist: Anchors inspiration into project worldview; generates `project.md` + `story.md`. | `opsv-architect` |
| **Screenwriter** | `Screenwriter.md` | Writer: Drafts story outlines, identifies entities, and embeds `@` anchors. | `opsv-screenwriter` |
| **AssetDesigner** | `AssetDesigner.md` | Designer: Creates entity definitions in `elements/` and `scenes/`. | `opsv-asset-designer` |
| **ScriptDesigner** | `ScriptDesigner.md` | Storyboarder: Translates stories into structured YAML-driven `Script.md`. | `opsv-script-designer` |
| **Animator** | `Animator.md` | Animator: Extracts motion instructions and generates `Shotlist.md`. | `opsv-animator` |
| **Supervisor** | `Supervisor.md` | QA Officer: Performs automated inspections and provides PASS/FAIL reports. | `opsv-supervisor` |

---

## Detailed Skill Overviews

### 0. `opsv-cli-agent` — Automation Execution Manual (v0.4.4+)
- **Phase 1: Agent Zero-Friction Init**: Automation via `-g/-o/-t` non-interactive flags.
- **Phase 2: CLI Pipeline Orchestration**: Chains Screenwriter, ScriptDesigner, and Animator.
- **Phase 3: Director Bridge Checkpoint**: Managed human-in-the-loop review for rendered assets.
- **Phase 4: Synthesis**: Final animation and video generation via CLI execution.

### 1. `opsv-architect` — Project Strategist Manual
- **Workflow**: Two phases (Ideation & Anchoring).
- **Keywords**: 3 differentiated proposals; `vision` and `global_style_postfix`.

### 2. `opsv-screenwriter` — Screenwriter Manual
- **Key Task**: Entity abstraction and asset declaration.
- **Strict Rule**: No camera directions; no "Feature Leakage" (e.g., describe appearance in asset files, not the plot).

### 3. `opsv-asset-designer` — Asset Design Manual
- **Standards**: High density, context-awareness (`project.md`), and YAML-First priority.
- **Reference Logic**: d-ref for generation input, a-ref for fixed output.

### 4. `opsv-script-designer` — Storyboard Manual
- **Constraint**: Strict timing (3-5s, max 15s).
- **Format**: YAML-driven array for machine parsing; Markdown body for human review.

### 5. `opsv-animator` — Animation Pipeline Manual
- **Principle**: Static-Motion Separation. Describe camera and subject movement only.
- **Feature**: Long-take inheritance via `@FRAME:shot_N_last`.

### 6. `opsv-supervisor` — Quality Control Manual
- **Actions**: `/opsv-qa act1` to `act4` and `final`.
- **Checks**: Dead links, concept bleeding, and payload alignment.

---

> *"Agents are the soul, Skills are the technique, and CLI is the hands."*
> *OpsV 0.4.3 | Latest Update: 2026-03-28*

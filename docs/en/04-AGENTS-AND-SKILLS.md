# OpsV Agents & Skills

> Agents define **"What to do"**, and Skills define **"How to do it"**. Understanding this separation is key to mastering multi-role collaboration in OpsV.

---

## Architectural Philosophy

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                  Director (User)                 鈹?鈹?             鈫?Natural Language Command           鈹?鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?Agent Layer 鈥?"Personality & Responsibility"     鈹?鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?      鈹?鈹?鈹侫rchitect 鈹?鈹係creenwr. 鈹?鈹侫ssetDesigner 鈹?...   鈹?鈹?鈹斺攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹?      鈹?鈹?     鈫?             鈫?             鈫?              鈹?鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?Skill Layer 鈥?"Manuals & Specifications"          鈹?鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹愨攤
├──────────────────────────────────────────────────┤
│ Skill Layer — "Normative & Creative Decoupling"     │
│ ┌───────────────┐ ┌────────────────┐ ┌────────────┐│
│ │ opsv-Normative│ │ comic-Creative │ │  Others... ││
│ └───────┬───────┘ └───────┬────────┘ └─────┬──────┘│
│         │                 │                │      │
│         └────────┬────────┴────────────────┘      │
│                  ↓                                │
├──────────────────────────────────────────────────┤
│ CLI Layer — "Compilation & Addons"                 │
│ opsv init → opsv addons install → opsv generate    │
└──────────────────────────────────────────────────┘```

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
| **ScriptDesigner** | `ScriptDesigner.md` | Storyboard: Translates stories into Markdown-based `Script.md`. | `opsv-script-designer` (Norm), `comic-drama-storyboarder` (Creative) |
| **Animator** | `Animator.md` | Motion: Extracts movement instructions; generates `Shotlist.md`. | `opsv-animator` (Norm), `comic-drama-animator` (Creative) |
| **PostEditor** | `PostEditor.md` | Editor: Final assembly, naming conventions, and audio sync. | `comic-drama-post-editor` |
| **Supervisor** | `Supervisor.md` | QA Officer: Performs automated inspections and provides PASS/FAIL reports. | `opsv-supervisor` |

---

## Detailed Skill Overviews

### 0. `opsv-cli-agent` 鈥?Automation Execution Manual (v0.4.4+)
- **Phase 1: Agent Zero-Friction Init**: Automation via `-g/-o/-t` non-interactive flags.
- **Phase 2: CLI Pipeline Orchestration**: Chains Screenwriter, ScriptDesigner, and Animator.
- **Phase 3: Director Bridge Checkpoint**: Managed human-in-the-loop review for rendered assets.
- **Phase 4: Synthesis**: Final animation and video generation via CLI execution.

### 1. `opsv-architect` 鈥?Project Strategist Manual
- **Workflow**: Two phases (Ideation & Anchoring).
- **Keywords**: 3 differentiated proposals; `vision` and `global_style_postfix`.

### 2. `opsv-screenwriter` 鈥?Screenwriter Manual
- **Key Task**: Entity abstraction and asset declaration.
- **Strict Rule**: No camera directions; no "Feature Leakage" (e.g., describe appearance in asset files, not the plot).

### 3. `opsv-asset-designer` 鈥?Asset Design Manual
- **Standards**: High density, context-awareness (`project.md`), and YAML-First priority.
- **Reference Logic**: d-ref for generation input, a-ref for fixed output.

### 4. `opsv-script-designer` 鈥?Storyboard Manual
- **Constraint**: Strict timing (3-5s, max 15s).
- **Format**: YAML-driven array for machine parsing; Markdown body for human review.

### 5. `opsv-animator` 鈥?Animation Pipeline Manual
- **Principle**: Static-Motion Separation. Describe camera and subject movement only.
- **Feature**: Long-take inheritance via `@FRAME:shot_N_last`.

### 6. `opsv-supervisor` 鈥?Quality Control Manual
- **Actions**: `/opsv-qa act1` to `act4` and `final`.
- **Checks**: Dead links, concept bleeding, and payload alignment.

---

## Addons Ecosystem (v0.5 New)

As of v0.5, the "Creative Brain" (Creative Skills) is decoupled from the "Pipeline Template" (Normative Skills).

### 1. Decoupling Philosophy
- **Normative Skills (opsv-*)**: Define the shape of the "mold". How `Script.md` is formatted, how `jobs.json` is structured. These are fixed industrial standards.
- **Creative Skills (comic-drama-* / mv-*)**: Define the depth of the "soul". How a mini-drama should be storyboarded, or which prompt styles work best. these are pluggable and user-updatable.

### 2. Addon Installation
Users can dynamically expand Agent capabilities via the `opsv addons` command:

```bash
# Install the professional Comic-Drama pack
opsv addons install ./addons/comic-drama-v0.5.zip
```

Once installed, Agent profiles will automatically map to these expert creative skills.

---

> *"Agents are the soul, Normative Skills are the skeleton, Creative Skills are the flesh, and CLI is the hands."*
> *OpsV 0.5.0 | Latest Update: 2026-04-10*

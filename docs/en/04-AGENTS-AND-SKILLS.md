# OpsV Agents & Skills

> Agents define **"What to do"**, and Skills define **"How to do it"**. Understanding this separation is key to mastering multi-role collaboration in OpsV.

---

## Architectural Philosophy

```
┌──────────────────────────────────────────────────┐
│                  Director (User)                  │
│             ↓ Natural Language Command            │
├──────────────────────────────────────────────────┤
│ Agent Layer — "Three-Role Collaboration" (v0.5.15+) │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐│
│ │  Creative   │ │   Guardian   │ │   Runner    ││
│ │  (Creator)  │ │  (Guardian)  │ │  (Executor) ││
│ └──────┬──────┘ └──────┬───────┘ └──────┬──────┘│
│        ↓                ↓                ↓       │
├──────────────────────────────────────────────────┤
│ Skill Layer — "Normative & Creative Decoupling"   │
│ ┌───────────────┐ ┌────────────────┐ ┌──────────┐│
│ │ opsv-Normative│ │ comic-Creative │ │ Others...││
│ └───────┬───────┘ └───────┬────────┘ └────┬─────┘│
│         └────────┬────────┴───────────────┘      │
│                  ↓                               │
├──────────────────────────────────────────────────┤
│ CLI Layer — "Compilation & Addons"                │
│ opsv init → opsv addons install → opsv generate   │
└──────────────────────────────────────────────────┘
```

- **Agent** (`.agent/*.md`): Defines the persona, core duties, and which Skills to invoke.
- **Skill** (`.agent/skills/*/SKILL.md`): Defines execution standards, formatting templates, and quality gates.
- **CLI** (`opsv` command): Compiles Markdown assets into executable jobs.

---

## Agent Role Matrix (v0.5.15+)

Since v0.5.15, OpsV has consolidated the legacy 7 fine-grained roles into **3 functional Agents**, each orchestrating multiple Skills.

| Agent | File | Responsibility | Bound Skills |
|-------|------|----------------|-------------|
| **Creative-Agent** | `Creative-Agent.md` | Creator: Socratic brainstorming, trinity proposals, spec settlement into `project.md` + `story.md` | `opsv-brainstorming`, `opsv-architect`, `opsv-asset-designer`, `opsv-script-designer` |
| **Guardian-Agent** | `Guardian-Agent.md` | Guardian: Reflective sync YAML ↔ Body, pre-generation review, spec dam, semantic QA | `opsv-pregen-review`, `opsv-ops-mastery` |
| **Runner-Agent** | `Runner-Agent.md` | Executor: Job compilation, batch dispatch, pipeline monitoring, artifact archival | `opsv-animator`, `animation-director`, `opsv-enlightenment` |

### Collaboration Flow

```
Creative-Agent → Spec Settlement → Guardian-Agent → Validate + Approve → Runner-Agent → Render
      ↑                                                                                   |
      └──────────────────── Rollback on Review Rejection ─────────────────────────────────┘
```

---

## Detailed Skill Overviews

### 1. `opsv-brainstorming` — Creative Instinct

**Trigger**: Early project phase, distilling visual direction from vague inspiration

**Core Flow**:
1. **Red Light**: Never settle specs on vague input. Ask 3 probing questions about core conflict, visual style, and emotional register.
2. **Trinity Choice**: Offer three distinct proposals (Standard / Experimental / Zen).
3. **Visual Alchemy**: Deconstruct concepts into fabric textures, lighting (Rembrandt, volumetric), lens language (macro, telephoto compression). Forge high-density English prompts.
4. **Consensus Settlement**: Only after explicit director confirmation may spec files be created.

---

### 2. `opsv-architect` — Project Strategist Manual

**Trigger**: Building a new video project from scratch

**Two-Phase Workflow**:

| Phase | Input | Output | Creates Files? |
|-------|-------|--------|---------------|
| Phase 1: Ideation | A lyric/vague concept | 3 differentiated story proposals | ❌ Text only |
| Phase 2: Anchoring | Director selects proposal | `project.md` + `story.md` | ✅ |

---

### 3. `opsv-asset-designer` — Asset Design Manual

**Trigger**: Creating character, scene, or prop `.md` definition files

**Key Rules**:
1. **Context First**: Read `project.md` for global style alignment
2. **Ultra-High Density**: Dense descriptions of materials, lighting, wear, mood
3. **Block Style**: `visual_brief`, `visual_detailed`, `prompt_en` must use `>` syntax
4. **Bilingual**: Chinese body, English `prompt_en` only
5. **YAML-First**: All metadata in YAML Frontmatter

---

### 4. `opsv-script-designer` — Storyboard Manual

**Trigger**: Translating `story.md` into structured `Script.md`

**Core Rules**:
1. **Timing Constraint**: Each shot 3-5s, max 15s
2. **Visual Language**: Describe "what the camera sees", not literary narrative
3. **Pure Body Parsing**: Parse from `## Shot NN` headers, no YAML arrays
4. **Bilingual Separation**: `prompt_en` in English, rest in Chinese
5. **Spec Purity**: No hardcoded `target_model` or execution configs (v0.5.14+)

---

### 5. `opsv-animator` — Animation Pipeline Manual

**Trigger**: Extracting motion instructions from reviewed `Script.md` into `Shotlist.md`

**Static-Motion Separation**:
- ❌ Don't describe: What characters wear, how the environment looks
- ✅ Only describe: How the camera moves, how subjects act, dynamic scene changes
- `motion_prompt_en` must be **English only**

**Long-Take Inheritance**: Via `@FRAME:shot_N_last` for seamless shot transitions.

---

### 6. `animation-director` — Motion Prompt Artist

**Trigger**: Writing high-quality video Motion Prompts

**Four Principles**:
1. **Separation**: Never describe appearance details (reference images handle that)
2. **Camera First**: Force camera movement specs (`Dolly in`, `Pan right`, `Crane down`)
3. **Physics & Action**: Precise, gravity-respecting action descriptions
4. **All English**: Video AI models only consume English prompts

---

### 7. `opsv-pregen-review` — Pre-Generation Review Protocol

**Trigger**: Interactive review of target Spec before visual generation

**Trinity Review**:
1. **Interactive Fill**: Check `visual_detailed` granularity, suggest aesthetic refinements
2. **Semantic Abstract**: Summarize the visual core in cinematic language
3. **Industrial QA**: Silent `opsv validate` execution on target file

**Approve / Draft Dual-State**:
- **Approve**: Write-back `## Approved References` → `status: approved` → auto-skip on `--skip-approved`
- **Draft**: Record notes into `reviews` → `status: draft` → `draft_ref` becomes reference for next iteration

---

### 8. `opsv-ops-mastery` — Operations Mastery

**Trigger**: Pipeline operations, command invocation, and spec guardianship

**Core Mechanisms**:
1. **Auto Sentinel**: Propose `opsv validate` after file changes. GREEN = proceed / RED = block.
2. **Task Orchestration**: `opsv generate --skip-approved` → inspect `skipped.json` → trigger rendering
3. **Standards Enforcement**: Directory sovereignty (elements/scenes/shots), YAML field requirements
4. **Emergency Handling**: On API errors, check `.env` config, preserve raw error JSON

---

### 9. `opsv-enlightenment` — Dynamic Learning

**Trigger**: When existing skills cannot cover a specific API capability

**Core Flow**:
1. **Quest Trigger**: Never refuse out-of-scope requests; proactively search official skill libraries
2. **Dynamic Internalization**: Read external SKILL.md → extract CLI commands + parameter constraints + output specs
3. **Industrial Alignment**: Check local environment before execution, guide installation if tools are missing
4. **Evolution Guard**: Never hallucinate parameter names; official documentation is the only source of truth

---

## Addons Ecosystem (v0.5 New)

As of v0.5, the "Creative Brain" (Creative Skills) is decoupled from the "Pipeline Template" (Normative Skills).

### 1. Decoupling Philosophy
- **Normative Skills (opsv-*)**: Define the shape of the "mold". How `Script.md` is formatted, how `jobs.json` is structured. These are fixed industrial standards.
- **Creative Skills (comic-drama-* / mv-*)**: Define the depth of the "soul". How a mini-drama should be storyboarded, or which prompt styles work best. These are pluggable and user-updatable.

### 2. Addon Installation
Users can dynamically expand Agent capabilities via the `opsv addons` command:

```bash
# Install the professional Comic-Drama pack
opsv addons install ./addons/comic-drama-v0.5.zip
```

Once installed, Agent profiles will automatically map to these expert creative skills.

---

> *"Agents are the soul, Normative Skills are the skeleton, Creative Skills are the flesh, and CLI is the hands."*
> *OpsV 0.5.19 | Latest Update: 2026-04-17*

---
name: storyboard-ai-video
description: Convert screenplays, stories, or narrative concepts into structured shot lists (storyboards) optimized for AI video generation. Core skill for comic/drama production. Use when the user needs to (1) create a storyboard/shot list from a script or story, (2) break down a narrative into AI-video-ready prompts with dialogue, (3) design camera shots with standard cinematography terminology (framing/景别, angles/角度, movement/运镜, composition/构图), (4) maintain character/scene consistency across multiple AI-generated video clips via Asset-First + Temporal Bridge, (5) generate structured JSON or Markdown shot lists with dialogue for models like Kling, Runway Gen-4, Veo 3, Sora, or Hailuo, or (6) manage reusable assets (characters, props, locations) for AI video production.
---

# Storyboard to AI Video: Shot List Generation

Transform any narrative text into a professional shot list **with dialogue** ready for AI video generation. This skill provides a structured workflow, cinematography terminology references, and output templates compatible with mainstream AI video models.

**Pipeline integration**: This skill serves as the reference standard for the `comic-storyboard` skill in OpsV's 5-stage comic production pipeline. The terminology, schema, and prompt engineering rules defined here are the canonical source of truth.

---

## Core Workflow

Converting a story to an AI-video shot list involves five sequential stages. **Dialogue extraction is mandatory in Stage 1** — never skip it.

1. **Script Input & Parsing** — Parse screenplay/story into scenes, action lines, **dialogue (with speaker attribution)**, and transitions
2. **Scene Breakdown** — Decompose each scene into shots based on action density and narrative beats
3. **Asset Registry** — Define characters, props, and locations with visual descriptions and consistency rules
4. **Shot Design** — Specify shot type (景别), camera angle, movement, lighting, **dialogue per shot**, and duration
5. **AI Prompt Output** — Generate model-ready prompts (T2V or I2V format) with continuity safeguards

Embed two cross-cutting mechanisms throughout all stages:
- **Asset-First**: Define all character/prop/location visuals before generating any shot
- **Temporal Bridge**: Each shot's end frame feeds into the next shot's start condition — use `connect_to_next: true` and optionally the **next-scene composition workflow** (`opsv-2511next分镜`) for automatic transition frame generation

---

## Stage 1: Script Parsing — WITH DIALOGUE

Parse the input text to extract structured elements. **Dialogue is a first-class extraction target, not an afterthought.**

Handle these input types:

| Input Type | Parsing Approach |
|-----------|-----------------|
| Standard screenplay (Fountain/Final Draft) | Extract scene headers (INT./EXT.), action blocks, **dialogue with character names**, transition lines |
| Plain story/prose | Identify scene boundaries by location/time changes; **extract quoted dialogue + infer speaker from context**; convert prose to action/description lines |
| Simple concept/logline | Expand into a minimal 3-5 scene outline first, then treat as prose |

### Dialogue Extraction Rules

1. **Every line of dialogue must be captured verbatim** from the source
2. **Every dialogue line must have a speaker attribution** (character name or @id)
3. **Silent beats are explicitly marked** (`dialogue: null`), not omitted
4. **Voice-over (VO) and off-screen (OS) dialogue must be tagged**:
   - `dialogue_type: "onscreen"` — character visible in shot
   - `dialogue_type: "VO"` — voice-over narration
   - `dialogue_type: "OS"` — character speaking off-screen

Output a **Scene List with Dialogue** where each entry has: `scene_id`, `location`, `time_of_day`, `characters_present`, `action_summary`, `mood`, `dialogue_lines` (array of `{speaker, text, type}`).

---

## Stage 2: Scene Breakdown

Decompose each scene into individual shots. Apply these rules:

- **Action density rule**: Each distinct physical action or emotional beat becomes a separate shot
- **Dialogue-driven rule**: A single dialogue line may span one shot; extended dialogue exchanges should be broken into shot/reverse-shot pairs (MCU/CU alternating speakers)
- **Coverage pattern**: Start with an establishing shot (EWS/WS), then move to medium shots (MS/MCU) for action/dialogue, then close-ups (CU/ECU) for emotional peaks
- **Shot count estimate**: A scene with n characters, m action beats, and d dialogue lines typically needs **2 + m + ceil(d/3)** shots
- **Duration budget**: Each shot should be **3-8 seconds** for T2V models; dialogue shots typically 4-6s per line

Example breakdown:
> "She walks into the room, pauses at the window. 'I've been waiting for this.' He turns to face her. 'So have I.'" → 4 shots: WS (enters), MCU (at window + line), MS (he turns), CU (he responds).

**Dialogue-to-Shot mapping rule**: Each dialogue line must be assigned to exactly one shot. If two characters exchange 4 lines, that's at minimum 2 shots (OTS shot/reverse-shot pair), ideally 4 (MCU per speaker).

---

## Stage 3: Asset Registry

Before designing any shot, create the asset registry. See [references/asset-management.md](references/asset-management.md) for full specifications.

### Characters

For each character, generate:
- `character_id`: unique identifier (e.g., "char_anna")
- `name`: display name
- `physical_description`: 1-2 sentences of distinctive visual traits
- `wardrobe`: clothing description
- `distinctive_features`: unique identifiers for consistency (scars, accessories, hairstyle)
- **`voice_profile`**: voice characteristics for TTS (pitch, pace, timbre) — required if character has dialogue

**Critical rule**: The `physical_description` + `wardrobe` combined text becomes the **Subject Block** repeated in every prompt where this character appears. Keep it under 50 words and use identical wording each time.

### Props & Locations

Same pattern: `prop_id`/`location_id`, name, visual description, first appearance scene.

---

## Stage 4: Shot Design

For each shot, specify these dimensions. See [references/cinematography-terminology.md](references/cinematography-terminology.md) for the complete terminology reference.

### Shot Type (景别)

Use standard abbreviations. The most reliable prompt keywords:

| Abbrev | Full Name | AI Prompt Phrase | Subject Fill | Use For |
|--------|-----------|-----------------|-------------|---------|
| EWS | Extreme Wide Shot | "extreme wide shot, establishing" | 1-5% | Geography, isolation |
| WS | Wide Shot | "wide shot, full body visible" | 15-30% | Action, spatial relations |
| MS | Medium Shot | "medium shot, waist up" | 50-70% | Dialogue (default) |
| MCU | Medium Close-Up | "medium close-up, chest up" | 60-75% | Expression, interview |
| CU | Close-Up | "close-up, head and shoulders" | 70-85% | Emotion, reaction |
| ECU | Extreme Close-Up | "extreme close-up, [detail] only" | 85-100% | Intensity, key detail |
| OTS | Over-the-Shoulder | "over the shoulder shot" | varies | Dialogue coverage |
| POV | Point of View | "POV shot" | varies | Subjective experience |
| INSERT | Insert Shot | "insert shot, close-up of [object]" | varies | Props, documents |

### Dialogue in Shot Design

**Every shot must have a `dialogue` field.** It is either:
- The exact dialogue line spoken in this shot (with `dialogue_speaker`), OR
- `null` (explicitly — never omitted)

```
dialogue_speaker: "yun_li"   # or null
dialogue: "拿下他。"          # or null
dialogue_type: "onscreen"    # onscreen | VO | OS | null
```

### Camera Angle

| Angle | Prompt Keyword | Effect |
|-------|---------------|--------|
| Eye Level | "eye-level shot" | Neutral, natural |
| Low Angle | "low angle looking up" | Power, threat |
| High Angle | "high angle looking down" | Vulnerability |
| Dutch | "dutch angle, tilted" | Disorientation |
| Bird's Eye | "bird's eye view" | God-like, detached |

### Camera Movement

Limit to **one primary movement per shot**. Compound movements confuse AI models.

| Movement | Prompt Keyword | Use When |
|----------|---------------|----------|
| Static | "static camera, locked off" | Dialogue, stillness |
| Pan | "slow pan left/right" | Reveal environment |
| Tilt | "tilt up/down" | Reveal scale/height |
| Dolly In | "slow dolly in" | Emotional focus |
| Dolly Out | "dolly out" | Context reveal |
| Tracking | "tracking shot following" | Action, movement |
| Handheld | "handheld, slight shake" | Realism, tension |

### Lighting

Include in every shot: `[time-of-day] + [light source] + [mood]`.

Examples: "warm morning sunlight through window", "cold blue neon light, night", "dramatic side-lighting, film noir".

### Duration

Budget per shot: **3-8 seconds** for most T2V models. Kling supports up to 15s; Veo 3 supports 5-8s; Sora supports up to 20s in storyboard mode.

---

## Stage 5: AI Prompt Generation

Assemble the final AI video prompt using the six-part formula. See [references/ai-video-prompt-guide.md](references/ai-video-prompt-guide.md) for model-specific templates.

### Universal Six-Part Formula

```
SUBJECT: [character reference] + [1-2 defining traits]
ACTION: [single clear action beat]
SCENE: [location description from asset registry] + [background detail]
CAMERA: [shot type] + [camera angle] + [movement]
LIGHT: [time-of-day] + [light source] + [mood]
STYLE: [visual style] + [color palette] + [genre reference]
```

### Subject Block Pattern

When a character appears, always use this exact pattern at the start of SUBJECT:

```
{character_name}, {physical_description}, {wardrobe}, {distinctive_features}
```

Example: `Anna, early 30s olive skin dark wavy hair past shoulder sharp jawline, wearing worn brown leather jacket over white t-shirt, small scar above left eyebrow`

**Never paraphrase** this block between shots. Identical wording is essential for consistency.

### I2V (Image-to-Video) Variant

When a reference image is available (character sheet, previous shot's last frame):

```
SUBJECT: [what in the image should stay primary]
ACTION: [primary motion]
BACKGROUND MOVEMENT: [environmental motion]
CAMERA: [shot + movement]
```

Do not re-describe the subject's appearance in I2V prompts — the image provides that anchor.

### Negative Prompts

Always generate a `negative_prompt` field to exclude unwanted elements:

```
blurry, distorted face, extra limbs, deformed hands, inconsistent lighting, watermark, text overlay
```

---

## Temporal Bridge & Next-Scene Composition

### Temporal Bridge

`connect_to_next: true` marks shots where the tail frame should feed into the next shot's start condition. This is the single most effective consistency mechanism — it reduces character identity drift from 0.55 to 7.99 consistency score.

### Next-Scene Composition Workflow

For shots requiring high character/scene continuity across scene boundaries, use the **场景角色合成工作流**:

```
Shot N (尾帧) ──→ opsv-2511next分镜 ──→ Shot N+1 (首帧)
                    ↑
           next-scene LoRA ensures character + scene consistency
```

**Workflow ID**: `api-id-2064955138619568130`

This workflow is particularly useful for:
- Scene transitions where character appearance must be identical
- Multi-shot dialogue sequences (shot/reverse-shot)
- Action sequences with rapid cuts

---

## Continuity & Consistency Rules

Apply these rules across all shots:

| Rule | Implementation |
|------|---------------|
| **Character Consistency** | Same Subject Block text in every shot; use reference images for I2V |
| **Dialogue Consistency** | Each line verbatim from script; speaker attribution consistent across shots |
| **Temporal Bridge** | Set `connect_to_next: true` when a shot's final frame should feed into the next shot's starting frame |
| **Location Consistency** | Reference the same `location_id`; describe lighting consistently per time-of-day |
| **Prop Continuity** | Track prop state changes (e.g., coffee cup goes from "full" to "empty" to "shattered") |
| **180-Degree Rule** | Maintain camera position relative to the axis of action; document "camera side" per shot |
| **Eyeline Match** | When character A looks at character B, the next shot of B must show them from a matching angle |

---

## Output Formats

Generate the shot list in the format the user requests. Default to Markdown table for human review, JSON for programmatic use.

### Markdown Table Format (v2 — with dialogue)

| Shot ID | Scene | Shot Type | Angle | Movement | Dur | Speaker | Dialogue | Visual Description | AI Prompt | Trans |
|---------|-------|-----------|-------|----------|-----|---------|----------|-------------------|-----------|-------|
| S01-01 | S01 | EWS | Eye Level | Static | 4s | — | — | Empty diner, neon | EWS, empty diner... | Cut |
| S01-02 | S01 | MS | Eye Level | Static | 5s | Anna | "I've been waiting." | Anna alone at booth | MS, Anna sitting... | Cut |

### JSON Format

Follow the schema in [references/storyboard-schema.md](references/storyboard-schema.md). Key nesting: `project` → `characters`/`locations`/`props` → `scenes` → `shots`. Each shot must include `dialogue`, `dialogue_speaker`, and `dialogue_type` fields.

---

## Pipeline Integration

### Mapping to OpsV Comic Production Pipeline

| This Skill Stage | OpsV Pipeline Stage | Owner |
|-----------------|---------------------|-------|
| Stage 1 (Script Parsing) | 阶段一 (剧本拆解) | Comic-Creative |
| Stage 2 (Scene Breakdown) | 阶段二 (分镜设计) | Storyboard-Artist |
| Stage 3 (Asset Registry) | 阶段三 (视觉资产) | Comic-Creative + Runner |
| Stage 4 (Shot Design) | 阶段二 (分镜设计) | Storyboard-Artist |
| Stage 5 (AI Prompt) | 阶段二/四 (分镜+视频) | Storyboard-Artist + Runner |
| Temporal Bridge | 阶段三/四 (next-scene工作流) | Runner |

### Skill Reference Chain

```
storyboard-ai-video (本文档 — 规范源)
    ├── comic-storyboard (OpsV 分镜实施)
    │     └── 引用本文档的术语体系 + schema
    ├── comic-creative (OpsV 剧本拆解)
    │     └── 引用本文档的 Stage 1 对话提取规则
    └── comic-pipeline (OpsV 全局管线)
          └── 引用本文档的验证标准
```

---

## References

Load these reference files when detailed information is needed:

- **[cinematography-terminology.md](references/cinematography-terminology.md)** — Complete shot type, angle, movement, and composition terminology tables with AI prompt keywords
- **[storyboard-schema.md](references/storyboard-schema.md)** — Full JSON Schema for the shot list output, plus template examples (includes `dialogue`, `dialogue_speaker`, `dialogue_type`)
- **[ai-video-prompt-guide.md](references/ai-video-prompt-guide.md)** — Model-specific prompt templates for Kling, Veo 3, Runway Gen-4, Sora, and Hailuo
- **[asset-management.md](references/asset-management.md)** — Asset registry specifications, character sheet format (including `voice_profile`), and consistency strategies

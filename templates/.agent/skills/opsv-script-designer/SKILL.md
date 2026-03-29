---
name: opsv-script-designer
description: Storyboard and script design execution manual. Translates story outlines into YAML-structured `Script.md` files, including rigorous timing constraints and gallery templates. Supports d-ref/a-ref logic.
---

# OpsV Script Designer — Execution Manual (v0.4.3)

This manual defines the execution standards for the `ScriptDesigner Agent` when generating `videospec/shots/Script.md` within the OpenSpec-Video framework. The input is `story.md`, and the output is a compilation-ready storyboard script driven by YAML.

## Core Principles (v0.4.3)

**Principle 1: Timing is an Absolute Constraint.** 
Every Shot MUST have a clear `duration`. Ideal length is 3-5s, with an **upper limit of 15s**. Shots exceeding 15s must be split.

**Principle 2: Visual Language, Not Narrative.** 
Describe "what the camera sees": positions, movements, subject actions, lighting.

**Principle 3: YAML-First (Mandatory Rule).** 
All Shot definitions MUST be placed in the `shots:` YAML array within the document frontmatter. The Markdown body is for human review only.

**Principle 4: Bilingual/Bipolar Output.** 
- Technical Schema & Instructions: **English**.
- Narrative Description (YAML & Body): **Chinese/English** (Based on user preference).
- `prompt_en`: **Pure English** (Dense image generation prompts).

**Principle 5: d-ref & a-ref Boundaries.** 
Storyboards primarily reference an entity's `Approved References (a-ref)`. Shot-specific rendering confirmations are handled in the `Script.md` gallery.

---

## Workflow Execution

### Phase 1: Context Acquisition
Read `videospec/project.md` (style/aspect ratio) and `videospec/stories/*.md` (narrative beats).

### Phase 2: Thinking & Reasoning
Output a `<thinking>` block before generation:
```xml
<thinking>
1. Source Material: [Act/Scene] to convert.
2. Timing Budget: Total duration and split into visual moments (e.g., Shot 1: 4s, Shot 2: 3s).
3. Entities: Carry over all `@` tags from stories into YAML/Body.
4. Prompt Formulation: Translate actions into dense `prompt_en`.
</thinking>
```

### Phase 3: Generation
Use `write_to_file` to create/append `videospec/shots/Script.md`.
**CRITICAL**: Strictly follow `references/example-script.md`. Use `[@entity](../path/to/entity.md)` for links.

---

## Technical Specifications (YAML Array)

Every item in the `shots:` array MUST have:
- `id`: e.g., "shot_1"
- `duration`: integer (seconds)
- `camera`: Camera motion description.
- `environment`: Background description (preserve `@` entities).
- `subject`: Subject action (preserve `@` entities).
- `prompt_en`: **Pure English** dense image generation prompts.

---

## Keyframe & Animation Protocols

### Long-Take Inheritance
Use **`first_image: "@FRAME:<prev_shot_id>_last"`** for seamless motion transitions. The executor uses FFmpeg to capture the last frame of the previous video as the first frame of the next.

### Targeted Keyframing (`target_last_prompt`)
If a shot has dynamic changes (e.g., 180° orbit), provide a `target_last_prompt`. The system generates a `<shot_id>_last` image task.

---

## Visual Review & Gallery Standard

Markdown Body layout:
```markdown
## Shot [ID] ([Duration]s)
[Visual description with [@entity](../links)]

### 🖼️ Visual Gallery
| Frame 1 | Frame 2 |
|:---:|:---:|
| (Await opsv review write-back) | (Await opsv review write-back) |
```

---

## 中文参考 (Chinese Reference)
<!--
定义分镜脚本执行手册：将故事大纲翻译为 Script.md。
核心原则：YAML 驱动、严谨时长限制（上限 15s）、机位语言描述。
支持关键帧塌缩 (@FRAME:last) 和动态补帧 (target_last_prompt)。
-->

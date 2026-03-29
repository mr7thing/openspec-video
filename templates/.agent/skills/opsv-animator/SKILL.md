---
name: opsv-animator
description: Animation execution manual. Defines standards for extracting motion control instructions from `Script.md` to generate `Shotlist.md`. Includes duration passthrough, first-frame path extraction, and static-motion separation principles.
---

# OpsV Animator — Execution Manual (v0.4.3)

This manual defines the execution standards for the `Animator Agent` to achieve **Static-Motion Pipeline Separation**.

While the `ScriptDesigner Agent` establishes static composition and lighting in `Script.md`, and the director confirms the base images via `opsv review`, your sole task is to read `videospec/shots/Script.md`, write **Pure Motion Control Prompts** (`motion_prompt_en`), and output the results as a production-ready `videospec/shots/Shotlist.md`.

---

## 🎯 Core Responsibilities & Constraints

### 1. Pure Motion Control
Your prompts serve video-generation models (e.g., Sora, Veo, Kling, Seedance).
- **No Appearance**: Do NOT describe what the character wears or how the environment looks. That is already in the reference image.
- **Motion Only**: Describe: Camera movement, Subject motion, and Dynamic environmental changes.
- **Physical Feasibility**: Actions must be realistically completed within the 3-8 second window.
- **Pure English**: `motion_prompt_en` must be entirely in English (e.g., "Pan right slowly, subject walks across the frame, volumetric god rays shimmer").

### 2. Auto-Extract Reference Paths
Analyze the "Visual Gallery" in `Script.md` for each shot.
- **Rule**: Extract the exact file path of the confirmed draft (e.g., `![Draft X](../../artifacts/drafts_Y/shot_N_draft_Z.png)`).
- **Target**: Assign this path to the `reference_image` field in YAML.

### 3. Strict YAML Output
The final deliverable is a `videospec/shots/Shotlist.md` with a complete YAML Frontmatter array. The Markdown body can be empty as the compiler relies solely on the YAML data.

---

## 📝 Output Template (v0.4.3)

```markdown
---
shots:
  - id: shot_1
    duration: 5s                   # Passthrough from Script.md
    reference_image: "../artifacts/drafts_4/shot_1_draft_2.png"
    motion_prompt_en: "Slow dolly in, subject walking across the alley seamlessly, steam rising from food carts."
  - id: shot_2
    duration: 4s
    reference_image: "@FRAME:shot_1_last" # Long-take inheritance if applicable
    motion_prompt_en: "Static camera, old sage slowly opens his eyes, dust particles float in the air."
---
```

> **Note**: Each shot MUST include a `duration` field passed exactly from `Script.md`.

---

## 🚨 Quality Gates

Before generation, perform a `<thinking>` check:
1. Did I leak appearance features into the motion prompt? (If yes, DELETE. Features contaminate motion understanding.)
2. Is the action reasonable for the given duration?
3. Is the YAML indentation and structure strictly aligned with `references/example-shotlist.md`?

---

## 中文参考 (Chinese Reference)
<!--
定义从 Script.md 提取动态控制指令并生成 Shotlist.md 的规范。
核心原则：动静分离。只管机位运动和主体动作，不管长相。
支持关键帧折合与时长透传。
-->

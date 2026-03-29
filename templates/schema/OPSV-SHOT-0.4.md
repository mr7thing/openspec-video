# OPSV-SHOT-0.4 Shot & Animation Specification

> Defines the storyboard syntax, dynamic control parameters, and long-take inheritance logic for OpsV 0.4 environment. This version reinforces the **Static-Motion Separation Principle** to ensure consistent identity in video generation.

---

## 1. Core Design Philosophy

- **@Anchor Decoupling**: Visual descriptions (e.g., "black hair", "red eyes") are strictly prohibited in storyboards; use `@role_K` references instead.
- **Static-Motion Separation**: Visual features are provided by `Approved References` (a-ref); this spec is only responsible for: **Camera Motion**, **Subject Action**, and **Environmental Evolution**.
- **Parallel Universe**: Default support for `--model all`. The compiler automatically generates tasks for each enabled engine.

---

## 2. YAML Structure Definition

This structure applies to `Script.md` (Early/Mid stage) and `Shotlist.md` (Late-stage animation control).

```yaml
shots:
  - id: "shot_1"
    duration: 5s              # Recommended 3-5s, max 15s
    # --- Static Input ---
    first_image: "artifacts/drafts_2/shot_1_draft_2.png" # Precise path or @FRAME:shot_0_last
    reference_images:         # Auto-extracted by compiler from @entity a-ref
      - "artifacts/drafts_1/role_K_turnaround.png"
    # --- Motion Control ---
    camera_motion: "Extreme macro, slow push in"       # Directional intent
    motion_prompt_zh: "镜头极微距推进，蚕茧表面缓慢裂开"     # Chinese intent (optional)
    motion_prompt_en: >                                # Primary API Instruction
      Macro shot, surface slowly cracking, morning dew trembling, 
      cinematic smooth motion, high frame rate quality.
    # --- QA Metadata ---
    entities: ["@role_butterfly", "@scene_cocoon"]     # Entities involved in this shot
```

---

## 3. Detailed Field Specifications

### 3.1 `first_image` and Long-Take Inheritance
- **Explicit Path**: Points to the best draft confirmed via `opsv review`.
- **Inheritance Pointer `@FRAME:<id>_last`**:
  - Represents using the last frame of the specified shot's video as the first frame of this shot.
  - Core Use: Ensures perfect temporal continuity for continuous motion across multiple shots.

### 3.2 `motion_prompt_en` (Mandatory English)
- **Guideline**: Describe ONLY the "changing parts."
- **Forbidden Zones**: Do not include appearance adjectives.
  - ❌ `A beautiful girl in red dress running...`
  - ✅ `Subject running rapidly towards the light, hair fluttering in the wind...` (Appearance fixed by reference image).

---

## 4. Compilation Constraints (0.4.3+)

- **Task Generation**: `opsv animate` parses the storyboard files.
- **Output Isolation**: Videos are stored strictly by engine name:
  - `artifacts/videos/[EngineName]/shot_1_v1.mp4`
- **Style Injection**: The compiler automatically appends `global_style_postfix` from `project.md` to every video task.

---

## 5. Quality Gates (Supervisor /opsv-qa)

| Check Item | Logic |
| :--- | :--- |
| **Feature Leakage** | Scan `motion_prompt_en` for color, appearance, or forbidden adjectives. |
| **Reference Alignment** | Verify that cited `@entity` has valid `Approved References`. |
| **First Frame Validity** | check if the image path exists or if the `@FRAME` pointer is closed. |

---

## 中文参考 (Chinese Reference)
<!--
定义 OpsV 0.4 环境下的分镜语法及动态控制逻辑。
核心原则：动静分离，分镜中禁止容貌描写。
支持 @FRAME 关键帧继承和多模型平行生成。
-->

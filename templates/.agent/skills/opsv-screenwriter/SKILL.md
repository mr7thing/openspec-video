---
name: opsv-screenwriter
description: Screenwriting execution manual. Defines standards for `story.md` writing: entity abstraction, @ anchor usage, and asset decoupling, for use by the Screenwriter Agent.
---

# OpsV Screenwriter — Execution Manual (v0.4.3)

This manual defines the execution standards for the `Screenwriter Agent` when drafting `videospec/stories/story.md`. The core task is to build a narrative while performing **entity abstraction and decoupling**, creating a clean system of `@` anchors for the storyboard production.

## Core Responsibilities

1. **Entity Abstraction**
   While or before drafting, identify recurring concepts (protagonists, key scenes, critical props).

2. **Asset Declaration**
   Solidify entities by defining them in `videospec/elements/` and `videospec/scenes/`. 
   - **Bipolar Minimalism**: Determine if an asset has a reference image (`Approved References`).
   - If an image exists, keep the text description in the asset file minimal. Let the image anchor the identity.
   - Only provide dense details if no reference image is available (`has_image: false` equivalent).

3. **Coder-like Scripting**
   In the main story outline, focus on action and transition. **Whenever a character stays, moves, or interacts with a key object, you must use a cold `@entity_ID` pointer.**

## Strict Constraints

- **Prohibit Feature Leakage**: If you write "The man `@role_K` in his black tuxedo walks to the bar," you have **FAILED**. The correct way is: "`@role_K` walks to the bar." His tuxedo color belongs in `role_K.md` or its reference image.
- **Action-Oriented**: Output must serve as a functional basis for follow-up system execution (storyboarding).

---

## Workflow Guide

When the Director/Producer asks for a scene:
1. **Analyze Requirements**: Extract necessary assets.
2. **Declare Assets**: Create the required `@` entity files.
3. **Build the Narrative**: Embed `@` anchors within the plot.

---

## Quality Self-Check Checklist

- [ ] Does the plot outline fully utilize `@` anchors?
- [ ] Is the narrative body extremely concise, lacking appearance details?
- [ ] Does the asset declaration strictly follow `OPSV-ASSET-0.4` YAML constraints?
- [ ] Has the `story.md` been cross-referenced with `references/example-story.md`?

---

## 中文参考 (Chinese Reference)
<!--
定义编剧执行手册：实体提纯、@ 指针使用与资产解耦。
核心原则：禁止在大纲中堆砌细节（特征泄漏），冷酷地使用 @ 资产标识符。
-->

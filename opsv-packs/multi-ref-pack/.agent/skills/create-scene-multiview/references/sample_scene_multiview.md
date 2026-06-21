# 场景多视图范本 — Temple-Day-MultiView

> 从 shortlist.md 场景数据派生。供 S5/S6 做场景一致性约束。

---

```yaml
---
category: scene_multi_view
status: drafting
id: Scene-Temple-Day-MultiView
description: "道场日景多视图参照表"
generation_type: image
refs:
  - Temple-Day
  - LuRan
  - YunLi
prompt: >
  You are a professional scene multi-view reference sheet artist. Generate a
  complete multi-angle scene reference sheet for cross-shot consistency in AI
  video generation.

  Generate a multi-view reference sheet with Chinese labels:
  - Accurately reproduce spatial layout, architecture, and lighting direction
  - All angles must show the same location

  Scene Info:
  Scene: Temple-Day (道场·日)
  Location: Traditional temple dojo hall
  Description: Grand hall with wooden floor, floor-to-ceiling windows on the
  left, courtyard entrance at the back. A massive white jade wedding stele
  (approximately 9m tall) stands at center-rear with dragon and phoenix
  reliefs and gold leaf trim. Bead curtain hangs on the left side. Gray stone
  floor extends from entrance to altar area. Morning light streams through
  windows, casting long shadows.
  Time: morning (cool blue light, fog, long shadows); noon (warm direct
  sunlight, gold reflections off the stele)

  Layout: White background. Multiple camera angles of the same location:
  - [全景定场]: Establishing wide shot from entrance looking in. The massive
    stele at center-rear, bead curtain on left, stone floor extending to altar.
    Columns and ceiling beams visible.
  - [主要活动区]: Medium shot of the main activity area in front of the stele
    where characters converse and move.
  - [焦点物体]: Close-up of the wedding stele showing dragon and phoenix
    relief carvings and gold leaf trim detail.
  - [低角度]: Low angle shot from the stone floor looking up, stele appears
    towering, ceiling beams and columns in frame.

  Labels: Chinese titles only, no percentage numbers, no borders or frames.
  Clean black font.

  Style: pure white background, soft even light, photorealistic 8K quality.
  Chinese ancient palace style, 3D render, Unreal Engine quality, cinematic
  lighting. No frame separators between modules, natural transitions.

  CRITICAL: All angles must show the same location — identical architecture,
  columns, floor pattern, and lighting direction. This is the cross-shot
  consistency baseline. Morning variant: cool light with fog and long shadows.
  Noon variant: warm direct sunlight with gold reflections on the stele.
---
```

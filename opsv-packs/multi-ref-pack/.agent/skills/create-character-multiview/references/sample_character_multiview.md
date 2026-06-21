# 角色多视图范本 — LuRan-MultiView

> 从 Phase 1 角色定稿 LuRan 派生。供 S5/S6 做跨镜头一致性约束。

---

```yaml
---
category: character_multi_view
status: drafting
id: LuRan-MultiView
description: "陆然默认服装多视图参照表"
generation_type: image
refs:
  - LuRan
prompt: >
  You are a professional character turnaround sheet artist. Generate a complete
  multi-view character reference sheet from a single character design image,
  used for cross-shot consistency in AI video generation.

  Based on the character in the design image, generate a multi-view reference
  sheet with Chinese labels:
  - 100% preserve facial features, hairstyle, and body proportions
  - Accurately reproduce clothing style, color, and material texture
  - All views must show the same person (same face consistency)

  Character Info:
  Name: LuRan
  Height: 178cm
  Appearance: young man, tall and lean, sharp features, determined eyes
  Outfit: crimson silk robe with gold dragon embroidery, jade belt, silver crown
  Material: silk texture red robe, metal dragon buckle, white jade crown
  Key features: iconic crimson robe (visual anchor in all shots), thin scar at
  end of left eyebrow (visible in close-ups), dragon-pattern belt buckle
  Style: Chinese ancient fantasy, 3D realistic, cinematic lighting

  Layout: White background. Center: full-body front standing pose (40% space).
  Top-left [服装拆解]: lay out all wardrobe items individually with realistic
  material details — crimson silk robe with gold embroidery, jade belt with
  dragon buckle, silver hair crown.
  Top-right [表情集]: 4 facial close-ups (calm, smiling, surprised, serious),
  facial features identical to center figure.
  Bottom-left [多角度视图]: 4 angle views horizontally arranged (3/4 left,
  3/4 right, side profile, back view), clothing and hairstyle consistent.
  Bottom-right [随身道具]: lay out carried items — silver sheathed sword.

  Labels: Chinese titles only, no percentage numbers, no borders or frames.
  Clean black font, fine lines connecting center to modules.

  Style: pure white background, soft even studio lighting, photorealistic 8K
  quality, Chinese ancient fantasy style, 3D render, Unreal Engine quality.
  No frame separators between modules, natural transitions.

  CRITICAL: All views must have identical face, outfit, hairstyle, and body
  proportions. This is the cross-shot consistency baseline for AI video
  generation — any inconsistency will break all downstream shots.
---
```

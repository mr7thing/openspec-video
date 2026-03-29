---
name: opsv-asset-designer
description: Asset generation execution manual. Defines the strict YAML-First Trisected Format for assets in `elements/` and `scenes/`, including d-ref/a-ref dual-channel reference logic.
---

# OpsV Asset Designer — Execution Manual (v0.4.3)

This manual defines the execution standards for the `AssetDesigner Agent` when creating assets in the `videospec/elements/` and `videospec/scenes/` directories under the OpenSpec-Video framework.

## Core Principles (v0.4.3)

**Principle 1: Context is King.** 
Always read `videospec/project.md` before designing any asset to align with the project's era, tone, and global style.

**Principle 2: High Density Descriptions.** 
Never output sparse descriptions. Provide dense details on materials, lighting, wear and tear, emotions, and composition.

**Principle 3: Dual-Channel Reference System.** 
Uses `## Design References` (d-ref: inspiration/base for generation) and `## Approved References` (a-ref: finalized reference for future shots). 

**Principle 4: Output Language Hierarchy.** 
- Primary Instructions & Manual: **English**.
- Asset Descriptions & Body: **Chinese/English** (Based on user preference/context).
- `prompt_en` field: **Pure English**.

**Principle 5: YAML-First & Single Source of Truth (SSOT).** 
Metadata like `prompt_en` resides in the YAML Frontmatter. Resource paths (images) must ONLY be listed under `## Design References` or `## Approved References` in the Markdown body.

---

## Document Format (CRITICAL)

All generated `.md` files MUST follow the **YAML-First Trisected Format**:

```yaml
---
name: "@AssetName"
type: "character"        # character | scene | prop
brief_description: "[One-sentence summary]"
detailed_description: >
  [Dense description, at least 3-5 sentences.
  Include materials, lighting, emotions, etc.]
prompt_en: >
  [Dense English prompt for image generation models.
  Include composition, lighting, texture, resolution, style...]
---

# Body (Machine-Readable Payload)

## subject
[One-sentence description of the subject]

## environment
[Shooting environment/background. Empty for pure props.]

## camera
[Camera position/angle in English. e.g., Close-Up, Macro, Wide Shot]

## Design References
<!-- d-ref: Inspiration/Base for generating THIS asset -->
<!-- Format: [Description](Image_Path) -->

## Approved References
<!-- a-ref: Finalized image for reference in shots -->
<!-- Format: [Version/Note](Image_Path) -->
```

---

## Workflow Execution

### Phase 1: Context Acquisition
Read `videospec/project.md` and check `global_style_postfix`, `vision`, and comments.

### Phase 2: Thinking & Reasoning
You MUST output a `<thinking>` block before generation:
```xml
<thinking>
1. Project Context: [Setting/Vibe]
2. Asset Intent: [Name/Purpose]
3. Aesthetic Translation: [Materials, lighting, history details]
4. Reference Strategy: [Which refs to use for d-ref/a-ref]
</thinking>
```

### Phase 3: Generation
Use `write_to_file` to create the Markdown file in `videospec/elements/` or `videospec/scenes/`.

---

## 中文参考 (Chinese Reference)
<!--
定义资产生成的三段式格式：YAML 元数据、Markdown 正文、d-ref/a-ref 双通道参考图。
d-ref: 灵感图，生成前参考。
a-ref: 定档图，供后续镜头引用锁定。
-->

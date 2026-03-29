# OpenSpec-Video (OpsV) 0.3.2 Asset Specification (OPSV-ASSET-0.3.2.md)

本规范定义了 OpsV 0.3.2 生态下所有视觉资产（角色、场景、道具）的严格格式。目标是 **单一真相源 (SSOT)** 与**二元极简主义**：消除文字描述与参考图之间的矛盾。

## 1. File Format

- **Extension**: Must be `.md`.
- **Structure**: Every asset file MUST contain a YAML frontmatter block followed by the markdown body.

```markdown
---
# Required YAML Metadata
---
# Markdown Body
```

## 2. YAML Frontmatter Requirements

The following fields are mandatory:

```yaml
---
name: "@prefix_identifier" # The unique tag used to reference this asset in scripts.
type: "character"          # The category: 'character', 'scene', 'prop', etc.
has_image: true            # Boolean indicating if a physical physical image reference is provided.
---
```

- **`name`**: Must start with `@` and follow a standard prefix convention (e.g., `@role_K`, `@scene_bar`, `@prop_gun`). This is the key the compiler uses to link the asset.
- **`has_image`**: The most critical gating mechanism. It dictates the rules for the markdown body.

## 3. The Binary Content Rules

The content of the markdown body is strictly determined by the `has_image` boolean. **Any violation of these rules will result in compilation failure or severe "concept bleeding" during generation.**

### Scenario A: `has_image: true` (Identity Lock)

**Philosophy**: If a picture is worth a thousand words, do not write a thousand words to describe it. Let the model's Identity Lock handle the micro-features.

- **Rule 1: Minimalist Text**. The text description MUST be a single, concise sentence identifying the core subject (max 20 words). It provides semantic context, not micro-details.
- **Rule 2: Absolute Image Reference**. You MUST provide an `![Image]()` tag pointing to the absolute or relative path of the reference image. This image serves as the absolute visual anchor.

```markdown
---
name: "@role_K"
type: "character"
has_image: true
---

# Subject Identity
30多岁赛博侦探，黑色高领大衣，左眼亮起红色义眼流光。

# Physical Anchor
![K_Ref](C:/Gemini/OpenSpec-Video/assets/characters/K.png)
```

### Scenario B: `has_image: false` (Comprehensive Description)

**Philosophy**: Without a physical anchor, the text is the only source of truth. It must be exhaustive.

- **Rule 1: Detailed Text**. The text must contain the full visual breakdown: appearance, clothing, lighting, style, colors, and atmosphere.
- **Rule 2: No Images**. The file MUST NOT contain any `![Image]()` tags.

```markdown
---
name: "@scene_neon_alley"
type: "scene"
has_image: false
---

# Scene Description
赛博朋克风格的狭窄幽暗小巷，持续不断的大雨，地面水洼倒映着闪烁的紫色和青色霓虹灯招牌。两侧是生锈的金属管道和满是涂鸦的砖墙，光线昏暗，充满压抑和危险的氛围，电影级光影，8k分辨率。
```

## 4. Compilation Constraints (For the Agent/CLI)

When interpreting these assets, the Agent Compiler MUST adhere to the following logic:

1.  **If `has_image: true`**:
    -   Extract the minimal text.
    -   Extract the image path. Add it to the physical `REQUIRED_ASSETS` queue.
    -   **NEVER** attempt to hallucinate or invent features not explicitly visible in the image.
2.  **If `has_image: false`**:
    -   Extract the comprehensive text.
    -   Do not queue any physical assets.
    -   Rely entirely on the text for the generation parameters.

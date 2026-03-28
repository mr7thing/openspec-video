# OpenSpec-Video (OpsV) 0.3.2 Asset Specification (OPSV-ASSET-0.3.2.md)

鏈鑼冨畾涔変簡 OpsV 0.3.2 鐢熸€佷笅鎵€鏈夎瑙夎祫浜э紙瑙掕壊銆佸満鏅€侀亾鍏凤級鐨勪弗鏍兼牸寮忋€傜洰鏍囨槸 **鍗曚竴鐪熺浉婧?(SSOT)** 涓?*浜屽厓鏋佺畝涓讳箟**锛氭秷闄ゆ枃瀛楁弿杩颁笌鍙傝€冨浘涔嬮棿鐨勭煕鐩俱€?

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
30澶氬瞾璧涘崥渚︽帰锛岄粦鑹查珮棰嗗ぇ琛ｏ紝宸︾溂浜捣绾㈣壊涔夌溂娴佸厜銆?

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
璧涘崥鏈嬪厠椋庢牸鐨勭嫮绐勫菇鏆楀皬宸凤紝鎸佺画涓嶆柇鐨勫ぇ闆紝鍦伴潰姘存醇鍊掓槧鐫€闂儊鐨勭传鑹插拰闈掕壊闇撹櫣鐏嫑鐗屻€備袱渚ф槸鐢熼攬鐨勯噾灞炵閬撳拰婊℃槸娑傞甫鐨勭爾澧欙紝鍏夌嚎鏄忔殫锛屽厖婊″帇鎶戝拰鍗遍櫓鐨勬皼鍥达紝鐢靛奖绾у厜褰憋紝8k鍒嗚鲸鐜囥€?
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

# OpsV Document Standards (v0.4.3)

> Standardized YAML templates, @ entity syntax, and naming conventions for the OpenSpec-Video ecosystem.

---

## 1. Asset Definitions (elements/ and scenes/)

### OPSV-ASSET-0.4 Schema
Every asset file is a Markdown document with a YAML frontmatter.

```markdown
---
name: "@role_K"                  # Unique identifier (@ + prefix + name)
type: "character"                # character | scene | prop
brief_description: "Short desc"   # Used for @ reference tooltips
prompt_en: >                     # English prompt for generation
  Detailed visual description for Stable Diffusion/DALL-E...
---

## Design References
- [Reference Image](refs/style_mood.png) # Used for img2img input

## Approved References
- [Approved View](artifacts/drafts_2/role_K_final.png) # Feature anchor
```

---

## 2. Narrative Scripting (Script.md)

### Static Composition Spec
The `Script.md` file defines the key visual elements for each shot.

```yaml
shots:
  - id: "shot_1"
    duration: 5s
    # References to assets
    entities: ["@role_K", "@scene_noir_street"]
    # Visual intent
    camera: "Wide shot, low angle"
    prompt_en: "Cyber detective K walking down a rain-slicked neon street..."
```

---

## 3. Animation Logic (Shotlist.md)

### Motion Specification
The `Shotlist.md` file defines the dynamic control instructions.

```yaml
shots:
  - id: "shot_1"
    duration: 4s
    # Motion instruction (Appearance is decoupled)
    motion_prompt_en: "Camera pans right, Subject slowly turns head..."
    # Keyframe Heritage
    first_image: "@FRAME:shot_0_last"
```

---

## 4. Naming Conventions

### File Naming
- **Assets**: `@role_name.md`, `@scene_name.md`.
- **Scripts**: `Script.md`, `Shotlist.md`.

### Artifact Naming
- **Drafts**: `shot_X_draft_N.png`.
- **Videos**: `shot_X_vN.mp4`.

---

> *OpsV 0.4.3 | Latest Update: 2026-03-28*

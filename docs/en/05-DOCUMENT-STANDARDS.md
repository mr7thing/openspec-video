# OpsV Document Standards

> Formatting conventions, YAML templates, @ reference syntax, and naming standards for all `.md` files in OpsV.

---

## 1. General Formatting Guidelines

### 1.1 Mandatory YAML Frontmatter
All OpsV documents (Assets, Storyboards, Projects) **must** begin with YAML Frontmatter:
```yaml
---
key: value
---
```
- The compiler **only reads the YAML area**.
- Markdown body is for human review and is ignored by the compiler.
- YAML must be valid (check indentation and spaces after colons).

### 1.2 Language Standards
| Element | Language | Description |
|---------|----------|-------------|
| Body/Notes | User Preference | To reduce cognitive friction for the director. |
| `prompt_en` | English | For image rendering models (SD/Flux/SeaDream). |
| `motion_prompt_en` | English | For video models (Seedance/Wan 2.1). |
| YAML Keys | English | For programming consistency. |

---

## 2. Asset Documents (elements/ and scenes/)

### 2.1 YAML Structure
```yaml
---
name: "@role_hero"           # @ prefix + type + ID
type: "character"             # character | scene | prop
brief_description: "One-sentence summary"
detailed_description: >       # Detailed features for non-image gen
  Dense features, 3-5 sentences.
prompt_en: >                  # Render prompt
  Dense English prompt for diffusion models.
---
```

### 2.2 Dual-Channel Reference System (d-ref / a-ref)
- **Design References (d-ref)**: Input references for generating the entity itself (mood boards, sketches).
- **Approved References (a-ref)**: Fixed outputs confirmed by the director. Used as inputs when **others** reference this entity.

---

## 3. Project Configuration (project.md)
```yaml
---
aspect_ratio: "16:9"          # 16:9 | 9:16 | 1:1 | 21:9 | 4:3
engine: "seedance"            # Default engine
vision: "Global project vision"
global_style_postfix: "cinematic, 8k, masterpiece"
resolution: "2K"              # 720p | 1080p | 2K | 4K
---
```

---

## 4. Script & Shotlist Standards

### 4.1 Script.md (Storyboard)
- `shots` array in YAML.
- Mandatory `id`, `duration` (3-15s), and `camera`.
- Markdown body with visual gallery placeholders.

### 4.2 Shotlist.md (Animation)
- Passthrough `duration` from Script.md.
- `motion_prompt_en`: **Pure motion only**, no appearance adjectives.
- Supports `@FRAME:<id>_last` for temporal continuity.

---

## 5. @ Reference Syntax
- `@role_K`: References `videospec/elements/@role_K.md`.
- `@scene_Forest`: References `videospec/scenes/@scene_Forest.md`.
- `@prop_Sword`: References `videospec/elements/@prop_Sword.md`.

---

## 6. Glossary of Terms
- **Shot Types**: EWS, WS, MS, MCU, CU, ECU.
- **Angles**: Eye level, Low angle, High angle, Dutch angle.
- **Movements**: Static, Dolly (in/out), Pan, Truck, Tilt, Orbit, Tracking.

---

> *"Format is Law; YAML is Truth."*
> *OpsV 0.4.3 | Latest Update: 2026-03-29*

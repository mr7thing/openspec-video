# Document Standards (v0.5)

> OpenSpec-Video v0.5 adopts a **Four-Layer Specification System** to ensure deterministic document-as-code workflows.

## 1. Four-Layer Architecture

```
Layer 1: @ Reference Syntax    → Standardized inter-document linking
Layer 2: Frontmatter Schema    → YAML metadata type constraints
Layer 3: Markdown Body         → Human-readable content conventions
Layer 4: Execution Rules       → Compile-time + runtime semantic validation
```

## 2. Frontmatter Schema (v0.5)

### 2.1 Element Documents (elements/*.md)

```yaml
---
type: character | prop | costume    # Asset type (required)
status: drafting | approved         # Status (required)
reference: elder_brother            # Variant dependency (optional)
refs:                               # Referenced asset IDs (optional)
  - elder_brother
  - school_uniform
reviews:                            # Review history (auto-appended)
  - "2025-03-15: approved via review UI"
---
```

**Removed Fields** (v0.4 → v0.5 Breaking Changes):
- ~~`has_image`~~ → Replaced by `status: approved` + `## Approved References`
- ~~`visual_traits`~~ → Replaced by body text descriptions
- ~~`brief_description`~~ → Replaced by first paragraph of body
- ~~`detailed_description`~~ → Replaced by body content

### 2.2 Scene Documents (scenes/*.md)

Same structure as element documents. `type: scene`.

### 2.3 Shot Design Document (shots/Script.md)

```yaml
---
type: shot-design                   # Fixed value
status: drafting | approved
total_shots: 48                     # Total shot count
refs:                               # All asset IDs referenced in this file
  - elder_brother
  - younger_brother
  - classroom
---
```

### 2.4 Shot Production Document (shots/Shotlist.md)

```yaml
---
type: shot-production               # Fixed value
status: drafting | approved
---
```

### 2.5 Project Configuration (project.md)

```yaml
---
type: project
engine: seedance-1.5-pro
aspect_ratio: "16:9"
resolution: "1920x1080"
global_style_postfix: "cinematic lighting, film grain"
vision: "A short film about brotherhood"
---
```

## 3. @ Reference Syntax

### 3.1 Format

```
@asset_id           → Reference the default variant of an asset
@asset_id:variant   → Reference a specific variant
```

### 3.2 Examples

```markdown
## Shot 01 - Classroom Reunion

@elder_brother walks into the classroom, seeing @younger_brother by the window.
The background is @classroom:morning with warm morning light.
```

### 3.3 Resolution Rules

| Reference | Resolves To |
|-----------|-------------|
| `@elder_brother` | `default` variant in `## Approved References` of `elements/elder_brother.md` |
| `@elder_brother:childhood` | `childhood` variant in the same section |
| `@classroom:morning` | `morning` variant in `scenes/classroom.md` |

### 3.4 Constraints

- Target must exist in `elements/` or `scenes/` directory
- Referenced variant must be approved in `## Approved References`
- Unapproved dependencies are blocked by DependencyGraph

## 4. Markdown Body Conventions

### 4.1 Approved References Section

Auto-appended when an asset passes `opsv review`:

```markdown
## Approved References

### default
![default](../../artifacts/elder_brother_default.png)

### childhood
![childhood](../../artifacts/elder_brother_childhood.png)
```

### 4.2 Design References Section (Optional)

For external reference images (not generated):

```markdown
## Design References

![ref1](../../ref/elder_brother_ref.jpg)
```

### 4.3 Script.md Body Structure

v0.5 parses shots from **body `## Shot NN` headers**, not frontmatter `shots[]` arrays:

```markdown
## Shot 01 - Classroom Reunion

@elder_brother pushes open the classroom door, morning light pouring in.
Camera: Medium tracking shot, slow push-in.

## Shot 02 - Window Gaze

@younger_brother turns to look at the door, smiling.
Camera: Close-up, shallow depth of field.
```

## 5. Execution Rules (Compile + Validate)

### 5.1 Compile-Time Generic Validation

- Quote sanitization (YAML → JSON boundary issues)
- Required field checks (id, prompt, output_path)
- Residual quote detection

### 5.2 Runtime Model-Specific Validation

```
opsv gen-image --dry-run    # Validate only, no execution
```

Validation items:
- Pixel constraints: model minimum/maximum pixel limits
- Aspect ratio constraints: model-supported aspect_ratio whitelist
- Prompt length: model token limits

### 5.3 frame_ref (Replaces schema_0_3)

Video generation jobs use `frame_ref`:

```json
{
  "frame_ref": {
    "first": "/path/to/first_frame.png",
    "last": "/path/to/last_frame.png"
  }
}
```

**Removed**: `middle_image` (no API actually supports this parameter).

## 6. Dependency Graph

### 6.1 Dependency Sources

- `reference` field: Variant dependency (younger_brother → elder_brother)
- `refs` field: Content reference dependency

### 6.2 Strict Mode

```
opsv deps    # View dependency graph analysis
```

During job generation, DependencyGraph auto-filters:
- ✅ All dependencies approved → Executable
- ⏸️ Dependencies not approved → Blocked

### 6.3 Topological Sort

```
Batch 1: elder_brother, classroom    (no dependencies)
Batch 2: younger_brother             (depends on elder_brother)
Batch 3: shot_01, shot_02           (depends on multiple assets)
```

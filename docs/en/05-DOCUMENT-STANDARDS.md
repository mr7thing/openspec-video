# Document Standards (v0.6.3)

> OpenSpec-Video uses a **four-layer specification system** ensuring document-as-code determinism.

## 1. Four-Layer Architecture

```
Layer 1: @ Reference Syntax    �?Standardized inter-document linking
Layer 2: Frontmatter Schema    �?YAML metadata type constraints
Layer 3: Markdown Body         �?Human-readable body area specs
Layer 4: Execution Rules       �?Compile-time + runtime semantic validation
```

## 2. Frontmatter Schema

### 2.1 Element Documents (elements/*.md)

```yaml
---
type: character | prop | costume
status: drafting | approved
visual_brief: >
  Brief visual description (folded block syntax)
visual_detailed: >
  Detailed visual features. Supports quotes like "Cinematic Lighting".
prompt_en: >
  Core prompt. Derived from visual_detailed.
refs:
  - elder_brother
reviews:
  - "2025-03-15: approved"
---
```

### Version Changelog

- **v0.6.0**: Dispatcher eliminated, Spooler Queue architecture, service topology standardization, `opsv init` auto-creates `.opsv/` and `.opsv-queue/`
- **v0.5.19**: CI/CD integration, Agent three-role consolidation
- **v0.5.16**: SiliconFlow image support, hybrid architecture
- **v0.5.15**: Seedance Provider, api_config capability fields
- **v0.5.14**: Document purity �?no hardcoded execution config
- **v0.5.8**: Folded block syntax enforced for all long text fields
- **v0.5.0**: DependencyGraph, pure Markdown `## Shot NN` parsing

### 2.2-2.5 Other Document Types

- **scenes/*.md**: Same as elements, `type: scene`
- **shots/Script.md**: `type: shot-design`, `total_shots`, `refs[]`
- **shots/Shotlist.md**: `type: shot-production`
- **project.md**: `type: project`, `aspect_ratio`, `resolution`, `global_style_postfix`, `vision`

## 3. @ Reference Syntax

```
@asset_id           �?Default variant
@asset_id:variant   �?Specified variant
```

Constraints: Target must exist in `elements/` or `scenes/`, variant must be Approved, unapproved dependencies are blocked by DependencyGraph.

## 4. Markdown Body Standards

Required skeleton headings: `## Vision`, `## Design References`, `## Approved References`

Script.md parses from `## Shot NN` headings (not frontmatter arrays).

## 5. Execution Rules

### 5.1 Compile-Time Validation
- Quote sanitization, required field checks, residual quote detection

### 5.2 Spooler Queue Compilation (v0.6.0)
```bash
opsv generate                                              # Intent stage
opsv queue compile queue/jobs.json --provider seadream      # Compile stage
```
Router: Standard API �?`StandardAPICompiler`, ComfyUI �?`ComfyUITaskCompiler`

### 5.3 frame_ref
```json
{ "frame_ref": { "first": "/path/first.png", "last": "/path/last.png" } }
```

## 6. Dependency Graph

Topological sorting with strict mode: all dependencies must be Approved before execution.

---

> *OpsV 0.6.3 | Last updated: 2026-04-22*

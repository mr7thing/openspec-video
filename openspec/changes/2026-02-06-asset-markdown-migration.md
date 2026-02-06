# Proposal: Markdown Assets & Cascade Updates
**Date**: 2026-02-06
**Status**: Draft

## Summary
Migrate all Asset definitions from YAML to Markdown to support "Visual-First" workflows, and introduce a Cascade Update mechanism for dependency integrity.

## 1. Markdown as Single Source of Truth
YAML is good for structure, but bad for media. Markdown is perfect for both.

### New Asset Format (`assets/characters/K.md`)
```markdown
---
id: char_k
name: Detective K
role: Protagonist
---

# Visual Reference
![Reference Sheet](./images/k_ref_v1.png)

# Traits
- **Clothing**: Brown leather trench coat, high collar.
- **Features**: Robotic red left eye. Stubble.
- **Vibe**: Weary, cynical, noir.
```

### Benefits
- **Visuals inline**: Directly view the asset image in the editor.
- **Rich Text**: Use bold/lists for Nuance, which LLMs understand better than YAML strings.

## 2. Cascade Update Mechanism (The "Ripple Effect")
When a core asset changes (e.g., K's coat changes from Brown to Black), it invalidates downstream artifacts.

### The Dependency Graph
`Asset (K)` -> `Script (Scene 1)` -> `Storyboard (Shot 1)` -> `Video (Clip 1)`

### Proposed `opsv cascade` Workflow
1.  **Monitor**: Detecting changes in `assets/*.md`.
2.  **Impact Analysis**: Find all Scripts referencing `[char_k]`.
3.  **Invalidate**: Mark associated Jobs in `queue/jobs.json` as `STALE`.
4.  **Regenerate**:
    - Update prompt in `JobGenerator`.
    - Trigger `opsv shoot --stale` to re-shoot affected shots.

## Tasks
- [ ] Refactor `AssetManager.ts` to support `.md` parsing (Frontmatter + Remark).
- [ ] Convert `project-demo` YAML assets to MD.
- [ ] Update `JobGenerator.ts` to read traits from Markdown body.

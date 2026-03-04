---
description: Skill for ensuring consistency across story assets and script. Handles "opsv change" logic.
---
# OpenSpec Consistency Manager Skill

## Concept
`opsv change` is not about creating a document. It is about **Audit, Propagate, and Regenerate**.
When user manually modifies a file, or asks for a change, YOU (the Agent) act as the Consistency Engine.

## Workflow: Renaming an Entity
**User Input**: "Rename [OldName] to [NewName]" or "I renamed [OldName] file, fix the rest."

1.  **Audit (Impact Analysis)**:
    - Search all usages: `grep -r "[OldName]" videospec/`
    - Identify affected files:
        - `videospec/stories/Script.md` (Mentions in shots)
        - `videospec/assets/*` (References in other assets)
        - `queue/jobs.json` (Pending jobs)

2.  **Propagate (Execution)**:
    - **Rename Files**: If `assets/characters/[oldname].md` exists, rename to `[newname].md`.
    - **Update Content**: Replace `[OldName]` with `[NewName]` in all text files.
    - **Update Links**: Update `![]()` paths.
    - **Update Frontmatter**: Change `id: [oldname]` to `id: [newname]`.

3.  **Regenerate (Recovery)**:
    - List shots that contain the renamed entity.
    - Suggest running: `opsv generate --shots "X,Y,Z"` to reflect the change visually.

## Workflow: Global Style Change
**User Input**: "I changed the visual style in Project.md."

1.  **Audit**:
    - Recognize that `Project.md` affects **ALL** generated images.
2.  **Action**:
    - Do NOT regenerate everything immediately (too expensive).
    - Run **Preview**: `opsv generate --preview` to test the new style on key shots.
    - Ask user to confirm before full regeneration.

## Workflow: Fix Inconsistency
**User Input**: "Run a consistency check."

1.  **Manual Check**:
    - Check if all images referenced in `Script.md` actually exist.
    - Check if all characters mentioned in `Script.md` have a corresponding `assets/characters/` file.
2.  **Report**:
    - Output a list of "Missing Assets" or "Broken Links".

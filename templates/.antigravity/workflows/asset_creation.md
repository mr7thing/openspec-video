---
description: Standard workflow for creating new visual assets
---

# OpsV Workflow: Asset Production (Legacy/Quick)
*(Use `concept_design.md` for major characters)*

1.  **Define**:
    - Create the markdown file (`videospec/assets/characters/[id].md`).
    - Fill in `id`, `name`, and `description`.

2.  **Visualize**:
    - Based on the description, generate a reference image.
    - Save to `videospec/assets/characters/[RefName].png`.

3.  **Link**:
    - Update the markdown file to include `![Reference](./[RefName].png)`.

4.  **Validate**:
    - Ensure the ID matches what is used in `Script.md`.

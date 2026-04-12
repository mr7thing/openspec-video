---
description: Standard workflow for creating new visual assets (v0.5.1)
---

# OpsV Workflow: Asset Production

1.  **Define**:
    - Create the markdown file under `videospec/elements/` (e.g., `character_name.md`).
    - Use Chinese and provide meticulous descriptions inside the file.
    - Reference sheets or character turnarounds can also be defined here.

2.  **Compile & Queue**:
    - Build the Dependency Graph and job queue: `npx opsv parse`

3.  **Visualize**:
    - Execute the image generation directly: `npx opsv gen --model <target_image_model>` (e.g. `seadream_5_0` or `minimax`).
    - The API provider internally handles requesting, polling, and downloading the generated file to `artifacts/sequences/[AssetID]...png`.

4.  **Validate**:
    - Ensure the asset node is marked as ✅ when inspecting the dependency graph output.

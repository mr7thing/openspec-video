---
name: opsv-director
description: Expert in OpenSpec-Video (OpsV) production workflow. creating storyboards, and managing video assets.
---

# OpsV Director Skill

You are an expert Director using the OpenSpec-Video (OpsV) system. Your goal is to translate stories into visual reality.

## Core Capabilities

1.  **Casting & Asset Management**:
    - You know that assets are the single source of truth (`videospec/assets/`).
    - You ensure every character has a `reference_sheet` before shooting.
    - You use Markdown assets (`.md`) for rich descriptions.

2.  **Storyboarding (Shooting)**:
    - You use `opsv generate` to turn the `Script.md` into `jobs.json`.
    - You verify that generated prompts match the "Visual-First" principle.

3.  **Action (Video Generation)**:
    - You orchestrate the video generation process using the generated jobs.

## Workflow: Document-Driven Generation (Agentic Drafting)
When the user asks you to draft a new document (e.g., "Draft a new storyboard from project.md"), you will initiate a Drafting Task.

1.  **Check for Existing Drafts (Resumability)**:
    - ALWAYS check `artifacts/scripts/<type>/` first. 
    - If drafts for this target already exist, ask the user: "I found an existing draft from last time. Shall we continue modifying it, or start fresh?"

2.  **Read Reference Document**:
    - Use `cat` or `read_file` to read the file specified in `--from` (e.g., `project.md` or a character bio).
    - Understand the Core Narrative, Visual Style, and Constraints.
    - Read any other standard files needed (e.g., if target is `shotslist.md`, you MUST read `STORY.md` and `project.md`).

3.  **Generate Variants (Drafting Phase)**:
    - Based on the reference documents, generate the requested number of variants (`<n>`) for the target output.
    - **CRITICAL**: Do NOT write the final markdown files directly.
    - Save each draft to an artifact file: `artifacts/scripts/<type>/<YYYY-MM-DD>-variant-<1..n>.md`. Create directories if they don't exist.

4.  **Step-by-Step Confirmation**:
    - Ask the user: "I have saved ${n} variants for \`${target}\` to the artifacts folder. Which one do you prefer? Or would you like to mix and match elements?"
    - Wait for the user's feedback.

5.  **Finalize & Promote Assets**:
    - Once the user approves a variant, promote it to the exact file path requested in the `--target`.
    - **STRICT NAMING CONVENTION**: You MUST use these exact filenames unless the user overrides you:
        - Project Brief: `videospec/project.md`
        - Story Script: `videospec/stories/STORY.md` (Not story.md, not script.md)
        - Characters: `videospec/assets/characters/<Name>_character.md`
        - Scenes: `videospec/assets/scenes/<Name>_scene.md`
        - Shot Tracker: `videospec/shotslist.md`
    - If the target is `shotslist.md` or `STORY.md` that contains shots, ensure you properly update or populate `shotslist.md` based on it.

5.  **Initialize Shot List (If Story)**:
    - Read `videospec/shotslist.md`.
    - For every shot in the finalized `STORY.md`, add a row to `shotslist.md`.
    - Format: `| **[ShotID]** | [Act] | [Scene] | [Description] | Pending | - |`

## Common Workflows

### 1. The "Shoot" (Generate Jobs)
When asked to "shoot the scene" or "generate storyboard":
1.  Check if `videospec/assets/characters/` and `videospec/assets/scenes/` are populated and have `ref.png` images.
2.  Run `opsv generate` (or `-c`, `-s`, `-S` as needed).
3.  **REPORT & WARN**: Read the console output. Inform the user how many jobs were queued. Crucially, if the console warns about missing assets or missing references, you MUST report these warnings to the user!
4.  **NEXT STEPS**: Tell the user: "Jobs have been generated. Please open your browser to **gemini.google.com** (or your chosen AI generator) and click the OpsV Extension to process the batch."

### 2. The "Cast" (Create Assets)
When asked to "create a character" without a specific background doc:
1.  Create a file `videospec/assets/characters/<name>_character.md` (STRICT NAMING).
2.  Use the standard Frontmatter:
    ```markdown
    ---
    id: "char_name"
    name: "Name"
    ---
    ![Reference](./ref.png)
    # Visual Traits
    ...
    ```

## Troubleshooting
- **"Asset Not Found"**: Check if the ID in `Script.md` matches the `id` in the asset file (not just the filename).
- **"Wrong Look"**: Remind the user to update the `![Reference]` image in the asset markdown.

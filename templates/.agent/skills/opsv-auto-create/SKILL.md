---
name: opsv-auto-create
description: Automatically expand a creative intent (lyrics, concept) into a full OpenSpec-Video project structure (Scripts + Assets).
---

# OpsV Auto-Create Skill

You are the "Creative Engine". You take a high-level concept and explode it into a full production spec.

## Workflow

1.  **Analyze Intent**:
    - Input: Lyrics, Song Meaning, or Plot Outline.
    - Output: Breakdown of Scenes, Characters, and Visual Style.

2.  **Draft Script**:
    - Create `videospec/stories/story.md`.
    - Format: detailed shots `**Shot N**: ...`.

3.  **Define Assets**:
    - Extract every character and scene mentioned in the Script.
    - Create `videospec/elements/[id].md` and `videospec/scenes/[id].md`.
    - **Crucial**: Use `generate_image` tool to create the initial `reference_sheet` for each asset immediately.

4.  **Visualize**:
    - For every asset created, generate an image prompt.
    - Call `generate_image` (or `browser_subagent` if using external AI).
    - Save image to `videospec/assets/...`.
    - Update Markdown to point to this image.

5.  **Final Polish**:
    - Run `opsv generate` to validate the entire package.

## Example User Request
"Create a video for my song 'Neon Rain'. It's about a robot crying in the rain."

## Execution Steps
1.  Write Script: "Shot 1: Close up of Robot (@char_robot) face..."
2.  Create Asset: `char_robot.md`.
3.  Gen Image: "Sad cyberpunk robot face, rain, neon lights".
4.  Link Image: `char_robot.md` -> `![Ref](./robot.png)`.
5.  Done.

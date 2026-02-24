---
description: OpenSpec-Video Director SOP
---

# 🎬 OpenSpec-Video Director's SOP (Phase 9)

**Welcome to the strict OpenSpec-Video Production Pipeline.** This workflow enforces an asset-first, anti-hallucination process to guarantee visual consistency. 

Follow these steps faithfully to go from concept to renderer.

---

### Step 1: Draft the Story Outline
Begin by writing the high-level story outline.
- **Rule**: `videospec/stories/story.md` is ONLY for outlines and asset checklists. **No shot descriptions are allowed here.**
- **Action**: Ask the Agent to "Draft a story outline for [my idea], covering the plot and the main characters we will need."

### Step 2: Establish the Elements (Asset-First)
Before a character or a prop can appear in multiple shots, it MUST be registered.
- **Rule**: Every recurring element (character, prop, costume) must have a dedicated file (e.g., `hero_char.md`, `gun_prop.md`) in `videospec/elements/`.
- **Action**: Ask the Agent to "Create element profiles in `elements/` based on the story outline."

### Step 3: Define the Scenes
Set the stage for your shots.
- **Rule**: Locations go into `videospec/scenes/` as `_scene.md` files.
- **Action**: Ask the Agent: "Create scene descriptions in `scenes/` based on the story."

### Step 4: Break down the Shots
Now, and ONLY now, do you draft the actual shot-by-shot script.
- **Rule**: Shots go into `videospec/shots/` as Markdown documents. 
- **Rule**: Shot paragraphs must start with `**Shot X**: [Location] Description`.
- **Rule**: Use `@` to reference registered elements (e.g., "The @hero picks up the @gun.").
- **Rule**: Cinematic timing must be strict. **3~5 seconds per shot, max 15s.**
- **Action**: Ask the Agent: "Write the shotlist for Act 1 into `shots/shotlist_1.md`. Make sure to use `@` for references."

### Step 5: Compile & Render
Translate your Markdown into JSON rendering jobs for the visual pipeline.
- **Rule**: **The Agent cannot run generative models. You must compile the directory yourself.**
- **Action**: Open your terminal and run the compiler:
    ```bash
    opsv generate
    ```
    This will scan all elements, scenes, and shots, resolve references, and output the final instructions to `queue/jobs.json`.

---

> [!WARNING]
> **Anti-Hallucination Reminder:** If the Agent starts writing `[Shot 1]` blocks inside `story.md`, stop it. Remind the Agent: "Shots belong in `videospec/shots/`. Do not write them in the story outline."

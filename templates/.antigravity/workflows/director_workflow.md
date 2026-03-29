---
description: OpenSpec-Video Director SOP
---

# 馃幀 OpenSpec-Video Director's SOP (Phase 9)

**Welcome to the strict OpenSpec-Video Production Pipeline.** This workflow enforces an asset-first, anti-hallucination process to guarantee visual consistency. 

Follow these steps faithfully to go from concept to renderer.

---

### Step 1: Initialize Project & Draft the Story Outline
Before diving into the story, establishing the overall project context is critical.
- **Rule**: When creating the first draft of the story outline, **always** check if `videospec/project.md` exists. If it does not exist, you must create a standard `project.md` file outlining the project's Name, Context (Logline), and Style (Visual Style defaults to **Cinematic Realism**, Aspect Ratio, Resolution defaults to 2K). User requests override the default.
- **Rule**: `videospec/stories/story.md` is ONLY for outlines and asset checklists. **No shot descriptions are allowed here.**
- **Action**: Ask the Agent to "Initialize the project configurations and draft a story outline for [my idea], covering the plot and the main characters we will need."

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
- **Rule**: Shot paragraphs must start strictly with `**Shot X**: [Location] Description` or `**Shot X (5s)**: [Location] Description`. The Double asterisks `**` and the Colon `:` are mandatory for compiler parsing.
- **Rule**: Use `@` to reference registered elements (e.g., "The @hero picks up the @gun.").
- **Rule**: Cinematic timing must be strict. **3~5 seconds per shot, max 15s.**
- **Action**: Ask the Agent: "Write the shotlist for Act 1 into `shots/shotlist_1.md`. Make sure to use `@` for references."

### Step 5: Compile & Render
1. **Strict Output Formatting**: The OpsV compiler parses your output. It is legally mandated that you use the exact formatting guidelines specified in your Skills. Never rely on the compiler guessing your intent via Regex. Always provide `id:`, `name:`, and `**Shot X:**` syntax properly as outlined in the templates.
2. **Read Document Context**: If generating shots based on `STORY.md`, first read the relevant documents.
3. **Execute Job Generator**: After finalizing assets and shots, run `opsv generate`. Ensure the console output acknowledges all expected jobs.
- **Action**: Open your terminal and run the compiler:
    ```bash
    opsv generate
    ```
    This will scan all elements, scenes, and shots, resolve references, and output the final instructions to `queue/jobs.json`.

---

> [!WARNING]
> **Anti-Hallucination Reminder:** If the Agent starts writing `[Shot 1]` blocks inside `story.md`, stop it. Remind the Agent: "Shots belong in `videospec/shots/`. Do not write them in the story outline."


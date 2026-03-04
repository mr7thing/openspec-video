---
name: opsv-storyboard
description: Expert in generating highly detailed visual prompts for storyboards (Characters, Scenes, Shots), optimized for cinematic consistency and long-form storytelling.
---

# OpsV Storyboard Skill

Use this skill when the user wants to generate visual descriptions (prompts) for shots in a `Script.md`, or when `opsv generate --mode story` needs to analyze a script to create image generation tasks.

## Core Philosophy: "Visual First"
Unlike a screenplay which focuses on dialogue, a storyboard script must focus on **what the camera sees**.
Every shot description must be a potential Midjourney/Stable Diffusion prompt.

## Prompt Structure (The "Cinematic Formula")

For every shot, the prompt should follow this structure:
`[Subject + Action] + [Environment + Lighting] + [Camera Angle + Movement] + [Style Modifiers]`

### Example (Short Video)
> **Script**: "Momo looks up at the moon."
> **Visual Prompt**: "Close-up of Momo, a cute anthropomorphic steamed bun with soft doughy texture, looking up with wide, hopeful eyes. The moonlight reflects in his eyes. Night time, traditional Chinese kitchen roof, dark blue ambient lighting, cinematic lighting, shallow depth of field, 8k resolution, Pixar style."

### Example (Long Video / Complex Scene)
For complex sequences, use **"Anchor & Pivot"**:
1.  **Anchor**: Establish the scene geography first (Master Shot).
2.  **Pivot**: Move the camera relative to the established geography.

## Capabilities

### 1. Script Analysis -> Visual Breakdown
Input: A segment of `Script.md` (e.g., Act 1).
Action:
- Identify **Key Visual Elements** (Characters, Props, Location).
- Break down "beats" into **Shots**.
- Assign **Camera Angles** (Wide, Medium, Close-up, POV).

### 2. Character Consistency Enforcement
- Always prefix character names with their **Visual Tags** (defined in `assets/characters/*.md`).
- Example: Instead of "Momo runs", use "Momo (small white steamed bun character) runs".
- **Reference Injection**: If a character has a reference image, note it: `[Reference: assets/characters/momo_ref.png]`.

### 3. Scene Continuity
- Ensure the background description in Shot 2 matches Shot 1.
- Track **Time of Day** and **Lighting Source**.

## Workflow for Long-Form Content

1.  **Scene Header**: Define the "Global Environment" once at the start of the scene.
    - `[SCENE: Old Kitchen, Night, Moonlit]`
2.  **Shot List** (Mandatory Formatting for OpsV Compiler):
    - **Shot 1 (5s)**: [Wide Shot] Establishing the empty kitchen. Steam rises from the baskets.
    - **Shot 2 (3s)**: [Medium Shot] Pan right to reveal the steamer basket.
    - **Shot 3 (4s)**: [Close-up] Inside the basket, Momo opens his eyes.
3.  **Transition**: note how Shot 3 connects to Shot 4 (e.g., "Cut to", "Match Cut").

## Style Guide (Qinqiang / Pixar Mix)
- **Keywords**: "Stop-motion texture", "Clay material", "Dramatic opera lighting", "Vibrant red and green accents", "Soft global illumination".
- **Avoid**: "Photorealistic human skin", "Generic cartoon", "Flat lighting".

## Instruction
When writing prompts for `opsv generate`:
1.  **Be specific**: "A bun" -> "A soft, white, steaming bun with a determined face".
2.  **Be atmospheric**: "Dark" -> "Shadows cast by the moonlight through the window lattice".
3.  **Be technical**: "Camera moves" -> "Dolly in slow".

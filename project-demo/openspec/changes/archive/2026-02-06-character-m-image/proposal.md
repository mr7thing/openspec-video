# Proposal: Generate Character M Image Asset

## Goal
Generate the visual representation of Character M (The Mysterious Client) to complete her asset definition.

## Context
We defined `assets/characters/M.yaml` which references `assets/characters/m.png`, but the image file does not exist yet. This change will fill that gap.

## Requirements
1.  **AI Generation**: Use `generate_image` tool.
2.  **Visual Consistency**: Match the traits defined in `M.yaml`:
    - Violet eyes.
    - Long black hair.
    - Midnight blue silk gown.
    - Neural lace on neck.
    - Cyberpunk/Noir aesthetic.
3.  **Output**: Save as `assets/characters/m.png`.

## Impact
- **New Files**: `assets/characters/m.png`
- **User Experience**: Visual confirmation of the character design.

# Proposal: Story-First Video Production Workflow
**Date**: 2026-02-06
**Status**: Draft

## Summary
Refine the `opsv` workflow to prioritize **Story** integrity. Assets (Characters/Locations) are derived *from* the script, properly visualized, and then used for consistency in storyboards.

## Core Philosophy
**"Story defines Character. Character defines Image."**

## New Standard Workflow (The 7-Step Loop)

1.  **Project Init**: `opsv init`
2.  **Story Scripting** (Text):
    - Write the narrative in `videospec/stories/Script.md`.
    - Focus on plot, dialogue, and beats. *No image refs yet.*
3.  **Asset Definition** (Text Extraction):
    - Identify characters and locations needed for the script.
    - Create YAML definitions (`assets/characters/*.yaml`) with *textual descriptions*.
4.  **Asset Visualization** (Batch Generation):
    - **New Step**: Run `opsv cast` (or similar workflow).
    - Agent uses Gemini/Midjourney to generate multiple options for each character/location based on text descriptions.
    - Output: `assets/candidates/`.
5.  **Review & Fix** (Casting Director):
    - User selects the best images.
    - Updates YAML `reference_sheet` paths to the chosen images.
    - *Milestone*: Visual Style Locked.
6.  **Storyboard Design** (Shot List):
    - Refine `Script.md` into specific shots (`**Shot 1**: ...`).
    - Reference the locked assets (`[char_k]`).
7.  **Storyboard Generation** (Production):
    - Run `opsv shoot`.
    - Agent uses Nano Banana Pro + ControlNet/IP-Adapter to generate consistent keyframes using the locked assets.

## Implementation Impact
- **Docs**: Rewrite Manual to reflect Story -> Asset -> consistent-Shot flow.
- **CLI**: Future need for `opsv cast` command to automate asset batch generation.

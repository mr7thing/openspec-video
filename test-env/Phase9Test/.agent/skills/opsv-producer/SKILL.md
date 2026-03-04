---
description: Skill for producing, previewing, and managing OpenSpec video projects
---
# OpenSpec Producer Skill

## Preview Generation (Draft Mode)
When the user asks to "Preview the story" or "Generate preview shots":

1.  **Analyze Script & Shot List**: 
    - Read `videospec/shotslist.md` (if available) to see what is `Pending` vs `Draft`.
    - Read `videospec/stories/Script.md`.
    - Identify 3-5 key shots that represent the visual style.
    - Look for the first shot of each Act.
    - Look for visually distinct locations.

2.  **Construct Command**:
    - Build a comma-separated list of Shot IDs (e.g. `1,5,12`).
    - Run: `opsv generate --shots "1,5,12"`

3.  **Confirm**: 
    - Tell the user which shots were selected and why.
    - Example: "I've selected Shot 1 (Act 1 Intro), Shot 5 (Kitchen Reveal), and Shot 12 (Dream Sequence) for preview."

## Full Generation
When the user asks to "Generate the full video" or "Render everything":

1.  **Check Status**: 
    - Read `videospec/shotslist.md`.
    - Identify all shots with status `Pending`.
2.  **Run Command**: 
    - If specific shots needed: `opsv generate --shots "ID_LIST"`.
    - Or run `opsv generate` (generates all, but smart generator might skip existing? Currently CLI generates all matching filter).
    - **Recommended**: Use `opsv generate --shots` with the list of pending IDs to save credits.
3.  **Launch Daemon**: Ensure the background service is running if needed (`opsv serve`).

## Review Process
When asked to "Review generated content":

1.  **Run Interactive Review**: `opsv review <type>` (characters, scenes, story).
2.  **Process Feedback**: If user leaves feedback, read `videospec/changes/YYYY-MM-DD-Review-Feedback.md` and propose subsequent actions.

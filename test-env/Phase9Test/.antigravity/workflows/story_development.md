---
description: Workflow for iterative story development and script writing
---

# OpsV Workflow: Story Development

## 1. Concept Generation (Brainstorming)
**Goal**: Generate multiple story concepts based on initial intent.

1.  **Input**: User provides a core idea or theme.
2.  **Agent Action**: 
    - Generate 3 distinct story concepts (Loglines + Synopses).
    - Format as a proposal list in `videospec/stories/concepts.md`.
3.  **User Action**: Select one concept or mix elements.

## 2. Script Drafting
**Goal**: Flesh out the selected concept into a full script.

1.  **Select**: User marks selected concept in `concepts.md`.
2.  **Agent Action**: 
    - Write a full script for the selected concept.
    - Save to `videospec/stories/Script_Draft_v1.md`.
3.  **Iterate**: 
    - User provides feedback.
    - Agent generates `Script_Draft_v2.md`.

## 3. Finalization
**Goal**: Lock the script for production.

1.  **Approve**: User renames final draft to `videospec/stories/Script.md`.
2.  **Validate**: Ensure all roles and scenes are identified (placeholders allowed).

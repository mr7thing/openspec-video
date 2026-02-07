---
description: Workflow for concept-first character design and group visualization
---

# OpsV Workflow: Concept Design

## 1. Character Setting (Text)
**Goal**: Define character personalities and roles before visuals.

1.  **Analyze**: Agent reads `Script.md`.
2.  **Propose**: Agent generates character profiles (Name, Role, Personality, Visual Style) in `videospec/assets/characters/casting_call.md`.
3.  **Review**: User edits/confirms profiles.

## 2. Group Visualization (Concept Art)
**Goal**: Establish visual style and relationships using group shots.

1.  **Group**: Agent groups characters (e.g., "Protagonists", "Villains", "Background").
2.  **Visualize**: 
    - Generate **ONE image per group** containing all members.
    - Focus: Art style, relative scale, color palette harmony.
    - Save to `videospec/assets/concepts/group_[name].png`.
3.  **Iterate**: User provides feedback (e.g., "Make style darker", "Hero too short").

## 3. Character Reference Sheets (Finalization)
**Goal**: Generate production-ready 3-view sheets for individual characters.

1.  **Approve**: User confirms group style.
2.  **Generate**: 
    - For each character, generate a **3-View Reference Sheet** (Front, Side, Back + Expression).
    - Use the style established in the Group Shot.
    - Save to `videospec/assets/characters/[id]_sheet.png`.
3.  **Link**: Update `videospec/assets/characters/[id].md` with the reference sheet.

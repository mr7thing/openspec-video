---
description: Workflow for scene preview and batch generation
---

# OpsV Workflow: Scene Development

## 1. Scene Extraction
**Goal**: Identify all unique locations from `Script.md`.

1.  **Analyze**: Agent lists all scenes in `videospec/assets/scenes/location_scout.md`.
2.  **Detail**: Agent creates initial visual descriptions for each.

## 2. Style Frames (Draft)
**Goal**: Confirm the look and feel of key locations.

1.  **Select**: Identify 1-3 "Hero Locations" (most important scenes).
2.  **Draft**: Generate low-res or concept sketches for Hero Locations.
3.  **Review**: User confirms lighting, mood, and architecture.

## 3. Batch Production
**Goal**: Generate high-quality assets for all scenes.

1.  **Refine**: Apply the approved style to all scene descriptions.
2.  **Generate**: Batch generate final images for `videospec/assets/scenes/[id].png`.
3.  **Link**: Create/Update `videospec/assets/scenes/[id].md`.


---
name: opsv-new
description: Initialize a new video project or create new video assets (stories, characters, scenes).
---

# OpsV New Skill

Use this skill to create new entities in the OpenSpec-Video system.

## Capabilities

### 1. New Project
- **Command**: `opsv init <ProjectName>`
- **Action**: Creates a folders structure standard compliant with OpenSpec-Video.

### 2. New Story
- **Action**: Create a new file in `videospec/stories/<StoryName>.md`.
- **Template**:
  ```markdown
  # <Story Title>
  
  ## Act 1
  **Shot 1**: [character_id] does something in [scene_id].
  ```

### 3. New Asset (Character/Scene)
- **Action**: Create a new Markdown file in `videospec/assets/characters/` or `videospec/assets/scenes/`.
- **Template**:
  ```markdown
  ---
  id: "unique_id"
  name: "Display Name"
  ---
  ![Reference](./ref.png)
  # Description
  Detailed visual description...
  ```

## Workflows

1.  **Ask User**: What do you want to create? (Project, Story, Character, Scene)
2.  **Execute**:
    - For Project: Run CLI.
    - For others: Create the file directly using `write_to_file`.
3.  **Verify**: Check file existence.

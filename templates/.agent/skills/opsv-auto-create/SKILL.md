---
name: opsv-auto-create
description: 全自动创建执行手册。定义从歌词或概念展开完整项目结构的一次性批处理流程：故事、资产定义与初始化项目福架。
---

# OpsV Auto-Create — 执行手册 (0.3.2)

本手册定义了 `AutoCreate Agent` 将高层创昐意图一次性展开为完整项目规范的序列化执行流程。

> **定位说明**：本手册是快速展开工具，适合从零开始创建项目。对于需要精细调控每个阶段的项目，应优先调用 `opsv-architect` + `opsv-screenwriter` + `opsv-asset-designer` 逐步过渡。

## Workflow

1.  **Analyze Intent**:
    - Input: Lyrics, Song Meaning, or Plot Outline.
    - Output: Breakdown of Scenes, Characters, and Visual Style.

2.  **Draft Script**:
    - Create `videospec/stories/story.md`.
    - Format: detailed shots `**Shot N**: ...`.

3.  **Define Assets**:
    - Extract every character and scene mentioned in the Script.
    - Create `videospec/elements/[id].md` and `videospec/scenes/[id].md`.
    - **Crucial**: Use `generate_image` tool to create the initial `reference_sheet` for each asset immediately.

4.  **Visualize**:
    - For every asset created, generate an image prompt.
    - Call `generate_image` (or `browser_subagent` if using external AI).
    - Save image to `videospec/assets/...`.
    - Update Markdown to point to this image.

5.  **Final Polish**:
    - Run `opsv generate` to validate the entire package.

## Example User Request
"Create a video for my song 'Neon Rain'. It's about a robot crying in the rain."

## Execution Steps
1.  Write Script: "Shot 1: Close up of Robot (@char_robot) face..."
2.  Create Asset: `char_robot.md`.
3.  Gen Image: "Sad cyberpunk robot face, rain, neon lights".
4.  Link Image: `char_robot.md` -> `![Ref](./robot.png)`.
5.  Done.

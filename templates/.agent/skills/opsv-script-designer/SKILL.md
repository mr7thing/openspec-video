---
name: opsv-script-designer
description: 分镜脚本设计执行手册。将故事大纲翻译成带 YAML 结构的 Script.md 文件，包含严格时长约束（3-15s）与画廊占位符模板，供 ScriptDesigner Agent 调用。
---

# OpsV Script Designer — 执行手册 (0.3.2)

本手册定义了 `ScriptDesigner Agent` 在 OpenSpec-Video 架构下生成 `videospec/shots/Script.md` 的完整执行规范。输入为 `story.md`，输出为 YAML 驱动的编译就绪分镜脚本。

## 核心准则 (0.3.2)

**规则 1：时间是绝对约束。** 每个 Shot 必须有明确的 `duration`。单镜头理想 3-5 秒，**上限为 15 秒**。超过 15 秒必须拆成多个 Shot。
**规则 2：视觉语言，非文字叙事。** 要描述的是「摄像机看到的内容」：机位、运动、主体动作、光影。
**规则 3：YAML 优先（强制铁律）。** **必须**将所有 Shot 定义在文档 frontmatter 的 `shots:` YAML 数组中。Markdown 正文仅供人类阅读审阅，编译器完全忽略正文。
**规则 4：双语分离输出。** YAML 字段（`camera`, `environment`, `subject`）与 Markdown 正文使用**中文**；`prompt_en` 字段使用**纯英文**（供扩散模型如 SD/Flux 使用）。

## Workflow Execution

When the user asks you to cut shots or create a storyboard based on a story:

### Phase 1: Context Acquisition
Read `videospec/project.md` to grasp the global style and aspect ratio.
Read `videospec/stories/[StoryName].md` to get the narrative beats.

### Phase 2: The `<thinking>` Constraint
Before generating the file, output a `<thinking>` block:
```xml
<thinking>
1. Source Material: The user wants to convert [Act X/The Story] into shots.
2. Timing Budget: Act 1 has 3 major events. I need to break this into visual moments: Shot 1 (4s), Shot 2 (3s), Shot 3 (3s). Total: 10s.
3. Entities: I must carry over all `@` tags mentioned in the story into both the YAML and the Body.
4. Prompt Formulation: For each shot, I will translate the visual action into a dense English prompt (`prompt_en`) suitable for ComfyUI.
</thinking>
```

### Phase 3: Generation
Use `write_to_file` to create/append to a `.md` file inside `videospec/shots/`.
**CRITICAL**: You must strictly follow the format shown in `references/example-script.md`.

**0.3.2 增强：自动链接化与画廊模板**：
- 当你在 Markdown Body 中提到 `@role_K` 时，**必须**尝试将其写成 `[@role_K](../videospec/elements/role_K.md)`。
- 为每个 Shot 预留一个 HTML 或 Markdown 画廊区域，方便 `opsv review` 回写图片链接。

### Phase 4: Intent Sync (0.3.2)
在你编辑完 `Script.md` 供导演审阅后，如果你需要修改 `Shotlist.md` 的技术执行参数，你必须确保它指向导演在 `Script.md` 中通过 review 工具确定的最新图片路径。

## Formatting Rules for Shots (YAML Array)

1. The file MUST begin with frontmatter containing a `shots:` array.
2. Every item in the `shots:` array MUST have the following keys:
   - `id`: e.g., "shot_1"
   - `duration`: integer (seconds)
   - `camera`: string (e.g., "Wide shot, pan down" - 中文或单侧英文均可)
   - `environment`: string (背景描述，保留 `@` 实体)
   - `subject`: string (主体动作，保留 `@` 实体)
   - `prompt_en`: string (**纯英文**密集的生图提示词)

3. Below the frontmatter (`---`), you can generate the Markdown body for the director to read, grouping shots under Acts (e.g., `## Act 1`). The compiler will ignore the Markdown body, but the director relies on it for review.

## Reference Alignment
Always cross-reference the exact markdown structure found in your local `references/example-script.md` file before generating.

## 0.3.1 新增：关键帧塌缩协议 (Keyframe Resolution Protocol)

在 OpsV 0.3.1 中，分镜表新增了以下 YAML 可选字段，你必须在适当时机主动使用它们：

### 新增可选的 YAML 字段

| 字段                 | 类型   | 说明                                                    |
| -------------------- | ------ | ------------------------------------------------------- |
| `first_image`        | string | 首帧参考图的路径，或者 `@FRAME:<shot_id>_last` 延迟指针 |
| `middle_image`       | string | 中间帧参考图路径（备用）                                |
| `last_image`         | string | 尾帧参考图路径                                          |
| `target_last_prompt` | string | 靶向诱饵词，系统自动为此生成 `<shot_id>_last` 图像任务  |
| `motion_prompt_zh`   | string | 中文动作描述（供人类核对或 LLM 分析）                   |
| `motion_prompt_en`   | string | 英文 API 唯一动作指令（给底层视频大模型识别）           |

### 长镜头继承规则

当叙事需要连续运动的长镜头效果时，**后续 Shot 的 `first_image` 必须写为 `@FRAME:<前一个shot_id>_last`**，而非重复指定一张独立图片。底层执行器会在前一个视频渲染完成后用 FFmpeg 自动截取真实尾帧作为下一个镜头的首帧。

```yaml
  - shot: 5
    duration: 5s
    first_image: "artifacts/drafts_2/corridor.png"
    motion_prompt_en: "Tracking shot following subject down corridor."

  - shot: 6
    duration: 5s
    first_image: "@FRAME:shot_5_last"
    motion_prompt_en: "Subject reaches door, pushes it open. Light floods in."
```

### 断点修复规则

如果某个 Shot 内部发生剧烈变化（如180度旋转、角色状态突变），你需要主动为该 Shot 预写 `target_last_prompt`。系统会自动将其转化为一个补帧图像生成任务，命名为 `<shot_id>_last`。

```yaml
  - shot: 7
    duration: 8s
    first_image: "artifacts/drafts_2/shot_7.png"
    motion_prompt_en: "Camera orbits around subject 180 degrees."
    target_last_prompt: "从主角背后拍摄的电影级构图，敌人举枪对峙，昏暗霓虹灯光"
```
## 0.3.2 新增：视觉审阅与画廊规范

为了让导演拥有直观的视觉审阅体验，你在生成 `Script.md` 的 Markdown Body 时应遵循以下布局：

```markdown
## Shot [序号] ([时长]s)
[这里是视觉动作描述，实体如 [@角色名](../videospec/elements/角色名.md) 需链接化]

### 🖼️ 视觉审阅廊
| 画面 1 | 画面 2 |
|:---:|:---:|
| (等待 opsv review 回写) | (等待 opsv review 回写) |

### 🎯 定向补帧
| 目标尾帧候选 |
|:---:|
| (等待 opsv review 回写) |
```

### 延迟绑定原则
生成的图片统一命名为 `shot_X_draft_N`。**你（Shot Designer）不负责最终锁定哪张图是首帧**。你的任务是提供足够多的候选（Drafts），并引导导演在 `Script.md` 中进行批注。

---
name: microlesson-pipeline
description: 微课制作管线导航 — 从课程大纲到最终视频的完整 6 阶段流程。协调 lesson-planner → ppt-organizer → digital-human-planner → digital-human-generator → remotion-compiler → remotion-renderer。
---

# 微课制作管线 (Micro-lesson Pipeline)

> **定位**: 本技能包的总入口，提供完整的微课制作流程导航
> **适用场景**: 将课程大纲 + PPT + 语音稿 → 带数字人讲解的微课视频

## 管线概览

```
课程大纲 (markdown)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    S0: lesson-planner                       │
│  拆解课程结构 → 定义课时/讲/页 → 规划数字人触发点           │
│  产出: lessons/{id}/metadata.md                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    S1: ppt-organizer                        │
│  组织PPT图片 + 语音稿 → 生成 slide 元数据                   │
│  产出: lessons/{id}/slides/{slide_id}.md                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  S2: digital-human-planner                  │
│  规划数字人生成队列 + 背景裁剪策略                           │
│  产出: lessons/{id}/dh_plan.md                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                S3: digital-human-generator                  │
│  通过 LTX2.3 ComfyUI 工作流生成数字人视频                   │
│  产出: lessons/{id}/assets/dh_{slide_id}.mp4                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 S4: remotion-compiler                       │
│  编译 Remotion React 组件，编排场景切换和动画               │
│  产出: lessons/{id}/remotion/index.tsx                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                S5: remotion-renderer                        │
│  渲染最终微课视频                                            │
│  产出: output/{lesson_id}.mp4                               │
└─────────────────────────────────────────────────────────────┘
```

## 使用方式

### 方式一：完整管线（推荐）

```bash
# 一键完成所有阶段
opsv run --pack microlesson-pack --stage S0-S5 \
  --course "Python入门教程" \
  --ppt-dir ./ppt-images \
  --transcripts-dir ./transcripts \
  --character-photo ./character.png \
  --background ./bg.png
```

### 方式二：分阶段执行

```bash
# S0: 课程拆解
opsv run --pack microlesson-pack --stage S0 \
  --course "Python入门教程"

# S1: PPT组织
opsv run --pack microlesson-pack --stage S1 \
  --lesson lesson-01

# S2: 数字人规划
opsv run --pack microlesson-pack --stage S2 \
  --lesson lesson-01

# S3: 数字人生成
opsv run --pack microlesson-pack --stage S3 \
  --lesson lesson-01

# S4: Remotion编排
opsv run --pack microlesson-pack --stage S4 \
  --lesson lesson-01

# S5: Remotion渲染
opsv run --pack microlesson-pack --stage S5 \
  --lesson lesson-01
```

### 方式三：单课批量处理

```bash
# 处理多课（lesson-01 到 lesson-10）
opsv run --pack microlesson-pack --batch lessons/01-10
```

## 前置准备

在使用本管线前，需要准备以下素材：

| 素材 | 格式 | 说明 |
|------|------|------|
| 课程大纲 | markdown | 包含课程名、课时数、每课主题 |
| PPT 图片 | png/jpg/webp | 按 `lesson-{课号}-slide-{讲号}-{页号}.png` 命名 |
| 语音稿 | markdown | 每页一个文件，放在 `transcripts/` 目录 |
| 角色照片 | png/jpg | 数字人的角色形象（一张即可） |
| 背景图 | png/jpg | 微课的整体背景 |
| RunningHub API Key | 环境变量 | `export RUNNINGHUB_API_KEY=your_key` |

## 输出结构

```
videospec/
└── lessons/
    └── lesson-01/
        ├── metadata.md           # S0 产出
        ├── slides/               # S1 产出
        │   ├── slide-01-01.md
        │   ├── slide-01-02.md
        │   └── ...
        ├── transcripts/          # 用户提供
        │   ├── slide-01-01.md
        │   └── ...
        ├── dh_plan.md            # S2 产出
        ├── assets/               # S3 产出
        │   ├── dh_slide-01-01.mp4
        │   ├── dh_slide-01-04.mp4
        │   ├── bg.png
        │   ├── bg_center.png
        │   └── bg_right.png
        ├── remotion/             # S4 产出
        │   └── index.tsx
        └── output.mp4            # S5 产出
```

## 与其他 Pack 的协作

| 协作方 | 用途 | 方式 |
|--------|------|------|
| multi-ref-pack | 生成角色多视图、背景图 | 先用 multi-ref-pack 设计角色/背景，再导入本 pack |
| frameproduction-pack | ComfyUI 工作流管理 | 本 pack 使用自己的 LTX2.3 工作流，但可参考其管理方式 |

## 关键参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `resolution` | 视频分辨率 | [1920, 1080] |
| `fps` | 帧率 | 30 |
| `dh_intro_duration` | 开场数字人时长（帧） | 300 |
| `dh_highlight_duration` | 强调数字人时长（帧） | 150 |
| `dh_outro_duration` | 谢幕数字人时长（帧） | 300 |
| `slide_default_duration` | 默认幻灯片停留时长（帧） | 180 |
| `transition_duration` | 场景切换过渡时长（帧） | 15 |

## 注意事项

1. **LTX2.3 时长限制**: 单次数字人生成通常 5-10 秒（150-300 帧）。如果语音稿更长，需要拆分或循环。

2. **背景一致性**: 数字人生成的背景必须与 Remotion 中使用的背景完全一致。

3. **角色一致性**: 整个课程使用同一张角色照片，确保数字人外观一致。

4. **TTS 质量**: 推荐使用高质量的 TTS 引擎（如 Qwen3 TTS），确保语音自然流畅。

5. **Remotion 调试**: 生成 Remotion 组件后，先用 `remotion studio` 预览，确认无误后再正式渲染。

---
name: lesson-planner
description: 课程剧本拆解 — 从课程大纲生成结构化 lesson metadata，定义课时/讲/页层级结构、数字人触发点规划、PPT 命名规范。
---

# 课程剧本拆解 (Lesson Planner)

> **阶段**: S0 · 课程拆解
> **输入**: 课程大纲 markdown（包含课程名、课时数、每课主题）
> **产出**: `videospec/lessons/{lesson_id}/metadata.md`
> **验收**: `opsv validate --dir videospec --category course_plan`

---

## 1. 职责边界

**你做**：
- 解析课程大纲，确定课程结构（课 → 讲 → 页）
- 为每个 lesson 生成 metadata.md
- 初步规划数字人触发点（intro/highlight/outro）
- 定义 PPT 图片命名规范
- 设置分辨率、FPS 等视频参数

**你不做**：
- 处理具体的 PPT 图片（那是 S1 ppt-organizer 的事）
- 生成具体的语音稿（由用户提供，S1 消费）
- 生成数字人视频（那是 S3 的事）
- 编写 Remotion 代码（那是 S4 的事）

---

## 2. 触发条件

- 用户提供课程大纲（markdown 格式）
- 课程大纲包含：课程名称、课时数量、每课主题、每课大致页数

---

## 3. 工作流程

```
课程大纲 (markdown)
      │
      ▼
┌──────────────────────────────────────┐
│ Step 1: 解析课程结构                  │
│   - 提取课程名称                      │
│   - 确定总课时数                      │
│   - 每课的讲数和页数                  │
│   - 识别关键转折点（需要数字人出现）  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: 规划数字人触发点              │
│   - 每课第一讲第一页 → intro          │
│   - 每课中间随机触发 → highlight      │
│   - 每课最后一页 → outro              │
│   - 触发频率建议：每 3-5 页一次       │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 3: 生成 metadata.md              │
│   - 课程元数据                        │
│   - 课时结构表                        │
│   - 数字人触发计划                    │
│   - PPT 命名规范                      │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 4: 创建目录结构                  │
│   - lessons/{lesson_id}/              │
│   - lessons/{lesson_id}/slides/       │
│   - lessons/{lesson_id}/transcripts/  │
│   - lessons/{lesson_id}/assets/       │
└──────────────────────────────────────┘
```

---

## 4. 输出格式

生成 `videospec/lessons/{lesson_id}/metadata.md`：

```yaml
---
status: draft
id: lesson-01
title: "{课程名称}"
lesson_number: {课号}
total_slides: {总页数}
slides_per_lecture: {每讲页数}
digital_human_roles:
  character_photo: assets/character.png
  background: assets/bg.png
  resolution: [1920, 1080]
  fps: 30
---

# {课程名称}

## 课程结构

| 讲号 | 标题 | 页数 | 数字人触发 |
|------|------|------|-----------|
| 01 | {讲1标题} | {N} | intro, highlight |
| 02 | {讲2标题} | {N} | highlight |
| ... | ... | ... | ... |
| 0{N} | {总结} | {N} | outro |

## PPT 命名规范

格式：`lesson-{课号}-slide-{讲号}-{页号}.png`

示例：
- `lesson-01-slide-01-01.png` = 第一课第一讲第一页
- `lesson-01-slide-01-02.png` = 第一课第一讲第二页
- `lesson-01-slide-02-01.png` = 第一课第二讲第一页

## 数字人触发计划

- **Intro**: 每课第一讲第一页，数字人居中，时长约 10 秒
- **Highlight**: 每课中间随机触发（建议每 3-5 页），数字人居右，时长约 5-8 秒
- **Outro**: 每课最后一页，数字人居中，时长约 10 秒

## 视频参数

- 分辨率: 1920×1080
- FPS: 30
- 总时长预估: {总页数 × 平均每秒数} 秒
```

---

## 5. 数字人触发点规划规则

### 5.1 Intro（开场）
- **何时**: 每课的第一讲第一页
- **位置**: center（画面中央）
- **时长**: 约 10 秒（300 帧）
- **内容**: "欢迎来到第 X 课，今天我们将学习..."

### 5.2 Highlight（强调）
- **何时**: 每课中间，建议每隔 3-5 页触发一次
- **位置**: right（画面右侧 1/4 区域）
- **时长**: 约 5-8 秒（150-240 帧）
- **内容**: 对当前页重点内容进行口头强调

### 5.3 Outro（谢幕）
- **何时**: 每课的最后一页
- **位置**: center（画面中央）
- **时长**: 约 10 秒（300 帧）
- **内容**: "本节内容到此结束，下节课见..."

### 5.4 示例：25 页课程的触发规划

```
slide-01-01: intro (center, 300fps)     ← 开场
slide-01-02: none                        ← 聚焦PPT
slide-01-03: none
slide-01-04: highlight (right, 180fps)  ← 随机触发
slide-01-05: none
slide-01-06: none
slide-01-07: highlight (right, 150fps)  ← 随机触发
...
slide-01-25: outro (center, 300fps)     ← 谢幕
```

---

## 6. 注意事项

1. **数字人触发频率**: 不宜过密（每页都有会分散注意力），也不宜过疏（整课没数字人会单调）。建议每课 3-5 次触发。

2. **Intro/Outro 与 Highlight 的区别**: Intro 和 Outro 数字人居中且时长较长（~10秒），Highlight 数字人居右且时长较短（~5秒）。

3. **PPT 命名**: 必须严格遵循 `lesson-{课号}-slide-{讲号}-{页号}` 格式，便于后续技能消费。

4. **背景图**: 在 metadata 中预留 `background` 字段，实际背景图由用户在 assets/ 目录放置。

5. **角色照片**: 在 metadata 中预留 `character_photo` 字段，实际照片由用户在 assets/ 目录放置。

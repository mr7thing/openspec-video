---
name: ppt-organizer
description: PPT素材组织 — 将用户的PPT图片和语音稿整理为结构化 slide 元数据，建立课-讲-页三级索引。
---

# PPT 素材组织 (PPT Organizer)

> **阶段**: S1 · PPT 素材组织
> **输入**: S0 metadata.md + PPT 图片目录 + 语音稿 markdown
> **产出**: `videospec/lessons/{lesson_id}/slides/{slide_id}.md`
> **验收**: `opsv validate --dir videospec --category slide`

---

## 1. 职责边界

**你做**：
- 扫描 PPT 图片目录，按命名规范建立索引
- 读取每页对应的语音稿 markdown
- 生成每个 slide 的元数据文件
- 关联 `digital_human_trigger` 标记（从 S0 metadata 继承）
- 验证 PPT 图片与语音稿的一一对应关系

**你不做**：
- 生成 PPT 图片（用户提供）
- 生成语音稿（用户提供）
- 生成数字人视频（那是 S2/S3 的事）
- 编写 Remotion 代码（那是 S4 的事）

---

## 2. 触发条件

- S0 metadata.md 已 `approved`
- 用户提供 PPT 图片（按 `lesson-{课号}-slide-{讲号}-{页号}.png` 命名）
- 用户提供语音稿（markdown 格式，每页一个文件）

---

## 3. 工作流程

```
S0 metadata.md + PPT图片目录 + 语音稿markdown
         │
         ▼
┌──────────────────────────────────────┐
│ Step 1: 扫描 PPT 图片                 │
│   - 按命名规范解析 lesson/slide/页号  │
│   - 建立图片到 slide_id 的映射        │
│   - 检测缺失或重复的编号              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: 读取语音稿                    │
│   - 每个 slide 对应一个 transcript.md │
│   - 提取语音稿文本作为 prompt 基础    │
│   - 验证语音稿完整性                  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 3: 生成 slide 元数据             │
│   - 为每个 PPT 图片生成 .md           │
│   - 关联 image 路径 + transcript 路径 │
│   - 继承 S0 的 digital_human_trigger  │
│   - 设置 Remotion 动画配置            │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 4: 验证完整性                    │
│   - PPT 图片数量 = slide 元数据数量   │
│   - 语音稿数量 = slide 元数据数量     │
│   - 每个 slide 都有对应的 trigger 标记│
└──────────────────────────────────────┘
```

---

## 4. 输入约定

### 4.1 PPT 图片命名

必须遵循 S0 定义的命名规范：
```
lesson-{课号}-slide-{讲号}-{页号}.png
```
示例：
```
assets/slides/lesson-01-slide-01-01.png
assets/slides/lesson-01-slide-01-02.png
assets/slides/lesson-01-slide-02-01.png
...
```

### 4.2 语音稿格式

每个 slide 一个 markdown 文件，放在 `transcripts/` 目录：
```
transcripts/slide-01-01.md
transcripts/slide-01-02.md
...
```

语音稿内容示例 (`slide-01-01.md`)：
```markdown
# 第一课第一讲第一页语音稿

欢迎来到第一课，今天我们开始学习 Python 编程。

Python 是一门广泛使用的高级编程语言...
（此处为完整的语音稿文本）
```

### 4.3 从 S0 继承的触发信息

S0 metadata.md 中已定义了每个 slide 的 `digital_human_trigger`：
- `intro` — 开场，数字人居中
- `highlight` — 强调，数字人居右
- `outro` — 谢幕，数字人居中
- `none` — 无数字人，PPT 全屏

---

## 5. 输出格式

生成 `videospec/lessons/{lesson_id}/slides/{slide_id}.md`：

```yaml
---
status: draft
id: slide-01-01
lesson_id: lesson-01
lecture_number: 1
slide_number: 1
total_slides_in_lecture: 5
image: ../../assets/slides/lesson-01-slide-01-01.png
transcript: ../../transcripts/slide-01-01.md
digital_human_trigger: intro
dh_position: center
duration_frames: 300
---

# Slide 01-01: {PPT 标题}

## 语音稿摘要

{从 transcript 中提取的前 50 字作为摘要}

## Remotion 动画配置

- transition: fade-in
- slide_animate: zoom-in
- bg_opacity: 1.0
- slide_duration: {duration_frames} frames
```

---

## 6. 验证规则

1. **完整性**: 每个 PPT 图片都必须有对应的 slide 元数据和语音稿
2. **命名一致性**: slide_id 必须与 PPT 图片命名中的课号/讲号/页号一致
3. **触发标记**: 每个 slide 必须有 `digital_human_trigger` 值（从 S0 继承）
4. **路径正确性**: `image` 和 `transcript` 字段的路径必须相对正确

---

## 7. 注意事项

1. **语音稿长度**: 语音稿决定数字人视频的时长。如果语音稿超过 30 秒，考虑拆分到多页 PPT。

2. **PPT 图片格式**: 支持 PNG、JPG、WEBP。建议统一为 PNG 以保证质量。

3. **缺失处理**: 如果发现某个 slide 缺少图片或语音稿，在 metadata 中标记为 `missing` 并列出清单。

4. **dh_position 继承**: 从 S0 metadata 继承触发类型后，自动映射为位置：
   - `intro` → `center`
   - `highlight` → `right`
   - `outro` → `center`
   - `none` → `null`

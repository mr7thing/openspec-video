---
name: digital-human-planner
description: 数字人规划 — 从 slides 元数据中提取需要数字人的页面，规划生成队列、背景裁剪策略、音频驱动顺序。
---

# 数字人规划 (Digital Human Planner)

> **阶段**: S2 · 数字人规划
> **输入**: S1 slides 元数据（带 `digital_human_trigger` 标记）
> **产出**: `videospec/lessons/{lesson_id}/dh_plan.md`
> **验收**: `opsv validate --dir videospec --category dh_plan`

---

## 1. 职责边界

**你做**：
- 扫描所有 slides，筛选出 `digital_human_trigger != none` 的页面
- 生成 dh_plan.md，列出数字人生成队列
- 规划背景裁剪策略（根据 dh_position）
- 确定音频驱动文件的来源和顺序
- 为每个需要数字人的 slide 生成生成任务配置

**你不做**：
- 实际生成数字人视频（那是 S3 digital-human-generator 的事）
- 生成语音稿（S1 已消费）
- 编写 Remotion 代码（那是 S4 的事）

---

## 2. 触发条件

- S1 slides 全部 `approved`
- 每个 slide 都有 `digital_human_trigger` 字段

---

## 3. 工作流程

```
S1 slides 元数据
      │
      ▼
┌──────────────────────────────────────┐
│ Step 1: 筛选数字人触发页面            │
│   - 找出所有 trigger != none 的 slide │
│   - 按 lesson_id + lecture_number    │
│     + slide_number 排序              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: 分组规划                      │
│   - 按触发类型分组 (intro/highlight)  │
│   - 确定每组的生成顺序                │
│   - intro/outro 优先（最长，耗时最多）│
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 3: 背景裁剪策略                  │
│   - center 位置: 原图居中裁剪         │
│   - right 位置: 偏左裁剪              │
│   - 输出裁剪后的背景图路径            │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 4: 生成 dh_plan.md               │
│   - 触发列表                          │
│   - 背景配置                          │
│   - 生成队列                          │
│   - 每个任务的参数配置                │
└──────────────────────────────────────┘
```

---

## 4. 输出格式

生成 `videospec/lessons/{lesson_id}/dh_plan.md`：

```yaml
---
status: draft
id: dh-plan-{lesson_id}
lesson_id: {lesson_id}
---

# 数字人规划 - {课程名称}

## 触发列表

| Slide | 触发类型 | 位置 | 时长(帧) | 语音稿 |
|-------|---------|------|---------|--------|
| slide-01-01 | intro | center | 300 | ../transcripts/slide-01-01.md |
| slide-01-04 | highlight | right | 180 | ../transcripts/slide-01-04.md |
| slide-01-08 | highlight | right | 150 | ../transcripts/slide-01-08.md |
| slide-01-15 | outro | center | 300 | ../transcripts/slide-01-15.md |

## 背景配置

- background_image: assets/bg.png
- character_photo: assets/character.png
- resolution: [1920, 1080]

## 背景裁剪策略

| 位置 | 裁剪方式 | 输出路径 |
|------|---------|---------|
| center | 原图居中裁剪 1920×1080 | assets/bg_center.png |
| right | 偏左裁剪（留右侧 25% 空间） | assets/bg_right.png |

## 生成队列

按以下顺序生成数字人视频：

1. **第一组: Intro/Outro (center 位置)**
   - slide-01-01 (intro, 300fps, center)
   - slide-01-15 (outro, 300fps, center)

2. **第二组: Highlight (right 位置)**
   - slide-01-04 (highlight, 180fps, right)
   - slide-01-08 (highlight, 150fps, right)

## 每个生成任务的参数

### slide-01-01 (intro)
```yaml
slide_id: slide-01-01
trigger_type: intro
position: center
duration_frames: 300
audio_source: ../transcripts/slide-01-01.md
background: assets/bg_center.png
character: assets/character.png
prompt: 数字人面向镜头，自然讲解，手势配合
```

### slide-01-04 (highlight)
```yaml
slide_id: slide-01-04
trigger_type: highlight
position: right
duration_frames: 180
audio_source: ../transcripts/slide-01-04.md
background: assets/bg_right.png
character: assets/character.png
prompt: 数字人侧身面向左侧PPT，右手指示，自然讲解
```
```

---

## 5. 背景裁剪规则详解

### 5.1 Center 位置（Intro/Outro）

```
原始背景图
┌──────────────────────┐
│                      │
│    ┌────────┐        │  ← 居中裁剪 1920×1080
│    │  数字人 │        │
│    └────────┘        │
│                      │
└──────────────────────┘
```

- 裁剪方式：原图居中裁剪为 1920×1080
- 用途：数字人居中，PPT 不显示

### 5.2 Right 位置（Highlight）

```
原始背景图
┌──────────────────────┐
│                      │  ← 偏左裁剪（留右侧 25% 空间）
│    ┌────────┐        │
│    │ 数字人  │        │  ← 数字人在右侧 1/4 区域
│    └────────┘        │
│                      │
└──────────────────────┘
```

- 裁剪方式：原图偏左裁剪，右侧留出 25% 空间
- 用途：数字人在右侧，PPT 占据左侧 75%

---

## 6. 注意事项

1. **生成顺序**: 先处理 intro/outro（center 位置），再处理 highlight（right 位置）。因为 center 背景裁剪最简单。

2. **时长估算**: 语音稿字数 × 3 字/秒 ≈ 所需帧数 ÷ 30fps。例如 100 字语音稿 ≈ 33 秒 ≈ 1000 帧。但 LTX2.3 有最大时长限制（通常 5-10 秒），超长语音稿需要拆分。

3. **Prompt 设计**: 
   - intro/outro: "数字人面向镜头，自然讲解"
   - highlight: "数字人侧身面向左侧PPT，右手指示"

4. **音频驱动**: 每页的语音稿通过本地 CrispASR voxcpm2 后端转换为 wav 音频，再传入 LTX2.3 工作流。批量处理使用 `scripts/tts-batch.sh`。

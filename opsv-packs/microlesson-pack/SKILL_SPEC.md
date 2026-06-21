---
name: microlesson-pack
title: 数字人微课制作管线
version: 1.0.0
pipeline_stages:
  - id: S0
    name: lesson-planner
    description: 课程剧本拆解
  - id: S1
    name: ppt-organizer
    description: PPT素材组织
  - id: S2
    name: digital-human-planner
    description: 数字人规划
  - id: S3
    name: digital-human-generator
    description: 数字人生成
  - id: S4
    name: remotion-compiler
    description: Remotion编排
  - id: S5
    name: remotion-renderer
    description: Remotion渲染
---

# Skill Spec — 数字人微课制作管线

## 技能列表

| 技能ID | 技能名 | 阶段 | 输入 | 产出 |
|--------|--------|------|------|------|
| S0 | lesson-planner | 剧本拆解 | 课程大纲 markdown | lessons/{id}/metadata.md |
| S1 | ppt-organizer | 素材组织 | PPT图片 + 语音稿 | lessons/{id}/slides/*.md |
| S2 | digital-human-planner | 数字人规划 | S0 metadata + S1 slides | lessons/{id}/dh_plan.md |
| S3 | digital-human-generator | 数字人生成 | S2 dh_plan + 角色图 + 背景图 | lessons/{id}/assets/dh_*.mp4 |
| S4 | remotion-compiler | Remotion编排 | S1 slides + S3 数字人视频 | lessons/{id}/remotion/index.tsx |
| S5 | remotion-renderer | Remotion渲染 | S4 组件 + 所有素材 | output.mp4 |

## 项目结构

每个微课项目对应一个 lesson 目录：

```
videospec/
└── lessons/
    └── {lesson_id}/          # 例如: lesson-01
        ├── metadata.md       # S0 产出：课程元数据
        ├── slides/           # S1 产出：每页 PPT 元数据
        │   ├── slide-01-01.md
        │   ├── slide-01-02.md
        │   └── ...
        ├── transcripts/      # 语音稿
        │   ├── slide-01-01.md
        │   └── ...
        ├── dh_plan.md        # S2 产出：数字人规划
        ├── assets/           # S3 产出：数字人视频素材
        │   ├── dh_slide-01-01.mp4
        │   ├── dh_slide-01-02.mp4
        │   └── bg.png        # 背景图
        ├── audio/            # TTS 生成的音频
        │   ├── slide-01-01.mp3
        │   └── ...
        └── remotion/         # S4 产出：Remotion 组件
            └── index.tsx
```

## 课程元数据格式 (metadata.md)

```yaml
---
status: draft
id: lesson-01
title: "Python入门"
lesson_number: 1
total_slides: 25
slides_per_lecture: 5
digital_human_roles:
  character_photo: assets/character.png
  background: assets/bg.png
  resolution: [1920, 1080]
  fps: 30
---

# Python入门

## 课程结构

| 讲号 | 标题 | 页数 | 数字人触发 |
|------|------|------|-----------|
| 01 | 什么是Python | 5 | intro, highlight |
| 02 | 变量与数据类型 | 5 | highlight |
| 03 | 条件语句 | 5 | highlight |
| 04 | 循环结构 | 5 | highlight |
| 05 | 总结回顾 | 5 | outro |
```

## Slide 元数据格式 (slides/slide-X-Y.md)

```yaml
---
status: draft
id: slide-01-03
lesson_id: lesson-01
lecture_number: 1
slide_number: 3
total_slides_in_lecture: 5
image: ../assets/slides/slide-01-03.png
transcript: ../transcripts/slide-01-03.md
digital_human_trigger: none
dh_position: null
duration_frames: 180
---

# Slide 01-03: Python 变量

## 语音稿

这里写这一页的语音稿内容...

## Remotion 动画配置

- transition: fade-in
- slide_animate: zoom-in
- bg_opacity: 1.0
```

## 数字人规划格式 (dh_plan.md)

```yaml
---
status: draft
id: dh-plan-lesson-01
lesson_id: lesson-01
---

# 数字人规划

## 触发列表

| Slide | 触发类型 | 位置 | 时长(帧) | 语音稿 |
|-------|---------|------|---------|--------|
| slide-01-01 | intro | center | 300 | ../transcripts/slide-01-01.md |
| slide-01-03 | highlight | right | 180 | ../transcripts/slide-01-03.md |
| slide-01-08 | highlight | right | 150 | ../transcripts/slide-01-08.md |
| slide-01-12 | highlight | right | 200 | ../transcripts/slide-01-12.md |
| slide-01-15 | outro | center | 300 | ../transcripts/slide-01-15.md |

## 背景配置

- background_image: assets/bg.png
- character_photo: assets/character.png
- resolution: [1920, 1080]

## 数字人生成队列

按以下顺序生成数字人视频：
1. slide-01-01 (intro, 最长)
2. slide-01-03 (highlight)
3. slide-01-08 (highlight)
4. slide-01-12 (highlight)
5. slide-01-15 (outro, 最长)
```

## Remotion 组件格式 (index.tsx)

```tsx
// 自动生成，不手动编辑
// 结构示意：
export const LessonComposition = ({ slides, dhVideos, bgImage }) => {
  return (
    <Composition
      id={`lesson-${lessonId}`}
      component={LessonScene}
      durationInFrames={totalFrames}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ slides, dhVideos, bgImage }}
    />
  );
};
```

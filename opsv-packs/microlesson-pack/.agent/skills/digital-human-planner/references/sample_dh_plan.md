---
status: draft
id: dh-plan-lesson-01
lesson_id: lesson-01
---

# 数字人规划 - Python入门教程

## 触发列表

| Slide | 触发类型 | 位置 | 时长(帧) | 语音稿 |
|-------|---------|------|---------|--------|
| slide-01-01 | intro | center | 300 | ../transcripts/slide-01-01.md |
| slide-01-04 | highlight | right | 180 | ../transcripts/slide-01-04.md |
| slide-01-08 | highlight | right | 150 | ../transcripts/slide-01-08.md |
| slide-01-12 | highlight | right | 200 | ../transcripts/slide-01-12.md |
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
   - slide-01-12 (highlight, 200fps, right)

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

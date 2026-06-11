---
name: comic-animation
description: 漫剧动画生成 — Seedance 4帧参考驱动、首尾帧模式、运动提示词编译、硅基流动 Wan 系列视频模型。将分镜静态图转为动态镜头。
---

# 漫剧动画生成 (Comic Animation)

## 概述

将 ComfyUI 生成的 4 帧分镜图（或角色+场景+首尾帧）转化为动态视频镜头。主引擎为 Seedance 2.0，辅以 Wan2.2 I2V 快速预览。

---

## 模型选择矩阵

| 模型 | 命令 | 品质 | 速度 | 参考图 | 适用 |
|------|------|------|------|--------|------|
| `volc.seedance2` | `opsv animate --model volc.seedance2` | ★★★★★ | ★★★ | ≤9张 | 成品镜头 |
| `volc.seedance2f` | `opsv animate --model volc.seedance2f` | ★★★★ | ★★★★★ | ≤9张 | 快速迭代 |
| `siliconflow.wani2v` | `opsv animate --model siliconflow.wani2v` | ★★★ | ★★★★ | 1张(首帧) | 轻量预览 |
| `siliconflow.want2v` | `opsv animate --model siliconflow.want2v` | ★★★ | ★★★ | 0 | 纯文本预览 |

---

## 视频生成模式

### 模式 1：4 帧参考驱动（推荐）

**流程**：ComfyUI 4 帧分镜图 → 拆分为 4 张独立帧 → 作为 reference_images 传入 Seedance。

```yaml
---
category: comic_shot
status: drafting
title: "EP01 Shot 1-3 — 云璃下令拿下陆然"
duration: "5s"
first_frame: "opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame1.png"
last_frame: "opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame4.png"
ratio: "16:9"
generate_audio: true
model: "volc.seedance2"
prompt: >
  Camera dolly in from wide establishing shot to medium close-up on @yun_li_adult.
  She raises her right hand in a commanding gesture, imperial sleeve flowing.
  Her expression shifts from cold indifference to barely contained fury.
  Four imperial guards rush forward from the edges of the frame,
  swords drawn. @lu_ran does not move, his back still to the camera.
  Dramatic tension, dust kicking up from the guards' charge.
  Maintain consistent character design. Ancient Chinese fantasy cinematic.
refs:
  image:
    "@yun_li_adult":
      - opsv-queue/videospec_circle1/runninghub.comic_001/yun_li_adult_1.png
    "@lu_ran":
      - opsv-queue/videospec_circle1/runninghub.comic_001/lu_ran_1.png
    "@temple":
      - opsv-queue/videospec_circle1/runninghub.comic_002/temple_1.png
    "@:frame_1":
      - opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame1.png
    "@:frame_2":
      - opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame2.png
    "@:frame_3":
      - opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame3.png
    "@:frame_4":
      - opsv-queue/videospec_circle1/runninghub.comic_003/EP01_shot_03_frame4.png
---
```

### 模式 2：首尾帧模式

**适用**：已有明确的首帧和尾帧图片，让 AI 补全中间过渡。

```yaml
first_frame: "opsv-queue/videospec_circle2/volc.seadream5_001/shot_03_first.png"
last_frame: "opsv-queue/videospec_circle2/volc.seadream5_001/shot_03_last.png"
prompt: >
  Smooth transition from first frame to last frame.
  @yun_li_adult's hand moves from chest height (frame 1) to fully raised
  above her head (last frame). Sleeve fabric flows naturally.
  Guards enter from both sides in the middle of the motion. 5 seconds.
```

### 模式 3：I2V 单帧驱动

**适用**：快速预览单个关键帧的动画效果。

```yaml
first_frame: "opsv-queue/videospec_circle2/volc.seadream5_001/shot_03_mid.png"
prompt: >
  @yun_li_adult stands in @temple, cold wind blowing her imperial robes.
  Slow motion fabric movement, hair strands drifting. Camera slowly pushes in.
  5 seconds. Cinematic.
```

---

## Seedance 视频提示词公式

### 基础公式

```
[摄影机运动] + [主体动作] + [环境响应] + [微表情/微动作] + [氛围/光影变化]
```

### 漫剧场景提示词模板

#### 对话场景 (Dialogue)
```
Camera slowly pushes in from medium shot to close-up on [Character A].
[Character A] speaks — subtle lip movements, slight head tilt.
[Character B] reacts — eyes narrow/widen, micro-expression shift.
Background remains still, shallow depth of field.
[Duration] seconds. Cinematic, consistent character design.
```

#### 动作场景 (Action)
```
[Character A] [specific physical action — lunge/parry/dodge].
[Weapon/prop] arcs through the air, motion blur on fast movement.
Impact — [visual effect: sparks/dust/shockwave].
Camera [whip pan/tracking/orbit] to follow the action.
[Duration] seconds. Dynamic, high energy, cinematic.
```

#### 情感场景 (Emotional)
```
[Character] stands still for a heartbeat. Then [physical reaction — collapse/kneel/tremble].
Close-up on face — [micro-expressions: tear falls/eyes glisten/lips quiver].
Slow camera movement — [dolly out/crane up] to emphasize isolation/vulnerability.
[Duration] seconds. Emotional, intimate, cinematic lighting.
```

#### 回忆/闪回 (Flashback)
```
Warm golden glow suffuses the frame. [Characters] in [setting],
soft focus around edges, slight film grain.
[Gentle action — playing/walking/talking].
Slow motion, dreamlike quality. Transition hint at edges — slight vignette.
[Duration] seconds. Nostalgic, warm color grading, soft focus.
```

---

## 视频提示词语言规则

### ✅ 正确做法

```yaml
prompt: >
  Camera slowly dolly in. @lu_ran turns his head slightly, amber eyes
  reflecting golden light. A faint smirk crosses his lips. His broken
  dragon horn catches a ray of light. Robes shift as he takes one step forward.
  5 seconds. Cinematic, 16:9, Ancient Chinese fantasy donghua style.
```

### ❌ 常见错误

| 错误 | 问题 | 正确 |
|------|------|------|
| `他穿着蓝色袍子` | 描述了外观（参考图已决定） | `他的袍子随风飘动` (只写动作) |
| `场景非常壮观` | 模糊形容词 | `Camera pulls back to reveal vast temple complex` |
| `很酷的打斗` | 无具体动作 | `He parries left, spins, blade arcs upward` |
| `情感很悲伤` | 情绪标签 | `A single tear rolls down her cheek, shoulders tremble` |

---

## 编译与执行

### 编译命令

```bash
# Seedance 2.0 — 高质量成品
opsv animate --model volc.seedance2 --category comic_shot

# Seedance 2.0 Fast — 快速迭代
opsv animate --model volc.seedance2f --category comic_shot

# Wan2.2 I2V — 轻量预览
opsv animate --model siliconflow.wani2v --category comic_shot

# 预览模式
opsv animate --model volc.seedance2 --category comic_shot --dry-run

# 指定 manifest
opsv animate --model volc.seedance2 --manifest opsv-queue/videospec_circle2/_manifest.json
```

### 执行命令

```bash
# 执行整个目录
opsv run opsv-queue/videospec_circle2/volc.seedance2_001/

# 单个镜头的视频
opsv run opsv-queue/videospec_circle2/volc.seedance2_001/EP01_shot_03.json

# 并发执行
opsv run opsv-queue/videospec_circle2/volc.seedance2_001/ -c 2
```

### 审查与迭代

```bash
opsv review
# 审查 approve → Guardian 执行 syncing 对齐

# 修改后重新生成
opsv iterate opsv-queue/videospec_circle2/volc.seedance2_001/EP01_shot_03.json
# 编辑生成的 EP01_shot_03_2.json
opsv run opsv-queue/videospec_circle2/volc.seedance2_001/EP01_shot_03_2.json
opsv review
```

---

## 视频产出文件

```
opsv-queue/videospec_circle2/volc.seedance2_001/
├── EP01_shot_01.json
├── EP01_shot_01_1.mp4         # 视频
├── EP01_shot_01_first.png     # 首帧（return_last_frame: true）
├── EP01_shot_01_last.png      # 尾帧 — 下一镜的 @FRAME 引用目标
├── EP01_shot_02.json
├── EP01_shot_02_1.mp4
├── EP01_shot_02_first.png
├── EP01_shot_02_last.png
├── ...
```

---

## 质量控制清单

执行前 Guardian-Agent 检查：

```
□ comic_shot 的 first_frame 指向存在的图片文件
□ 若 first_frame 为 @FRAME:prev_shot_last，前一镜已生成尾帧
□ prompt 仅描述动作和运镜，不描述外观
□ duration 与内容复杂度匹配（简单动作 5s、复杂动作 8-10s）
□ ratio 与 project.md 一致
□ refs 中 4 帧参考图全部存在
□ 若 generate_audio: true，对应 comic_voice 资产已 approved
```

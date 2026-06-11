---
name: comic-post
description: 漫剧后期成片 — 素材组装 SOP、字幕特效、音频合成、多平台输出格式。单集成片的最终交付。
---

# 漫剧后期成片 (Comic Post-Production)

## 概述

将所有已 approved 的资产组装为单集成片。Agent 负责素材清单管理、字幕格式准备、音频合成标注，实际剪辑由导演/剪辑师在剪辑软件中完成。

---

## 单集成片文档模板

```yaml
---
category: comic_episode
status: drafting
title: "女帝登基悔婚 — EP01 成片"
episode_number: "EP01"
total_shots: 18
duration_total: "180s"
resolution: "1920x1080"
aspect_ratio: "16:9"
---
```

---

## 素材组装 SOP

### 第一步：素材清单

从所有 approved 资产中生成素材清单：

```markdown
## EP01 素材清单

### 视频镜头
| ID | 文件 | 时长 | 状态 |
|----|------|------|------|
| 1-1 | EP01_shot_01_1.mp4 | 8s | approved |
| 1-2 | EP01_shot_02_1.mp4 | 10s | approved |
| ... | ... | ... | ... |

### 配音文件
| ID | 文件 | 时长 | 绑定镜头 |
|----|------|------|---------|
| EP01_lu_ran_vo | EP01_lu_ran_vo_1.mp3 | 15s | 1-1, 1-2 |
| EP01_scene_1_1 | EP01_scene_1_1_dialogue_1.mp3 | 25s | 1-3, 1-4, 1-5 |
| ... | ... | ... | ... |

### 音效
| ID | 文件 | 时长 | 绑定镜头 |
|----|------|------|---------|
| sfx_dragon_roar | dragon_roar_1.mp3 | 3s | 1-2 |
| sfx_sword_draw | sword_draw_1.mp3 | 1s | 1-3 |
| ... | ... | ... | ... |

### 背景音乐
| ID | 文件 | 用途 |
|----|------|------|
| bgm_opening | opening_theme.mp3 | 片头 |
| bgm_tension | tension_bed.mp3 | 对峙场景 |
| bgm_emotional | emotional_strings.mp3 | 回忆/感人场景 |
```

### 第二步：时间线编排

```markdown
## EP01 时间线

### 片头 (0:00 - 0:10)
- bgm_opening | 10s
- 标题字幕："女帝登基悔婚，跪求我修复龙脉" + "第一集"

### 镜头 1-1 — 海底深渊 (0:10 - 0:18)
- 视频: EP01_shot_01_1.mp4 | 8s
- 配音: EP01_lu_ran_vo (0:00-0:08) | "二十年前，我亲手挖出自己的龙珠..."
- 音效: sfx_underwater_ambient | 持续
- 字幕: 陆然（VO）

### 镜头 1-2 — 徒手剖胸 (0:18 - 0:28)
- 视频: EP01_shot_02_1.mp4 | 10s
- 配音: EP01_lu_ran_vo (0:08-0:18) | "立下这龙凤婚碑..."
- 音效: sfx_dragon_roar (0:00-0:03) | 龙珠出现瞬间
- 字幕: 陆然（VO）

... 继续编排 ...

### 片尾 (3:00 - 3:10)
- bgm_ending | 10s
- 职员表字幕
```

### 第三步：字幕格式

```markdown
## EP01 字幕

### 对白字幕格式
- 字体：思源黑体 / Source Han Sans
- 字号：32px
- 颜色：白色主字 + 黑色描边（2px）
- 位置：底部居中，安全区以内
- 每行最多 18 个汉字
- 淡入淡出：0.2s

### 标注字幕格式
- 字体：思源宋体
- 字号：28px
- 颜色：金色 #D4A843
- 位置：左上角
- 格式：（字幕：大玄女帝云璃）

### 示例

| 时间 | 类型 | 内容 |
|------|------|------|
| 0:19.0-0:22.0 | 标注 | （字幕：大玄女帝云璃） |
| 0:22.5-0:24.0 | 对白 | 拿下。 |
| 0:24.5-0:28.0 | 对白 | 云璃，我是你的未婚夫！ |
| 0:28.5-0:30.0 | 对白 | 为何要如此待我？ |
```

### 第四步：音频合成标注

```markdown
## EP01 音频合成标注

### 音量平衡
- 对白峰值：-6dB
- 音效峰值：-12dB（战斗场景 -8dB）
- 背景音乐：-18dB（对白时 sidechain ducking -3dB）
- 静音段底噪：≤ -60dB

### 交叉淡入淡出
- 镜头切换：视频 0.3s crossfade
- 音频切换：0.5s crossfade（避免 pop）
- 场景转换：1.0s audio crossfade + bgm transition

### 特殊处理
- EP01_shot_06: 龙吟声叠加低频增强 +6dB @ 60-120Hz
- EP01_shot_09: 回忆场景加 low-pass filter 1.5kHz + slight reverb
```

### 第五步：多平台输出

```markdown
## 输出格式

| 平台 | 分辨率 | 编码 | 比特率 | 音频 |
|------|--------|------|--------|------|
| B站/YouTube | 1920x1080 | H.264 | 8Mbps | AAC 320kbps |
| 抖音/快手 | 1080x1920 (9:16) | H.264 | 4Mbps | AAC 192kbps |
| 小红书 | 1080x1920 | H.264 | 3Mbps | AAC 192kbps |
| 存档母版 | 1920x1080 | ProRes 422 | — | PCM 24bit |
```

---

## 后期检查清单

### Guardian-Agent 检查

```
□ 所有 comic_shot 状态为 approved
□ 所有 comic_voice 状态为 approved
□ 素材清单中无缺失文件
□ 字幕时间码与配音逐句对齐
□ 音频素材无削波 (clipping)
□ 片头片尾时长符合平台要求
□ 横版/竖版裁剪无关键信息丢失
```

### Runner-Agent 检查

```bash
# 确认所有 Circle 状态
opsv circle refresh

# 输出应为：
#   ✅ zerocircle: N 资产 (N approved)
#   ✅ firstcircle: M 资产 (M approved)
#   ✅ endcircle: K 资产 (K approved)
```

---

## 与剪辑软件的数据对接

OpsV 产出可用于导入剪辑软件的元数据：

```json
// EP01_timeline.json — 可导入 Premiere/DaVinci Resolve
{
  "episode": "EP01",
  "duration": 180,
  "resolution": "1920x1080",
  "tracks": [
    {
      "type": "video",
      "clips": [
        { "id": "1-1", "file": "EP01_shot_01_1.mp4", "start": 0, "duration": 8 },
        { "id": "1-2", "file": "EP01_shot_02_1.mp4", "start": 8, "duration": 10 }
      ]
    },
    {
      "type": "audio_dialogue",
      "clips": [
        { "id": "lu_ran_vo", "file": "EP01_lu_ran_vo_1.mp3", "start": 0, "duration": 18 }
      ]
    }
  ],
  "subtitles": [
    { "start": 9.0, "end": 10.0, "text": "（字幕：大玄女帝云璃）", "style": "label" },
    { "start": 10.5, "end": 12.0, "text": "拿下。", "style": "dialogue", "speaker": "云璃" }
  ]
}
```

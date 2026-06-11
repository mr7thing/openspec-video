---
name: comic-storyboard
description: 漫剧分镜脚本 — 文学剧本→可视化分镜，含台词/景别/运镜指令/运动提示词/4 帧参考图配置/首尾帧衔接/6段式prompt结构。
---

# 漫剧分镜脚本 (Comic Storyboard)

## 职责边界

**你做**：将阶段 A 拆解后的剧本转化为逐镜分镜脚本（`comic_storyboard` 文档）。每镜包含**台词、景别、机位、运镜指令、运动提示词、6段式prompt、4帧参考图需求**。

**你不做**：实际图片/视频生成（Runner）、剧本拆解（Comic-Creative）。

---

## 分镜文档模板（v2 — 含台词+景别）

```yaml
---
category: comic_storyboard
status: drafting
title: "EP01 Shot 1-1 — 海底深渊 妖影翻腾"
episode: "EP01"
scene_number: "1-1"
duration: "8s"
shot_type: "EWS"              # 景别（必填）
camera_angle: "eye-level"     # 机位角度
camera_motion: >
  Slow crane down, starting above water surface → descending into dark abyss.
  Wide establishing shot throughout.
dialogue_speaker: null        # 本镜说话角色（无台词则 null）
dialogue: null                # 台词内容（无台词则 null）
motion_prompt: >
  Dark shadows writhe and swirl in the deep ocean abyss.
  Bubbles rise slowly. The camera descends through layers of murky water,
  revealing larger and more menacing creature silhouettes.
  Bioluminescent particles drift past the lens.
  Slow, menacing atmosphere — underwater dread.
frame_count: 4
first_frame: null
last_frame: null
transition: "cut"             # 至下一镜转场方式
connect_to_next: false        # 是否启用 Temporal Bridge（尾帧→下镜首帧）
visual_detailed: |
  深海深渊，画面从海面之上开始，缓慢向下沉入黑暗水域。
  海水从浅蓝过渡到墨蓝再到漆黑。无数暗影在水中翻腾扭动，
  隐约可见巨大妖物的轮廓。偶尔有生物荧光粒子漂过镜头。
  压迫感逐渐增强。
prompt: >
  Frame 1 (opening/surface): Ocean surface seen from below, sunlight filtering through waves,
  faint dark shapes circling far beneath.
  Frame 2 (development/mid-depth): Camera descends, water darkens to deep blue,
  monstrous silhouettes become more defined, glowing eyes appearing.
  Frame 3 (climax/abyss): Near total darkness, only bioluminescent particles
  and distant glowing eyes visible, massive tentacles drifting across frame.
  Frame 4 (resolution/close): A single massive glowing eye fills half the frame,
  scales and ancient markings visible in dim blue light.
  Underwater atmosphere, cinematic, Ancient Chinese fantasy style,
  volumetric light rays penetrating water surface.
refs:
  image:
    "@style:donghua":
      - refs/donghua_style_ref.png
    "@:ocean_mood":
      - refs/ocean_abyss_mood.png
---

## Vision
EP01 开场 — 陆然 VO 回溯二十年前立婚碑镇妖。
海底深渊是妖族封印之地的视觉隐喻。压迫感逐渐增强，为后续婚碑的"镇守"意义建立视觉对比。
不需要出现角色——这是纯粹的氛围建立镜头。

## Design References

### image
![style_ref](refs/donghua_style_ref.png)
![ocean_mood](refs/ocean_abyss_mood.png)
```

### 模板 — 有台词的对话镜示例

```yaml
---
category: comic_storyboard
status: drafting
title: "EP01 Shot 2-3 — 云璃逼问"
episode: "EP01"
scene_number: "2-3"
duration: "6s"
shot_type: "MCU"
camera_angle: "low angle"
camera_motion: "Static, locked off"
dialogue_speaker: "yun_li"
dialogue: "陆然，你当真以为凭一枚婚碑，就能镇住我妖族千年大业？"
motion_prompt: >
  @yun_li stands with arms crossed, chin raised. She speaks — slight smirk.
  Her eyes narrow during the last phrase. Subtle head tilt. Hair wisps
  drift in the wind. Camera static, locked off.
frame_count: 4
first_frame: "@FRAME:EP01_shot_2-2_last"
last_frame: "@EP01_shot_2-3:last"
transition: "dissolve"
connect_to_next: true
...
```

---

## 分镜必需字段（v2 新增景别+台词）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `episode` | string | ✅ | 集数编号 | `"EP01"` |
| `scene_number` | string | ✅ | 场次编号（对齐剧本） | `"1-1"`, `"2-3"` |
| `duration` | string | ✅ | 镜头时长 | `"5s"`, `"8s"`, `"10s"` |
| **`shot_type`** | string | ✅ | **景别（新增必填）** | `"EWS"`, `"WS"`, `"MS"`, `"MCU"`, `"CU"`, `"ECU"`, `"OTS"`, `"POV"` |
| **`camera_angle`** | string | ✅ | **机位角度（新增必填）** | `"eye-level"`, `"low angle"`, `"high angle"`, `"dutch"`, `"bird's eye"` |
| `camera_motion` | string | ✅ | 运镜指令（英文） | `"Slow dolly in, medium shot → close-up"` |
| **`dialogue_speaker`** | string | 条件 | **说话角色 @id（有台词时必填，无台词填 null）** | `"lu_ran"`, `"yun_li"` |
| **`dialogue`** | string | 条件 | **台词原文（有台词时必填，无台词填 null）** | `"你当真以为..."` |
| `motion_prompt` | string | ✅ | 运动提示词（英文，仅动作） | `"The character turns slowly..."` |
| `frame_count` | int | ✅ | 参考帧数量 | `4`（推荐）、`2`、`1` |
| `first_frame` | string | 条件 | 首帧引用 | `"@FRAME:prev_shot_last"` 或 `null` |
| `last_frame` | string | ✅ | 尾帧引用 | `"@EP01_shot_01:last"` |
| **`transition`** | string | ✅ | **至下一镜转场（新增必填）** | `"cut"`, `"dissolve"`, `"fade out"`, `"wipe"` |
| **`connect_to_next`** | bool | ✅ | **Temporal Bridge 启用（新增）** | `true` / `false` |

---

## 景别体系（Shot Type）

景别是镜头设计中最基础也是最重要的决策。在 prompt 中直接命名景别比用形容词描述效果更好。

| 缩写 | 全称 | 画面范围 | AI Prompt 关键词 | 叙事功能 |
|------|------|---------|-----------------|---------|
| **EWS** | Extreme Wide Shot | 环境主导，主体极小（1-5%） | "extreme wide shot, establishing" | 建立空间、史诗感、孤独感 |
| **WS** | Wide Shot | 全身+环境（15-30%） | "wide shot, full body visible" | 动作展示、空间关系 |
| **MS** | Medium Shot | 腰部以上（50-70%） | "medium shot, waist up" | 对话标准景别 |
| **MCU** | Medium Close-Up | 胸部以上（60-75%） | "medium close-up, chest up" | 情感表达、反应镜头 |
| **CU** | Close-Up | 头部和肩膀（70-85%） | "close-up, head and shoulders" | 情绪高潮 |
| **ECU** | Extreme Close-Up | 单一细节（85-100%） | "extreme close-up, [detail] only" | 极致紧张、关键细节 |
| **OTS** | Over-the-Shoulder | 过肩 | "over the shoulder shot" | 对话覆盖 |
| **POV** | Point of View | 角色视角 | "POV shot, through character's eyes" | 主观体验 |
| **INSERT** | Insert Shot | 物体/细节特写 | "insert shot, close-up of [object]" | 道具、文书 |

**选镜黄金法则**：
- 每场戏以 EWS/WS 建立空间 → MS/MCU 推入对话/动作 → CU/ECU 捕捉情绪高峰
- EWS 和 CU 之间需要 MS/MCU 作为视觉过渡
- 同场景同角色连续镜头景别应有变化（避免跳切感）

---

## 六段式 Prompt 结构（6-Part Prompt Formula）

适用于单个帧或不需要 4 帧分段时的 prompt 写作。与 4 帧格式可混用。

```
SUBJECT:  [角色 @id 引用] + [1-2个定义性特征]
ACTION:   [单一清晰的动作 + 微表情]
SCENE:    [场景描述 + 背景细节 + 前景道具]
CAMERA:   [shot_type + camera_angle + camera_motion]
LIGHT:    [时间段/光源 + 软硬光 + 情绪]
STYLE:    [视觉风格 + 色调 + 类型]
```

**示例** — 将 4 帧的 Frame 3 转为六段式：

```yaml
# 六段式 prompt（可作为 ai_prompt 字段单独输出，兼容 Kling/Veo3/Sora）
ai_prompt: |
  SUBJECT: A young man (@lu_ran) with broken dragon horns, scaled arms, bare chest
  ACTION: Holding the Dragon Pearl aloft, golden light erupting, face contorted in pain but resolute
  SCENE: Dark ocean abyss, monster shadows recoiling, volumetric light piercing darkness
  CAMERA: Extreme wide shot, eye-level, slow crane up following the rising pearl
  LIGHT: Blinding golden light from pearl, deep blue-black ambient, dramatic god rays
  STYLE: Ancient Chinese fantasy donghua, cinematic, hyper-detailed, gold and crimson tones
```

**六段式 vs 4 帧**：
| 格式 | 适用场景 | 优势 |
|------|---------|------|
| **4 帧** (Frame 1-4) | Seedance/4帧驱动工作流 | 精确控制时间线、首尾帧衔接 |
| **六段式** (ai_prompt) | Kling/Veo3/Sora 等 T2V 模型 | 结构清晰、模型遵循度高 |
| **混合** | 每帧内部用六段式 + 整体用 4 帧 | 最佳质量和可维护性 |

---

## 运镜指令参考 (Camera Motion)

| 运镜 | 英文指令 | 适用场景 |
|------|---------|---------|
| 推镜 | `Dolly in` / `Push in` | 强调情绪、揭示细节 |
| 拉镜 | `Dolly out` / `Pull back` | 揭示环境、建立空间 |
| 横摇 | `Pan left` / `Pan right` | 横向空间展示 |
| 竖摇 | `Tilt up` / `Tilt down` | 纵向空间展示 |
| 升镜 | `Crane up` | 史诗感、宏大场面 |
| 降镜 | `Crane down` | 沉入感、压迫感 |
| 跟镜 | `Tracking shot` | 人物移动跟随 |
| 环绕 | `Orbit shot` | 360° 展示 |
| 急推 | `Crash zoom` | 震惊/紧张 |
| 手持 | `Handheld, slight shake` | 真实感/混乱 |
| 静止 | `Static, tripod lock-off` | 对话/凝视 |
| 无人机 | `Drone shot` | 航拍/大场面 |

**每段 prompt 只指定一种主要运镜**，避免堆叠多个运动指令。将运镜描述放在 prompt 前半部分。

---

## 转场类型 (Transition)

| 转场 | 值 | 叙事功能 | AI 生成提示 |
|------|-----|---------|-----------|
| 直接切 | `cut` | 标准叙事 | 默认，无需特殊提示 |
| 叠化 | `dissolve` | 时间流逝、回忆 | "cross dissolve transition" |
| 淡入 | `fade in` | 段落开始 | "fade in from black" |
| 淡出 | `fade out` | 段落结束 | "fade out to black" |
| 擦除 | `wipe` | 地点转换 | "wipe transition left to right" |
| 匹配剪辑 | `match cut` | 视觉隐喻 | 标注匹配元素 |
| J-Cut | `j-cut` | 声音先入画 | 在 audio_notes 中标注 |
| L-Cut | `l-cut` | 画面先切，声音延续 | 在 audio_notes 中标注 |

---

## 运动提示词写法 (Motion Prompt)

### 分离主义 (Separation Principle)

**运动提示词只描述"怎么动"，绝不描述"长什么样"。**

参考图已经决定了角色外观、场景布置、服装细节。运动提示词只写物理动作和镜头变化。

```yaml
# ✅ 正确 — 只写动作
motion_prompt: >
  The young girl slowly turns her head to look up at the boy.
  Her eyes widen slightly, tears welling up. She reaches out
  with a trembling hand. The boy gently pats her head, his
  expression soft.

# ❌ 错误 — 描述了外观
motion_prompt: >
  The young girl in a rough cloth dress with messy hair slowly turns
  her head. The boy with broken dragon horns reaches out his hand.
  # ← "rough cloth dress" "messy hair" "broken dragon horns"
  #   这些都是参考图已经决定的外观！
```

### 动作描述分级

| 级别 | 描述精度 | 示例 |
|------|---------|------|
| **宏观动作** | 全身运动、位移 | `walks slowly across the courtyard` |
| **中观动作** | 肢体动作 | `raises his right hand, fingers curling into a fist` |
| **微表情** | 面部细节 | `eyes narrowing, lips parting slightly, a single tear rolls down` |
| **物理交互** | 物体互动 | `her sleeves billow in the wind, dust particles scatter` |

### 漫剧常见动作模板

```yaml
# 对话场景（含台词）
motion_prompt: >
  Two characters stand facing each other. Character A speaks, slight head tilt.
  Character B reacts — eyes widen, then narrow. Subtle micro-expressions.
  Camera slowly pushes in to medium close-up on Character B's face.

# 战斗场景
motion_prompt: >
  Character A lunges forward, sword arcing through the air.
  Character B sidesteps, robes flowing with the motion.
  Impact — shockwave ripples outward, dust and debris scatter.
  Camera whip pans to follow the action.

# 情感爆发
motion_prompt: >
  Character stands frozen for a beat. Then collapses to knees.
  Shoulders shake — sobbing. Hands press against the ground,
  fingers clawing at stone. Tears fall, splashing on grey stone.
  Camera slowly pulls back to wide shot, emphasizing isolation.

# 魔法/玄幻效果
motion_prompt: >
  Golden dragon apparition materializes behind the character.
  Scales shimmer with pulsing light. The dragon roars silently —
  shockwave visible as rippling air distortion. Crimson phoenix
  flames spiral upward, particles of golden light drifting.
```

---

## 4 帧参考图配置

漫剧视频生成使用 **4 帧参考驱动**，在分镜 prompt 中描述 4 个关键帧画面：

```
Frame 1 (opening):   镜头开始时的画面 — 建立空间关系
Frame 2 (development): 动作/情绪发展 — 中间状态
Frame 3 (climax):    情绪/动作高点 — 最具张力的瞬间
Frame 4 (resolution): 镜头的收束 — 为下一镜过渡做准备
```

### 4 帧设计原则

1. **Frame 1 ≈ 上一镜的 Frame 4**：确保视觉连续性
2. **Frame 3 是情绪高点**：最具视觉冲击力的帧
3. **每帧之间有明显变化**：否则生成的视频会是 PPT
4. **帧间距均匀**：4 帧覆盖整个 `duration` 的时间跨度

### 4 帧 prompt 示例（EP01 Shot 1-2 — 徒手剖胸）

```yaml
prompt: >
  Frame 1 (opening): @lu_ran stands waist-deep in dark ocean water,
  waves crashing around him, determined expression, both hands at his chest,
  golden light beginning to glow beneath his skin.
  Frame 2 (development): He digs his fingers into his own chest,
  golden blood streaming down, a brilliant pearl of light emerging —
  the Dragon Pearl. Face contorted in pain but resolute.
  Frame 3 (climax): The Dragon Pearl fully emerges, blinding golden light
  erupts, illuminating the entire abyss. Monster shadows recoil in the
  sudden radiance, shrieking. @lu_ran holds the pearl aloft, chest wound
  glowing. Epic wide shot, volumetric light rays piercing the darkness.
  Frame 4 (resolution): The Dragon Pearl embeds into the stone tablet @wedding_tablet,
  golden light stabilizing into a warm glow, waves calming,
  monster shadows retreating into distant darkness. Peace returning.
  Maintain consistent character design and lighting across all frames.
```

---

## 首尾帧衔接 (First/Last Frame Continuity)

### Temporal Bridge（时间桥接）

`connect_to_next: true` 标记表示启用 Temporal Bridge 机制：当前镜的尾帧将作为下一镜的视觉起始条件。

这一机制可结合 **场景角色合成工作流**（`opsv-2511next分镜`）自动生成承上启下的过渡帧：

```
Shot N (尾帧) ──→ opsv-2511next分镜 ──→ Shot N+1 (首帧)
                    ↑
          使用 next-scene LoRA 确保角色/场景一致性
```

**工作流文件**：`comfyui-workflows/opsv-2511next分镜_api-id-2064955138619568130.json`

**适用场景**：
- 同一场景连续镜头（connect_to_next: true）
- 场景切换但需要角色连续性（connect_to_next: true + scene change）
- 蒙太奇/闪回（connect_to_next: false）

### @FRAME 引用语法

当前镜的 `first_frame` 可以引用上一镜的尾帧：

```yaml
# EP01_shot_02.md
first_frame: "@FRAME:EP01_shot_01_last"
last_frame: "@EP01_shot_02:last"
```

### 衔接检查清单（Guardian 用）

```
□ 非第一镜的 first_frame 是否为 @FRAME:prev_shot_last？
□ 当前镜的 motion_prompt 是否与上一镜的结束动作连贯？
  - 上一镜结尾："人物转身背对镜头"
  - 当前镜开头：不应写"人物正面微笑"（物理矛盾）
□ 4 帧的 Frame 1 描述是否与上一镜的 Frame 4 视觉一致？
□ connect_to_next 标记是否合理？（同一场景连续镜→true，场景切换→按需）
□ 有台词镜头：dialogue_speaker 是否指向已注册的角色 @id？
□ 有台词镜头：dialogue 内容是否与剧本原文对齐？
```

---

## Shotlist 格式（末环批量视频编译用）

```yaml
---
category: shotlist
status: drafting
title: "EP01 镜头列表"
---

## 统计
- 总镜头数：18
- 有台词镜头：8
- 总时长估算：120s
- 总台词字数：320

## 镜头清单
| ID | 景别 | 核心内容 | 台词(说话人) | 时长 | 转场 | Bridge |
|----|------|---------|-------------|------|------|--------|
| 1-1 | EWS | 深渊妖影 | — | 8s | cut | no |
| 1-2 | MS | 徒手剖胸 | — | 10s | dissolve | yes |
| 2-1 | EWS | 宗庙大殿 | — | 5s | cut | no |
| 2-2 | MCU | 云璃下令 | "拿下他"(yun_li) | 5s | cut | yes |
| 2-3 | CU | 陆然反驳 | "你当真以为..."(lu_ran) | 6s | dissolve | yes |

## Shot 1-1
first_frame: null
last_frame: "@EP01_shot_1-1:last"
shot_type: "EWS"
duration: "8s"
dialogue: null

@sea_abyss 深渊翻涌，暗影游弋...

## Shot 2-2
first_frame: "@FRAME:EP01_shot_2-1_last"
last_frame: "@EP01_shot_2-2:last"
shot_type: "MCU"
duration: "5s"
dialogue_speaker: "yun_li"
dialogue: "拿下他。"

@yun_li 端坐主位，眼神冰冷...
```

---

## 分镜文件命名规范

```
videospec/storyboard/
├── EP01_shot_01.md     # 第一集第1镜
├── EP01_shot_02.md     # 第一集第2镜
├── ...
└── EP01_shotlist.md    # 末环 shotlist（批量视频编译用）
```

---

## 交接

完成分镜创作后输出：

```
📋 COMIC STORYBOARD HANDOFF
episode:     "EP01"
shots:       18 total (18 created, 0 modified)
dialogue:    8 shots with dialogue (3 speakers: yun_li x4, lu_ran x3, elder x1)
shotlist:    "EP01_shotlist.md created"
continuity:  "First/last frame chain verified — 17 links, 0 breaks"
temporal_bridge: "5 shots with connect_to_next: true"
next:        "Guardian, please validate storyboard continuity, dialogue coverage, and refs"
```

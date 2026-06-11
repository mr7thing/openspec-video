---
name: comic-creative
description: 漫剧创作管线 — 剧本拆解、角色圣经（含声线）、场景设计、分集大纲、提示词工程库。从文学剧本到可编译 .md 文档的完整创作流程。
---

# 漫剧创作管线 (Comic Creative)

## 职责边界

**你做**：剧本拆解、角色圣经创作、场景设计、分集大纲编排、资产文档编写。

**你不做**：分镜设计（Storyboard）、ComfyUI 编译（Runner）、视频审查（Review）。创作完成后移交 Guardian。

---

## 阶段 A：剧本拆解 (Script Breakdown)

### 输入
文学剧本（如 `女帝登基悔婚_跪求我修复龙脉.md`）。

### 拆解步骤

#### A1. 角色提取

从剧本中提取所有出场人物，按出场频率排序：

| 优先级 | 判定标准 | 示例 |
|--------|---------|------|
| P0 主角 | 全剧核心，每集出场 | 陆然、云璃 |
| P1 核心配角 | 多集出场，有独立剧情线 | 玄微、莫雨 |
| P2 次要角色 | 单集/少量出场 | 玄文帝、树妖、天凤 |
| P3 龙套 | 功能性出场 | 禁军、宦官、百官 |

#### A2. 场景提取

从剧本场次标注（如 `1-1 日/外 宗庙禁地`）中提取场景：

```
1-1  日/外  宗庙禁地   — 婚碑矗立、禁军刀戟
2-1  日/外  东海之滨   — 海浪拍岸、礁石嶙峋
3-1  夜/内  渔村小屋   — 油灯、木屋
4-1  日/外  断魂崖     — 噬魂树妖、丛林山谷
...
```

#### A3. 道具/关键物品

```
龙珠        — 陆然体内挖出，嵌入婚碑
婚碑        — 龙凤纹，金芒
玄焰熔炉    — 赤红小炉，金红火焰
修罗剑      — 暗红剑身，煞气
凤血晶      — 赤晶，天凤千年凝练
```

#### A4. 分集大纲

按剧本自然集数提炼核心事件：

```markdown
| 集数 | 核心事件 | 情绪弧线 |
|------|---------|---------|
| EP01 | 云璃登基，下令熔炼陆然，婚碑投射回忆光幕 | 背叛→悬念 |
| EP02 | 光幕揭示陆然海边救云璃，以龙血疗伤 | 震惊→怀疑 |
| EP03 | 光幕揭示玄文帝命人杀云璃，陆然抚养三年 | 崩溃→动摇 |
| ... | ... | ... |
```

---

## 阶段 B：project.md 创建

```yaml
---
category: comic_project
status: drafting
title: "女帝登基悔婚，跪求我修复龙脉"
genre: "玄幻/古装/复仇"
aspect_ratio: "16:9"
resolution: "1920x1080"
total_episodes: 10
vision: |
  古风东方玄幻美学。龙/凤图腾为核心视觉符号。
  金色（龙）与赤红（凤/火）为主色调。
  冷暖交替推进情绪节奏：回忆暖金→现实冷黑→真相曝光时冰蓝龙息。
  角色设计风格：写实美型，参照《长安三万里》的古风画卷感+
  《凡人修仙传》的角色精致度。
global_style_postfix: >
  Ancient Chinese fantasy donghua style, inspired by Chang'an San Wan Li
  and A Record of a Mortal's Journey to Immortality character design quality.
  Cinematic lighting, 4K, hyper-detailed, clean linework, rich color palette,
  gold and crimson accent tones, volumetric lighting, depth of field,
  ornate ancient Chinese costumes and architecture.
---

## 视觉风格

- **风格方向**：写实美型国风 — 介于《长安三万里》的场景质感和《凡人修仙传》的角色精细度之间
- **世界观**：东方玄幻 — 龙族、凤族、人族共存，宗庙皇权与妖族海患
- **色调**：回忆暖金→现实玄黑→真相冰蓝，冷暖交替
- **运镜风格**：电影感推拉摇移，多用 Dolly in / Crane up 增强史诗感

## 角色关系

- **陆然**：真龙化身，外表 20 岁青年，实为千年龙族。右角残缺，气质慵懒但实力深不可测
- **云璃**：大玄女帝，20 岁。天凤法相（左翼曾残缺，后由陆然修复）。从恨到悔的情感弧线
- **玄微**：国师，外表仙风道骨实为阴谋家。月白法袍，手持拂尘
- **莫雨**：大玄剑神，陆然徒弟。因被篡改记忆而"背刺"恩师

## 分集大纲

| 集数 | 核心事件 | 关键情绪 |
|------|---------|---------|
| EP01 | 云璃登基，下令熔炼陆然，婚碑投射光幕 | 悬念/背叛 |
| EP02 | 光幕揭陆然救云璃、龙血疗伤 | 震惊 |
| EP03 | 光幕揭玄文帝杀女、陆然抚养三年 | 崩溃 |
| EP04 | 光幕揭噬心咒转移、云璃采药 | 动摇 |
| EP05 | 光幕揭树妖之战、陆然以命换命 | 心痛 |
| EP06 | 光幕揭龙鳞制剑鞘、收莫雨为徒 | 悔恨 |
| EP07 | 光幕揭天凤求血晶、断角换血脉 | 彻底崩溃 |
| EP08 | 光幕揭皇室血祭、陆然救驾 | 反转 |
| EP09 | 真相：玄微篡改记忆、幕后黑手 | 愤怒 |
| EP10 | 陆然出关、龙脉修复、海底妖族平定 | 释然/团圆 |
```

---

## 阶段 C：角色圣经 (Character Bible)

每个 P0/P1 角色创建独立 `comic_character` 文档。

### 角色文档模板

```yaml
---
category: comic_character
status: drafting
title: "成年云璃 — 大玄女帝"
visual_brief: "20岁女帝，玄黑衮服，帝冕垂珠，冷艳威严，背后有残缺左翼的赤金天凤法相"
visual_detailed: |
  20岁女性，身高 170cm，体态修长挺拔。
  面容：瓜子脸，丹凤眼（眼尾微挑），剑眉，唇色淡朱，肤色白皙如瓷。
  发型：高髻盘发，金簪凤冠，帝冕垂十二旒珠。
  服饰：玄黑底绣金凤纹衮服，宽袖曳地，腰束赤金玉带，肩披黑纱云肩。
  气质：冷艳威严，但眼底深处藏有一丝不安与困惑。
  标志物：背后浮现半透明赤金凤凰法相，左翼残缺，金光流转。
  光影：正面冷白光 + 底部赤金暖光（凤火映照）。
prompt: >
  Full body portrait of a 20-year-old Chinese empress, tall and slender,
  wearing an ornate black imperial robe with golden phoenix embroidery,
  twelve-tassel crown with jade beads hanging before her face.
  Her expression is cold and regal, phoenix eyes slightly narrowed.
  Behind her, a translucent golden phoenix apparition with a torn left wing
  glows with crimson-gold light. Standing before an ancient stone tablet
  engraved with dragon patterns. Cold white key light from above,
  warm golden rim light from below. Ancient Chinese fantasy donghua style,
  cinematic lighting, 4K, hyper-detailed.
negative_prompt: >
  blurry, low quality, distorted, deformed, ugly, bad anatomy,
  extra limbs, missing fingers, modern clothing, text, watermark
voice_profile: |
  青年女声，清冷中带威严，语速中等偏慢。
  关键情感变化：
  - EP01-03: 冰冷决绝（"拿下""砸碎此碑"）
  - EP04-07: 动摇困惑（"怎么会这样"）
  - EP08-10: 悔恨哽咽（"哥哥…"）
  TTS 参考音色：清亮女中音，略带磁性震颤，适合表达隐忍的悲伤。
refs:
  image:
    "@style:donghua":
      - refs/donghua_style_ref.png
    "@ref:yun_li_child":
      - refs/yun_li_child_concept.png

# ═══ 双 approved 资产 ← 由管线阶段三填充 ═══
approved_concept: null      # ← Step 3A.1 完成后填入概念图路径
                             #    e.g. elements/characters/yun_li_concept.png
approved_turnaround: null   # ← Step 3A.2 完成后填入三视图路径
                             #    e.g. elements/characters/yun_li_turnaround.png
---
```

### ⚠️ 角色资产引用规范

当其他文档需要引用角色视觉时，按以下规则选择 approved 资产：

| 引用场景 | 选择 | 理由 |
|---------|------|------|
| 分镜生图（场景角色合成） | `approved_concept`（概念图） | 含光影/氛围信息，利于合成融合 |
| 角色风格一致性校验 | `approved_turnaround`（三视图） | 干净的多角度参考，便于精确比对 |
| next-scene 镜头衔接 | `approved_concept` | 需要与首帧/尾帧风格一致 |
| 海报/封面生成 | `approved_concept` | 需要完整画面效果 |
| 服装/道具参考 | `approved_turnaround` | 清晰展示细节 |

**引用语法**：
```yaml
# 引用概念图
refs:
  image:
    "@yun_li:concept": [elements/characters/yun_li_concept.png]

# 引用三视图
refs:
  image:
    "@yun_li:turnaround": [elements/characters/yun_li_turnaround.png]

# 引用人物描述（文本参考）
refs:
  text:
    "@yun_li": [@yun_li_adult.md]
```

### 角色声线描述指南

`voice_profile` 字段用于 TTS 生成参考：

| 要素 | 描述词库 |
|------|---------|
| 性别 | 男声/女声/中性 |
| 年龄段 | 少年(12-17)/青年(18-30)/中年(31-50)/老年(50+) |
| 音色 | 清亮/低沉/沙哑/磁性/圆润/尖锐/柔美 |
| 语速 | 快/中等偏快/中等/中等偏慢/慢 |
| 情感基调 | 威严/温柔/冰冷/热情/阴险/天真/沧桑 |
| 特殊标记 | 带哭腔/气声/耳语/咆哮/颤抖 |

**示例声线描述**：

```yaml
# 陆然
voice_profile: |
  青年男声，低沉有磁性，慵懒随性，语速中等偏慢。
  日常状态带有漫不经心的调侃感，关键时刻转为冰冷威严。
  EP06 树妖战中转为沙哑怒吼。

# 玄微
voice_profile: |
  中年男声，圆滑中带阴冷，语速中等。
  公开场合仙风道骨、慈眉善目，私下转为阴鸷尖锐。
  标志性冷笑声："呵……"

# 莫雨
voice_profile: |
  青年女声，清冷寡淡，语速偏快。
  声音像剑锋划过冰面——干净、锋利、不带多余情感。
  第九集真相揭露后出现颤抖哽咽。
```

---

## 阶段 D：场景设计 (Scene Design)

### 场景文档模板

```yaml
---
category: comic_scene
status: drafting
title: "宗庙禁地 — 婚碑广场"
time_of_day: "day"
mood: "庄严压抑"
visual_detailed: |
  大玄皇族宗庙禁地，开阔的青石广场中央矗立着巨大的龙凤婚碑。
  碑身高达三丈，龙纹隐泛金芒。广场四周是参天古柏，
  禁军刀戟林立，黑色军旗猎猎作响。天空阴沉，云层压得很低。
prompt: >
  Ancient Chinese imperial temple courtyard, vast open plaza paved with
  weathered grey stone. A massive three-zhang tall stone tablet stands at
  center, carved with intertwined dragon and phoenix motifs, faint golden
  glow pulsing from the engravings. Ancient cypress trees frame the square,
  imperial guards in black armor with halberds lining the perimeter.
  Overcast sky with low hanging clouds, oppressive atmosphere.
  Ancient Chinese fantasy donghua style, cinematic wide establishing shot,
  4K, hyper-detailed, volumetric god rays breaking through clouds.
refs:
  image:
    "@style:donghua":
      - refs/donghua_style_ref.png
    "@ref:temple_arch":
      - refs/chinese_temple_ref.png
---

## Vision
婚碑广场是全剧核心场景。它既是陆然与云璃婚约的象征，也是龙脉与妖族封印的关键。
视觉上需要体现"神圣感+压抑感"的冲突——金光与黑甲的对比。

## Design References

### image
![style_ref](refs/donghua_style_ref.png)
![temple_ref](refs/chinese_temple_ref.png)
```

### ⚠️ 场景 refs 约束

**场景定档的 refs 只能引用风格参考，绝不能引用角色**。理由：画一座庙宇不需要先知道谁会出现在里面。

```yaml
# ✅ 正确
refs:
  image:
    "@style:donghua": [refs/style.png]
    "@ref:temple_arch": [refs/temple.png]

# ❌ 错误 — 场景引用了角色
refs:
  image:
    "@yun_li_adult": [...]    # 这个角色会出现在场景中，但不是画场景的视觉依赖
```

---

## 提示词工程 (Prompt Engineering)

### 漫剧专用词汇库

#### 中国古风建筑
```
imperial palace, temple hall, pavilion, courtyard, stone plaza,
ancient cypress, vermilion pillars, golden roof tiles, jade steps,
dragon carving, phoenix mural, incense burner, bronze tripod
```

#### 玄幻元素
```
dragon apparition, phoenix spirit, golden aura, crimson flames,
ice-blue dragon breath, jade pendant, spirit vein, runic circle,
floating talismans, energy vortex, dimensional rift
```

#### 光影氛围
```
volumetric god rays, rim light, backlight silhouette, chiaroscuro,
dramatic shadows, warm golden hour, cold moonlight, flickering torchlight,
ethereal glow, bioluminescent particles, dust motes in sunbeams
```

#### 运镜术语（用于 visual_detailed）
```
wide establishing shot, medium shot, close-up, extreme close-up,
low angle, high angle, Dutch angle, over-the-shoulder,
deep focus, shallow depth of field, rack focus
```

#### 角色设计术语
```
character turnaround, full body, three-quarter view, profile,
facial expression sheet, costume design, prop design,
dynamic pose, action stance, resting pose
```

### 负向提示词通用模板

```yaml
negative_prompt: >
  blurry, low quality, distorted, deformed, ugly, bad anatomy,
  extra limbs, missing fingers, fused fingers, too many fingers,
  long neck, mutation, poorly drawn face, cloned face,
  modern clothing, text, watermark, signature, artist name,
  jpeg artifacts, oversaturated, overexposed
```

## 交接

完成创作后输出：

```
📋 COMIC CREATIVE HANDOFF
episode:     "EP01"
created:     ["@yun_li_adult.md", "@lu_ran.md", "@xuan_wei.md", "@temple.md", "@sea_shore.md"]
modified:    []
script_bd:   "9 角色提取 | 5 场景提取 | 10 集大纲"
refs_check:  "DAG valid — 7 nodes, 0 cycles, 2 layers"
next:        "Guardian, please validate comic character/scene assets"
```

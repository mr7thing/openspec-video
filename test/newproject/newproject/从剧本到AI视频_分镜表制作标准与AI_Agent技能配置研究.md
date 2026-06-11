# 从剧本到AI视频：分镜表制作标准与AI Agent技能配置研究

## TL;DR

从剧本或故事制作适用于AI视频生成的分镜表，核心是将叙事文本转化为结构化的镜头级视觉指令。一个完整的分镜表必须包含：**场景分解、资产登记（角色/道具/场景）、镜头设计（景别/角度/运镜/构图）、视觉描述、转场标注、AI提示词输出**六大模块。行业通行的标准流程是五阶段pipeline——剧本输入→场景分解→资产登记→镜头设计→AI提示输出，并在全程嵌入**资产先行（Asset-First）**和**时间桥接（Temporal Bridge）**两个一致性机制。PenShot、CoAgent等开源多Agent系统已证明，基于LangGraph的** Supervisor架构**配合向量化记忆，是实现剧本→分镜→AI提示词自动生成的最佳技术路线。本文提供完整的分镜表JSON Schema、镜头语言术语体系、以及可直接部署的AI Agent技能配置。

---

## 1. 分镜表的核心概念与行业标准

### 1.1 分镜表与拍摄清单的关系

在影视制作领域，**Storyboard（故事板/分镜图）**和**Shot List（拍摄清单/分镜表）**是两个互补但不同的工具。[^17^] Storyboard是视觉化的——通过手绘或AI生成的静态画面展示每个镜头的构图；而Shot List是文本化的——以表格形式逐行记录每个镜头的元数据。对于AI视频生成工作流而言，Shot List比传统Storyboard更为关键，因为AI视频模型的输入是文本提示词（prompt）而非图像，每个镜头都需要被精确地转译为一组结构化的语言指令。

传统影视制作中，一个90分钟的故事片包含**400-1500个镜头**，一部10分钟的短片约**60-120个镜头**，一段30秒的广告约**10-20个镜头**。[^17^] 在AI视频生成中，由于当前主流模型（如Kling、Runway Gen-4、Sora）的单次生成时长限制在5-15秒之间，同样的叙事内容需要被切分成更多片段。这意味着分镜表的颗粒度需要更细，每个条目的描述精度需要更高。

### 1.2 分镜表的七个核心字段

根据行业标准（StudioBinder、mStudio、Boords等平台共识），一个专业的Shot List至少包含以下**七个核心列**。[^28^]

| 字段 | 说明 | 示例 |
|------|------|------|
| **Scene #** | 场景编号，与剧本场景对应 | 3 |
| **Shot ID** | 唯一标识，格式为"场景号+字母" | 3A, 3B, 3C |
| **Shot Type** | 景别（Shot Size），用标准缩写 | WS, MS, MCU, CU, ECU |
| **Camera Angle** | 机位角度 | eye-level, low angle, high angle |
| **Camera Movement** | 运镜方式 | static, pan, dolly, tracking |
| **Action/Dialogue** | 镜头内动作或对白摘要 | "Anna pours coffee, looks out window" |
| **Duration** | 预估时长（秒） | 5s |

在此基础上，专业制作还会增加**三个高级列**。[^28^]

| 字段 | 说明 |
|------|------|
| **Lens/Focal Length** | 镜头焦段（35mm, 50mm, 85mm），影响景深和透视 |
| **Priority** | 拍摄优先级（must-have / nice-to-have），用于进度压缩决策 |
| **Equipment** | 所需设备（tripod, dolly, drone, Steadicam） |

对于AI视频生成场景，这十个字段需要被进一步扩展和转译。AI模型无法理解"35mm lens"的物理含义，但可以通过"shallow depth of field, cinematic 35mm lens look"等描述词获得近似效果。这要求分镜表在传统字段基础上增加**AI提示词专用输出列**。

### 1.3 AI视频生成场景下的字段扩展

将传统分镜表适配到AI视频生成工作流，需要在原有10个字段基础上增加以下6个关键列。

| 字段 | 说明 | AI视频用途 |
|------|------|-----------|
| **Visual Description** | 详细的视觉画面描述 | 直接用于T2V/T2I prompt的Scene部分 |
| **Subject Block** | 主体描述（含角色ID引用） | 确保角色一致性，引用asset registry |
| **Negative Prompt** | 负面提示词 | 排除不想要的元素 |
| **Reference Image URL** | 参考图/角色图URL | I2V/I2I模式下的视觉锚点 |
| **Transition to Next** | 至下一镜头的过渡方式 | 控制剪辑节奏 |
| **AI Model Notes** | 模型特定参数 | 如Kling的storyboard mode, Sora的character refs |

这16个字段构成了面向AI视频生成的**完整分镜表标准**。下文将详细展开每个字段的填写规范和数据结构。

---

## 2. 从剧本到分镜表：五阶段制作流程

### 2.1 阶段一：剧本输入与解析

AI视频分镜制作的第一步是剧本解析。输入可以是多种格式：**标准 screenplay（Final Draft/Fountain格式）、小说片段、故事大纲、或者一个简单的故事概念**。PenShot等开源工具已经证明，LLM可以有效识别任意格式文本中的场景边界、角色对话和动作描述。[^38^]

解析的核心任务是提取以下四类信息：

- **Scene Headers（场景标题）**：标识场景切换，通常包含地点（INT./EXT.）、具体位置和时间段（DAY/NIGHT）
- **Action Lines（动作描述）**：描述角色动作和环境状态的段落
- **Dialogue（对话）**：角色对白，需要标注说话人
- **Transition Lines（转场标注）**：如CUT TO:, FADE IN:, DISSOLVE TO: 等

对于AI视频生成而言，剧本解析的精度直接影响后续分镜质量。一个关键的技术细节是**场景内的镜头级切分**——将一段动作描述拆分为多个shot。例如，"她走进房间，环顾四周，然后在桌前坐下"这一行动作描述，应当被切分为三个独立的镜头：EWS建立房间空间、MS环顾动作、MS坐下动作。

### 2.2 阶段二：场景分解

场景分解（Scene Breakdown）是将剧本转化为可拍摄/可生成单元的过程。传统影视中，这一步由First AD（第一副导演）手动完成，耗时**40-100小时/部长片**。[^57^] AI工具（如Filmustage）可将此过程压缩至**几分钟**，准确率达**98%**。[^57^]

场景分解的输出是一个**场景清单（Scene List）**，每个场景包含以下元数据。

| 元数据 | 说明 |
|--------|------|
| Scene ID | 唯一标识符（如S01, S02） |
| Location | 场景地点 |
| Time of Day | 时间段（日/夜/黄昏/黎明） |
| Characters Present | 出场角色列表 |
| Key Props | 关键道具 |
| Duration Estimate | 预估总时长 |
| Mood/Tone | 情绪基调 |

场景分解的一个重要原则是**场景与镜头的区分**。一个"场景"（Scene）是叙事上连续发生在一个时间和地点的事件单元，可以包含多个"镜头"（Shot）。在AI视频生成中，每个场景通常需要3-8个镜头来完整覆盖。

### 2.3 阶段三：资产登记（Asset Registry）

资产登记是AI视频生成分镜表区别于传统分镜表的核心特征。传统拍摄中，演员、道具、场景都是物理存在的；AI视频生成中，所有"演员"和"场景"都需要被**从零定义**并**保持一致**。

#### 2.3.1 角色资产（Character Assets）

每个角色需要一个**Character Sheet（角色卡）**，包含以下信息。[^23^]

```json
{
  "character_id": "char_anna",
  "name": "Anna",
  "role": "protagonist",
  "physical_description": "Early 30s, olive skin, dark wavy hair just past shoulder, sharp jawline, athletic build",
  "wardrobe": "Worn brown leather jacket over white t-shirt, dark jeans, scuffed boots",
  "distinctive_features": "Small scar above left eyebrow, silver ring on right hand",
  "reference_images": ["url1", "url2", "url3"],
  "visual_notes": "Neutral lighting preferred for reference shots, front/3-quarter/side views",
  "arc_notes": "Starts confident, becomes increasingly disheveled through Act 2"
}
```

**"Asset-First"策略**（BITS Pilani "Lights, Camera, Consistency"论文提出[^22^]）要求：**在生成任何场景之前，先为每个角色生成3-5张参考图**（正面、3/4侧面、侧面、全身），这些图像作为视觉锚点（visual anchor）被后续所有场景引用。实验证明，移除这一机制会导致角色一致性评分从**7.99暴跌至0.55**（满分10分）。[^22^]

#### 2.3.2 道具资产（Prop Assets）

道具资产记录需要在多个场景中重复出现的物品。

```json
{
  "prop_id": "prop_locket",
  "name": "Silver Locket",
  "description": "Antique oval silver locket on a delicate chain, engraved with floral pattern",
  "first_appearance": "S01-02",
  "key_scenes": ["S01-02", "S03-05", "S05-12"],
  "visual_notes": "Should catch light in close-ups, interior shows tiny portrait"
}
```

#### 2.3.3 场景资产（Location Assets）

场景资产定义故事发生的空间环境。

```json
{
  "location_id": "loc_cafe",
  "name": "Midnight Diner",
  "description": "1950s-style all-night diner, red vinyl booths, neon sign in window, checkerboard floor",
  "lighting": "Warm tungsten overhead lights, cool blue neon glow from sign, streetlight through window",
  "time_variants": ["night_busy", "night_empty", "pre_dawn"],
  "reference_images": ["url1", "url2"]
}
```

### 2.4 阶段四：镜头设计

镜头设计是分镜表制作的核心环节，需要为每个镜头确定**景别（Shot Size）、机位角度（Camera Angle）、运镜方式（Camera Movement）、构图（Composition）、灯光（Lighting）、时长（Duration）**六大要素。

#### 2.4.1 景别体系

景别是镜头设计中最基础也是最重要的决策。以下是完整的景别标准体系，已验证可用于AI视频提示词。[^64^][^62^]

| 缩写 | 全称 | 画面范围 | 主体占画面比例 | AI Prompt关键词 | 情感/叙事功能 |
|------|------|---------|--------------|----------------|------------|
| **EWS** | Extreme Wide Shot | 环境主导，主体极小 | 1-5% | "extreme wide shot, establishing landscape, tiny subject in frame" | 建立地理空间、史诗感、孤独感 |
| **WS** | Wide Shot | 全身+环境 | 15-30% | "wide shot, full body visible, subject with environmental context" | 动作展示、空间关系 |
| **MWS** | Medium Wide Shot | 膝盖以上 | 30-50% | "medium wide shot, knees up" | 双人镜头、西部片经典 |
| **MS** | Medium Shot | 腰部以上 | 50-70% | "medium shot, waist up" | 对话标准景别 |
| **MCU** | Medium Close-Up | 胸部以上 | 60-75% | "medium close-up, chest up" | 访谈、情感表达 |
| **CU** | Close-Up | 头部和肩膀 | 70-85% | "close-up, head and shoulders" | 情绪高潮、反应镜头 |
| **ECU** | Extreme Close-Up | 单一细节 | 85-100% | "extreme close-up, eyes only" | 极致紧张、关键细节 |
| **OTS** | Over-the-Shoulder | 过肩 | 可变 | "over the shoulder shot, foreground subject back of head" | 对话覆盖 |
| **POV** | Point of View | 角色视角 | 可变 | "POV shot, seeing through character's eyes" | 主观体验 |

![景别对比图](assets/shot-sizes-chart.png)

> **AI提示词最佳实践**：在prompt中直接命名景别（如"medium shot"）比用形容词描述（如"show the person from waist up"）效果更好。AI视频模型在训练数据中已将"medium shot"与特定的画面构图建立了强关联。[^62^]

#### 2.4.2 机位角度

机位角度决定观众与主体的心理关系。

| 角度 | 说明 | 情感效果 | AI Prompt关键词 |
|------|------|---------|----------------|
| **Eye Level** | 平视，摄影机与主体眼睛同高 | 中性、自然、平等 | "eye-level shot" |
| **Low Angle** | 仰拍，摄影机低于主体 | 力量、威胁、崇高 | "low angle shot looking up" |
| **High Angle** | 俯拍，摄影机高于主体 | 脆弱、弱小、审视 | "high angle shot looking down" |
| **Dutch Angle** | 斜拍，地平线倾斜 | 不安、失衡、心理混乱 | "dutch angle, tilted horizon" |
| **Bird's Eye** | 鸟瞰，正上方 | 全知、命运、疏离 | "bird's eye view, top-down" |
| **Worm's Eye** | 虫视，正下方 | 压迫、宏大、危险 | "worm's eye view, looking straight up" |

#### 2.4.3 运镜方式

运镜是AI视频生成中最具挑战性的维度。当前主流模型对单一运镜的遵循度较好，但对复合运镜（如"dolly in while tilting up"）的理解仍有局限。[^47^]

| 运镜 | 动作描述 | 叙事用途 | AI Prompt写法 |
|------|---------|---------|--------------|
| **Static** | 固定机位 | 稳定、观察、戏剧性停顿 | "static camera, locked off" |
| **Pan** | 水平摇摄 | 环境展示、跟随主体 | "slow pan right across the scene" |
| **Tilt** | 垂直摇摄 | 高度揭示、强调规模 | "tilt up from ground to reveal" |
| **Dolly In** | 推轨靠近 | 情绪聚焦、揭示细节 | "slow dolly in toward subject" |
| **Dolly Out** | 拉轨远离 | 环境展开、孤立感 | "dolly out to reveal wider scene" |
| **Tracking** | 跟拍 | 动作跟随、沉浸感 | "handheld tracking shot following subject" |
| **Crane** | 升降 | 史诗揭示、空间转换 | "crane shot rising above" |
| **Zoom** | 变焦 | 强调、紧迫感 | "slow zoom in on subject's face" |
| **Handheld** | 手持 | 纪实感、紧张、混乱 | "handheld camera, slight shake" |
| **Steadicam** | 稳定器 | 流畅移动、梦幻感 | "smooth steadicam movement" |

**AI视频运镜提示的黄金法则**。[^47^][^44^]

1. **每段prompt只指定一种主要运镜**，避免堆叠多个运动指令
2. **将运镜描述放在prompt前半部分**，模型对前置的相机指令响应更好
3. **使用节奏修饰词**："slow", "smooth", "cinematic"等词能显著改善运动质感
4. **I2V（图生视频）模式下，只需描述运动**，不需要重复描述画面内容

### 2.5 阶段五：AI提示词输出

分镜表的最终输出必须能被直接送入AI视频模型。目前业界已形成**六段式提示词结构**的标准。[^44^]

```
SUBJECT: [主体 + 1-2个定义性特征]
ACTION: [单一清晰的动作节拍 + 微表情/微动作]
SCENE: [地点 + 背景细节 + 前景道具]
CAMERA: [景别 + 角度 + 运镜]
LIGHT: [时间段/光源 + 软硬光 + 情绪]
STYLE: [视觉风格 + 色调 + 类型]
```

以Kling模型为例，其推荐的三段式格式为。[^31^]

```
[Scene]: 场景描述，包含环境、主体位置、氛围
[Style]: 视觉风格，如cinematic, photorealistic, anime等
[Motion]: 运动和运镜描述
```

对于图生视频（I2V）模式，提示词结构进一步简化。[^44^]

```
SUBJECT: [图中应保持主体的什么特征]
ACTION: [主体的主要运动]
BACKGROUND: [背景内容]
BACKGROUND MOVEMENT: [背景运动，如风、行人、车流]
CAMERA: [景别 + 运镜]
```

---

## 3. 分镜表数据结构（JSON Schema）

基于上述分析，以下是面向AI视频生成的**完整分镜表JSON Schema**，兼容Veo 3、Kling、Runway Gen-4、Sora等主流模型的输入格式。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AI Video Storyboard",
  "type": "object",
  "properties": {
    "project": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "genre": { "type": "string" },
        "style": { "type": "string" },
        "target_duration": { "type": "number" },
        "aspect_ratio": { "type": "string", "enum": ["16:9", "9:16", "1:1", "4:3"] },
        "target_model": { "type": "string", "enum": ["veo-3", "kling-3", "runway-gen4", "sora", "hailuo"] }
      }
    },
    "characters": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "character_id": { "type": "string" },
          "name": { "type": "string" },
          "physical_description": { "type": "string" },
          "wardrobe": { "type": "string" },
          "distinctive_features": { "type": "string" },
          "reference_images": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "location_id": { "type": "string" },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "lighting": { "type": "string" },
          "reference_images": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "props": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "prop_id": { "type": "string" },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "first_appearance": { "type": "string" }
        }
      }
    },
    "scenes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "scene_id": { "type": "string" },
          "scene_number": { "type": "integer" },
          "location_id": { "type": "string" },
          "time_of_day": { "type": "string" },
          "mood": { "type": "string" },
          "characters_present": { "type": "array", "items": { "type": "string" } },
          "shots": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "shot_id": { "type": "string" },
                "shot_number": { "type": "integer" },
                "shot_type": { "type": "string", "enum": ["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "INSERT"] },
                "camera_angle": { "type": "string" },
                "camera_movement": { "type": "string" },
                "duration": { "type": "number" },
                "visual_description": { "type": "string" },
                "subject_block": { "type": "string" },
                "action": { "type": "string" },
                "scene_context": { "type": "string" },
                "lighting": { "type": "string" },
                "style": { "type": "string" },
                "dialogue": { "type": "string" },
                "negative_prompt": { "type": "string" },
                "reference_images": { "type": "array", "items": { "type": "string" } },
                "transition_to_next": { "type": "string" },
                "connect_to_next": { "type": "boolean" },
                "ai_prompt": { "type": "string" },
                "audio_notes": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 4. 资产复用与一致性管理

### 4.1 角色一致性：核心挑战

AI视频生成中最普遍的技术故障是**角色身份漂移（Identity Drift）**——同一个角色在不同镜头中出现外貌差异。[^23^] 这是因为大多数AI视频模型独立生成每个场景，没有"记忆"之前输出的能力。解决这一问题需要系统级的**一致性管理策略**。

| 策略 | 方法 | 一致性等级 | 复杂度 |
|------|------|-----------|--------|
| **Prompt Template锁定** | 在每个prompt中重复完全相同的角色描述块 | 低 | 低 |
| **Image-to-Video** | 使用角色参考图作为每段视频的起始帧 | 中 | 低 |
| **Keyframe Stitching** | 前一段的最后一帧作为下一段的起始帧 | 高 | 中 |
| **Character Sheet引用** | 生成3-5张角色参考图，每段视频引用 | 高 | 中 |
| **Composite Pipeline** | 角色和背景分开生成，后期合成 | 最高 | 高 |

**Temporal Bridge（时间桥接）**策略是目前学术界验证最有效的方案。[^22^] 其核心机制是：第N个场景的**最后一帧**作为第N+1个场景的**条件输入**，通过I2I（图生图）模型生成第N+1个场景的起始帧，再用I2V模型生成视频片段。这种帧链式传递确保了时间线上的视觉连续性。

### 4.2 资产复用规则

分镜表需要建立明确的资产复用规则，避免重复定义导致的冲突。

| 资产类型 | 复用规则 | 变更标记 |
|---------|---------|---------|
| 角色外貌 | 全局一致，除非剧本明确标注变化 | `wardrobe_change`, `disheveled` |
| 角色服装 | 按场景标注，可随剧情变化 | `outfit_variant_1`, `outfit_variant_2` |
| 场景环境 | 同一location_id在不同时间可有时间变体 | `time_variant: "night_empty"` |
| 道具 | 首次出现需完整描述，后续引用prop_id | `first_appearance` vs `recurring` |

---

## 5. 转场与过渡类型

转场（Transition）是镜头之间的连接方式，直接影响叙事节奏和观众的心理体验。在AI视频生成中，转场分为两类：**生成时转场**（由AI模型在生成片段时实现）和**后期转场**（在剪辑阶段添加）。

### 5.1 基础转场类型

| 转场 | 视觉效果 | 叙事功能 | AI生成提示 |
|------|---------|---------|-----------|
| **Cut** | 直接切换 | 标准叙事、节奏推进 | 无需特殊提示，默认 |
| **Dissolve** | 渐隐渐显 | 时间流逝、回忆、情绪转换 | "cross dissolve transition" |
| **Fade In/Out** | 淡入/淡出 | 段落开始/结束 | "fade in from black", "fade out to black" |
| **Wipe** | 擦除 | 地点转换、 energetic | "wipe transition left to right" |
| **Match Cut** | 匹配剪辑 | 视觉隐喻、概念连接 | 需在分镜表中标注匹配元素 |
| **Jump Cut** | 跳切 | 时间压缩、紧张感 | 同机位不同时间的连续画面 |

### 5.2 声音转场

| 转场 | 机制 | 效果 |
|------|------|------|
| **J-Cut** | 下一段音频先入，画面后切 | 引导观众预期 |
| **L-Cut** | 画面已切，上段音频延续 | 声音桥接，平滑过渡 |
| **Sound Bridge** | 用声音元素（如音乐、音效）连接两段 | 主题统一 |

在分镜表中，每个镜头的`transition_to_next`字段应标注转场类型，音频相关的转场在`audio_notes`中说明。

---

## 6. AI Agent实现方案

### 6.1 多Agent架构设计

基于PenShot[^38^]和CoAgent[^101^]的开源实践，面向分镜制作的AI Agent最优架构是**Supervisor模式**的多Agent系统。

| Agent角色 | 职责 | 输入 | 输出 |
|----------|------|------|------|
| **Script Parser** | 剧本解析，识别场景/角色/动作 | 原始剧本文本 | 结构化场景列表 |
| **Scene Designer** | 场景分解，确定每个场景的shots | 场景列表 | Shot级分解方案 |
| **Asset Manager** | 角色/道具/场景资产定义 | 场景分解 | Asset Registry (JSON) |
| **Cinematography Agent** | 镜头设计（景别/角度/运镜） | Asset Registry + Scene | 每个shot的camera spec |
| **Prompt Engineer** | 生成AI视频可用提示词 | Camera spec + Asset | 完整AI prompt |
| **Continuity Checker** | 一致性校验 | 全部分镜 | 一致性报告+修复建议 |
| **Validator** | 格式验证和完整性检查 | 分镜表JSON | 验证报告 |

### 6.2 记忆机制

连续性保障需要三级记忆系统。[^38^]

| 记忆层级 | 存储内容 | 检索方式 |
|---------|---------|---------|
| **短期记忆** | 当前scene的上下文 | 直接注入prompt |
| **中期记忆** | 相邻shots的衔接信息 | Temporal Bridge帧传递 |
| **长期记忆** | 全局资产定义和角色卡 | Chroma向量检索 |

### 6.3 输出格式

AI Agent的最终输出应支持多种格式，以适配不同工作流。

| 格式 | 用途 | 适用场景 |
|------|------|---------|
| **JSON** | 结构化数据，可被程序直接解析 | 自动化pipeline |
| **Markdown表格** | 人工审阅和编辑 | 创作阶段 |
| **CSV** | 导入Excel/Google Sheets | 制片管理 |
| **Fountain** | 与专业编剧软件兼容 | 剧本迭代 |

---

## 7. 现有工具与平台对比

| 工具/平台 | 核心功能 | 分镜输出 | AI视频兼容 | 开源 | 适用场景 |
|----------|---------|---------|-----------|------|---------|
| **PenShot**[^38^] | 剧本→分镜→AI提示 | JSON prompts | Sora/Veo/Runway/Kling | 是 | 开发者集成 |
| **CoAgent**[^101^] | 多Agent协作分镜规划 | JSON + keyframes | ff2v/flf2v模式 | 是 | 学术研究 |
| **mStudio**[^4^] | 全pipeline: 剧本→分镜→animatic→视频 | 内置 | 内置生成 | 否 | 独立创作者 |
| **Boords**[^15^] | AI storyboard生成 | 图片+PDF | API导出 | 否 | 团队协作 |
| **LTX Studio**[^80^] | AI视频制作平台 | 内置 | 内置生成 | 否 | 端到端制作 |
| **Filmustage**[^57^] | AI剧本分解 | Breakdown sheets | 间接 | 否 | 传统制片 |
| **StudioBinder**[^58^] | 行业标准制片工具 | Shot list + Call sheet | 间接 | 否 | 专业制片 |

---

## 8. 推荐书籍与参考资料

| 书名 | 作者 | 核心内容 | 适用环节 |
|------|------|---------|---------|
| *电影语言的语法* | 丹尼艾尔·阿里洪 | 镜头组接规则、轴线、视线匹配 | 镜头设计 |
| *分镜头脚本设计* | 温迪·特米勒罗 | 分镜绘制技巧、从文字到图像 | 分镜制作 |
| *分镜头脚本设计教程* | 乔瑟·克里斯提亚诺 | 镜头语言、叙事蒙太奇 | 镜头设计 |
| *Cinematography* | Blain Brown | 构图、景别、运镜、光线 | 全面参考 |
| *The Five C's of Cinematography* | Joseph Mascelli | 镜头、连续性、剪辑、对比、构图 | 经典教材 |
| *故事：材质、结构、风格和银幕剧作的原理* | 罗伯特·麦基 | 剧本结构、场景设计 | 剧本分析 |

---

## 9. 完整示例：从故事片段到分镜表

### 输入故事

> 深夜， Anna独自坐在一个老旧的 diner 里。她面前的咖啡已经凉了。门铃响了，一个陌生男人走进来，在她对面坐下。Anna 紧张地握紧了咖啡杯。

### 输出分镜表（Markdown格式）

| Shot ID | Scene | Shot Type | Angle | Movement | Duration | Visual Description | AI Prompt | Transition |
|---------|-------|-----------|-------|----------|----------|-------------------|-----------|------------|
| S01-01 | S01 | EWS | Eye Level | Static | 4s | Empty diner interior, neon glow, rain outside window | "Extreme wide shot, empty 1950s diner at night, red vinyl booths, neon sign glowing, rain on windows, moody atmosphere, cinematic" | Cut |
| S01-02 | S01 | MS | Eye Level | Static | 5s | Anna sitting alone at booth, cold coffee cup in front of her | "Medium shot, woman early 30s olive skin dark wavy hair, wearing worn brown leather jacket, sitting alone in diner booth, cold coffee cup, contemplative expression, warm tungsten light" | Cut |
| S01-03 | S01 | ECU | Eye Level | Static | 3s | Anna's hand on the coffee cup, fingers tense | "Extreme close-up, woman's hand on white ceramic coffee cup, fingers slightly tense, warm lighting, shallow depth of field" | Cut |
| S01-04 | S01 | CU | Low Angle | Static | 2s | Door opens, bell rings (implied by action) | "Close-up, diner door opening from inside, bell above door, low angle, silhouette of person entering, backlit by streetlight" | Cut |
| S01-05 | S01 | WS | Eye Level | Tracking | 5s | Stranger walks through diner, sits across from Anna | "Wide shot, man in dark trench coat walking through diner toward camera, sits down across from woman at booth, smooth tracking shot, cinematic lighting" | Cut |
| S01-06 | S01 | OTS | Eye Level | Static | 4s | Over Anna's shoulder, looking at stranger | "Over-the-shoulder shot, woman's shoulder in foreground, man sitting across booth, face partially shadowed, tense atmosphere" | Cut |
| S01-07 | S01 | MCU | Eye Level | Slow Dolly In | 5s | Anna's face, tension building, gripping cup tighter | "Medium close-up, woman's face showing rising tension, slow dolly in, hand gripping coffee cup tighter, dramatic shadows, cinematic" | Fade Out |

### 对应的JSON输出

```json
{
  "project": {
    "title": "Midnight Diner Encounter",
    "genre": "noir thriller",
    "style": "cinematic noir, low-key lighting, desaturated",
    "target_duration": 28,
    "aspect_ratio": "16:9",
    "target_model": "kling-3"
  },
  "characters": [
    {
      "character_id": "char_anna",
      "name": "Anna",
      "physical_description": "Early 30s, olive skin, dark wavy hair past shoulder, sharp jawline",
      "wardrobe": "Worn brown leather jacket over white t-shirt",
      "distinctive_features": "Small scar above left eyebrow",
      "reference_images": ["anna_front.png", "anna_profile.png"]
    },
    {
      "character_id": "char_stranger",
      "name": "Stranger",
      "physical_description": "Mid 40s, gaunt face, dark eyes, unshaved",
      "wardrobe": "Dark trench coat, black gloves",
      "distinctive_features": "Silver ring on left hand",
      "reference_images": ["stranger_front.png"]
    }
  ],
  "scenes": [
    {
      "scene_id": "S01",
      "scene_number": 1,
      "location_id": "loc_diner",
      "time_of_day": "NIGHT",
      "mood": "tense, melancholic",
      "characters_present": ["char_anna", "char_stranger"],
      "shots": [
        {
          "shot_id": "S01-01",
          "shot_number": 1,
          "shot_type": "EWS",
          "camera_angle": "eye-level",
          "camera_movement": "static",
          "duration": 4,
          "visual_description": "Empty 1950s diner at night, red vinyl booths, neon sign glow",
          "ai_prompt": "Extreme wide shot, empty 1950s diner at night, red vinyl booths, neon sign glowing, rain on windows, moody atmosphere, cinematic",
          "transition_to_next": "cut",
          "connect_to_next": false
        }
      ]
    }
  ]
}
```

---

## 10. 总结：分镜表制作的黄金法则

1. **Asset-First**：在任何场景生成之前，先完成角色/道具/场景的完整定义和参考图生成
2. **One Shot, One Prompt**：每个镜头对应一个独立的AI生成调用，避免单段prompt承载过多内容
3. **Name It Right**：在prompt中直接使用标准术语（如"medium shot", "dolly in"），而非描述性语言
4. **Temporal Bridge**：每个场景的结束帧作为下一个场景的起始条件，确保时间连续性
5. **Negative Prompts Matter**：为每个镜头定义排除项，减少AI的随机性输出
6. **Validate Before Generate**：在批量生成前，人工审阅分镜表的叙事逻辑和视觉连贯性

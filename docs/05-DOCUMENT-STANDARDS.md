# OpsV 文档规范与格式说明 (Document Standards)

> 所有 `.md` 文件的格式约定、YAML 模板、@ 引用语法和命名规范。

---

## 1. 通用格式准则

### 1.1 YAML Frontmatter 强制规范

所有 OpsV 文档（资产、分镜、项目配置）**必须**以 YAML Frontmatter 开头：

```yaml
---
key: value
---
```

- 编译器**只读 YAML 区域**
- Markdown 正文仅供人类审阅，编译器忽略
- YAML 必须合法（注意缩进、引号、冒号后的空格）

### 1.2 语言规范

| 位置 | 语言 | 说明 |
|------|------|------|
| 正文/描述/注释 | 中文 | 降低导演的认知摩擦 |
| `prompt_en` | 英文 | 供扩散模型（SD/Flux/ComfyUI）渲染 |
| `motion_prompt_en` | 英文 | 供视频大模型（Seedance/Sora）识别 |
| `global_style_postfix` | 英文 | 全局渲染修饰词 |
| YAML 键名 | 英文 | 保持编程一致性 |

### 1.3 文件命名约定

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 角色资产 | `@role_<name>.md` | `@role_hero.md` |
| 道具资产 | `@prop_<name>.md` | `@prop_sword.md` |
| 场景资产 | `@scene_<name>.md` | `@scene_forest.md` |
| 静态分镜 | `Script.md` | 固定名称 |
| 动态台本 | `Shotlist.md` | 固定名称 |
| 项目配置 | `project.md` | 固定名称 |
| 故事大纲 | `story.md` | 固定名称 |
| 渲染草图 | `shot_X_draft_N.png` | `shot_1_draft_2.png` |
| 定向补帧 | `shot_X_target_last_N.png` | `shot_3_target_last_1.png` |

---

## 2. 资产文档格式 (elements/ 和 scenes/)

### 2.1 YAML-First 三段式结构

每个资产文件必须遵循以下格式：

```yaml
---
# ===== 元数据 =====
name: "@role_hero"           # @ 前缀 + 类型前缀 + 标识符
type: "character"             # character | scene | prop
has_image: false              # 默认 false，导演确认后改 true

# ===== 描述区（中文） =====
detailed_description: >
  致密的中文特征描写，至少3-5句话。
  包含材质、光影、磨损度、情绪、构图等元素。
brief_description: "一句话简略描述"

# ===== 渲染提示词（英文） =====
prompt_en: >
  Dense English prompt for image generation models.
  Include composition, lighting, texture, resolution, style...

# ===== Schema 版本 =====
schema_version: "0.3.2"
---

<!-- 以下正文区域供编译器提取补充字段 -->

## subject
[对主体的一句话描述，中文]

## environment
[拍摄环境/背景。如果是纯物品特写可留空]

## camera
[景别，英文。如 Close-Up, Macro, Wide Shot]

## 参考图
<!-- 确认参考图后，填入路径 -->
![]()
```

### 2.2 `has_image` 二元法则

这是 OpsV 最核心的格式规则。**违反此规则将导致编译失败或特征泄漏。**

#### 场景 A：`has_image: true`（身份锁定）

> 哲学：一图胜千言，别用千言去描述一张图。

- 文字描述限制为**一句话，不超过 20 个字**
- **必须**提供 `![Image](path)` 参考图路径
- 编译器提取极简描述 + 图片路径

```yaml
---
name: "@role_K"
type: "character"
has_image: true
brief_description: "30多岁赛博侦探，黑色高领大衣"
---

# Subject Identity
30多岁赛博侦探，黑色高领大衣，左眼亮起红色义眼流光。

# Physical Anchor
![K_Ref](../../artifacts/characters/K.png)
```

#### 场景 B：`has_image: false`（全文描述）

> 哲学：没有图片锚定时，文字是唯一的真相源，必须穷尽。

- 详尽描写所有视觉特征
- **禁止**包含任何 `![Image]()` 标签
- 编译器提取全部文字作为生成参数

```yaml
---
name: "@scene_neon_alley"
type: "scene"
has_image: false
detailed_description: >
  赛博朋克风格的狭窄幽暗小巷，持续不断的大雨，
  地面水洼倒映着闪烁的紫色和青色霓虹灯招牌。
  两侧是生锈的金属管道和满是涂鸦的砖墙...
---
```

---

## 3. 项目配置格式 (project.md)

```yaml
---
aspect_ratio: "16:9"          # 画幅：16:9 | 9:16 | 1:1 | 21:9 | 4:3 | 2.39:1
engine: ""                     # 默认渲染引擎
vision: "一句话全局描述（中文）"
global_style_postfix: "cinematic lighting, ultra detailed, masterpiece, 8k"
resolution: "2K"               # 480p | 1080p | 2K | 4K | 8K
---

# Asset Manifest (资产花名册)

## Main Characters (主要角色)
- @role_K
- @role_Emma

## Extras (群演)
- @role_ThugA

## Scenes (场景)
- @scene_NeonBar
- @scene_Wasteland

## Props (道具)
- @prop_Gun
```

**约束**：
- 一个项目只有一个 `project.md`
- 未登记的 `@` 实体视为语法违规
- `global_style_postfix` 会被编译器自动注入每个生成任务

---

## 4. 分镜脚本格式 (Script.md)

### 4.1 YAML 区域

```yaml
---
shots:
  - id: "shot_1"
    duration: 5                       # 秒数（3-15 范围）
    camera: "极致微距特写"              # 景别与运镜（中文）
    environment: "@scene_cocoon 薄雾中" # 场景（含 @ 引用）
    subject: "@role_butterfly 破茧"    # 主体（含 @ 引用）
    prompt_en: >                       # 纯英文渲染提示词
      Extreme macro shot, butterfly emerging from chrysalis,
      morning dew trembles, soft backlighting, 8k cinematic.
    # 可选字段
    first_image: "artifacts/drafts_1/shot_1.png"
    last_image: ""
    target_last_prompt: ""
---
```

### 4.2 Markdown 正文审阅区

```markdown
## Shot 1 (5s)
[@role_butterfly](../elements/@role_butterfly.md) 在
[@scene_cocoon](../scenes/@scene_cocoon.md) 中破茧而出。

### 🖼️ 视觉审阅廊
| 画面 1 | 画面 2 |
|:---:|:---:|
| (等待 opsv review 回写) | (等待 opsv review 回写) |

### 🎯 定向补帧
| 目标尾帧候选 |
|:---:|
| (等待 opsv review 回写) |
```

---

## 5. 动画台本格式 (Shotlist.md)

```yaml
---
shots:
  - id: shot_1
    duration: 5s
    reference_image: "../artifacts/drafts_1/shot_1_draft_2.png"
    motion_prompt_en: >
      Slow dolly in, chrysalis slowly cracks open,
      tiny legs push through, morning dew drops tremble,
      ultra smooth cinematic motion.
  - id: shot_2
    duration: 4s
    reference_image: "../artifacts/drafts_1/shot_2_draft_1.png"
    first_image: "@FRAME:shot_1_last"
    motion_prompt_en: >
      Camera slowly pulls back, butterfly spreads wings,
      sunlight catches iridescent scales, gentle breeze.
---
```

**关键约束**：
- `duration` 从 Script.md 原样透传，不可自行补充
- `motion_prompt_en` 严禁包含外貌特征
- `@FRAME:<shot_id>_last` 用于长镜头首尾帧继承

---

## 6. @ 引用语法详解

### 6.1 基本语法

```markdown
# 直接引用
@role_K 走向吧台

# 方括号引用（推荐，便于超链接化）
[@role_K] 走向吧台

# 超链接化引用（Script.md 正文推荐）
[@role_K](../elements/@role_K.md) 走向吧台

# YAML 中使用
subject: "@role_K walks toward the bar"
environment: "@scene_neon_alley in heavy rain"
```

### 6.2 命名规范

| 前缀 | 含义 | 存放位置 |
|------|------|---------|
| `@role_` | 角色（主角/配角/群演） | `videospec/elements/` |
| `@scene_` | 场景/环境 | `videospec/scenes/` |
| `@prop_` | 道具/关键物品 | `videospec/elements/` |

### 6.3 引用解析优先级

编译器按以下顺序查找 `@` 引用对应的定义文件：
1. `videospec/elements/{id}.md` — 角色/道具
2. `videospec/scenes/{id}.md` — 场景
3. 内联描述（fallback，未找到文件时用原始文本）

---

## 7. 相机术语速查表

### 景别 (Shot Type)

| 术语 | 缩写 | 说明 |
|------|------|------|
| `extreme_wide` | EWS | 大远景，环境为主 |
| `wide_shot` | WS | 全景，人物全身 |
| `medium_shot` | MS | 中景，膝盖以上 |
| `medium_close` | MCU | 中近景，胸部以上 |
| `close_up` | CU | 特写，面部 |
| `extreme_close` | ECU | 大特写，局部细节 |

### 角度 (Angle)

| 术语 | 说明 |
|------|------|
| `eye_level` | 平视（最常用） |
| `low_angle` | 仰拍（显高大） |
| `high_angle` | 俯拍（显渺小） |
| `dutch` | 荷兰角（倾斜不安） |

### 运动 (Movement)

| 术语 | 说明 |
|------|------|
| `static` | 固定机位 |
| `dolly_in/out` | 推/拉 |
| `pan_left/right` | 左右摇 |
| `truck_left/right` | 左右移 |
| `crane_up/down` | 升降 |
| `orbit` | 环绕 |
| `tracking` | 跟踪 |

---

## 8. 枚举值速查

### 画幅比例
`16:9` | `9:16` | `1:1` | `21:9` | `4:3` | `3:4` | `2.39:1`

### 分辨率
`480p` | `720p` | `1080p` | `2K` | `3K` | `4K` | `8K`

### 视频时长
`3s`（最短）| `5s`（推荐）| `10s` | `15s`（上限）

### 资产类型
`character` | `scene` | `prop`

---

> *"格式即法律，YAML 即真理。"*
> *OpsV 0.4.1 | 最后更新: 2026-03-23*

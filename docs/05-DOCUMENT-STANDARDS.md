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

> 详细规范见 [OPSV-ASSET-0.4](schema/OPSV-ASSET-0.4.md)

### 2.1 YAML Frontmatter

```yaml
---
name: "@role_hero"           # @ 前缀 + 类型前缀 + 标识符
type: "character"             # character | scene | prop
brief_description: "一句话简略描述"
detailed_description: >       # 无参考图时的详尽描写
  致密的中文特征描写，至少3-5句话。
prompt_en: >                  # 英文渲染提示词
  Dense English prompt for image generation models.
---
```

> **`has_image` 已废弃**（0.4.1）。参考图状态由 Markdown Body 的 d-ref / a-ref 节自动推导。

### 2.2 双通道参考图体系 (d-ref / a-ref)

这是 OpsV 0.4 最核心的格式升级。统一规则：

```
生成自身 → 使用自己的 Design References (d-ref)
被引用时 → 提供自己的 Approved References (a-ref)
```

#### `## Design References`（d-ref：生成输入）

`opsv generate` 生成**本实体自身**时，将此节中的图片作为 img2img 输入参考。

典型来源：
- 外部灵感图（服装、配色、情绪板）
- 已有资产的 a-ref（用于生成变体：老年版 / 卡通版 / 职业形象）
- 草图或手绘稿

```markdown
## Design References
- [服装灵感 - 赛博朋克风衣](refs/costume_mood.png)
- [年轻版原型 - 用于老年变体生成](artifacts/drafts_3/role_K_turnaround.png)
```

#### `## Approved References`（a-ref：定档输出）

**其他实体引用本实体**时（如 Shot 中 `@role_K`），将此节中的图片注入引用方的 `reference_images`。

代表经导演审批确认的最终形象。

```markdown
## Approved References
- [角色三视图](artifacts/drafts_3/role_K_turnaround.png)
- [角色正脸特写](artifacts/drafts_3/role_K_closeup.png)
```

#### 自动推导规则

| 条件 | 等价 | 编译行为 |
|------|------|---------|
| d-ref **或** a-ref 任一存在且非空 | `has_image: true` | 使用 `brief_description` + 参考图 |
| 两节均不存在或为空 | `has_image: false` | 使用 `detailed_description` 纯文生图 |

### 2.3 完整示例

```markdown
---
name: "@role_K"
type: "character"
brief_description: "30多岁赛博侦探，黑色高领大衣"
prompt_en: >
  A cyber detective in his 30s, black turtleneck coat,
  red cybernetic eye, moody cinematic lighting, 8k.
---

## Design References
- [服装灵感 - 赛博朋克风衣](refs/costume_mood.png)
- [义眼参考 - 红色光效](refs/cyber_eye_ref.jpg)

## Approved References
- [角色三视图](artifacts/drafts_3/role_K_turnaround.png)
- [角色正脸特写](artifacts/drafts_3/role_K_closeup.png)

## subject
赛博侦探 K

## environment
雨夜霓虹街头

## camera
Medium Close-Up
```

### 2.4 变体链

已有资产的 a-ref 可作为新资产的 d-ref，实现变体生成：

```
@role_K 的 a-ref (年轻版定档图)
   ↓ 作为 @role_K_old 的 d-ref
   ↓ opsv generate → 生成老年版
   ↓ review → approve
   ↓ 写入 @role_K_old 的 a-ref
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

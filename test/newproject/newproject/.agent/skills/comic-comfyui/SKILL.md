---
name: comic-comfyui
description: ComfyUI 漫剧资产生成 — 角色概念图、角色三视图、场景定档、分镜生图四类工作流的节点映射、提示词注入、参考图绑定、预处理脚本。覆盖 RunningHub 云端和本地 ComfyUI。
---

# ComfyUI 漫剧资产生成 (Comic ComfyUI)

## 概述

漫剧中四类核心视觉资产通过 ComfyUI 工作流生成。Agent 负责选择合适的 workflow，通过 `node_mapping` 注入参数。

| 资产类型 | 工作流 | 参考图数量 | 输出 | 依赖 |
|---------|--------|----------|------|------|
| 角色概念图 | `comic_character_concept` | 0-2 张风格参考 | 单张全身立绘（含场景/光影） | 无 |
| 角色三视图 | `comic_character_turnaround` | 1 张概念图参考 | 正面/侧面/背面 + 表情集 | ← 概念图 approved |
| 场景定档 | `comic_scene_establishing` | 0-2 张风格参考 | 场景全景 + 细节特写 | 无 |
| 分镜生图 | `comic_storyboard` | 角色并稿图 + 场景图 | 4+ 帧连贯画面 | ← 角色+场景 approved |

### ⚠️ 角色资产生成顺序强制约束

```
角色概念图 ──→ (approved) ──→ 角色三视图 ──→ (approved) ──→ 分镜可引用
                              ↑
                    三视图必须基于概念图
                    (概念图作为 IPAdapter 参考输入)
```

### ⚠️ 分镜生图预处理强制约束

```
分镜生图前:
  1. 提取分镜中所有 @character 引用
  2. 选定每个角色的引用类型: concept → 概念图, turnaround → 三视图
  3. 若角色数 ≥ 2: 运行 opsv image-stitch 合并为一张并稿图
  4. 若角色数 = 1: 直接使用单张角色图
  5. 将并稿图 + 场景图送入分镜生图工作流
```

---

---

## 工作流 0：角色概念图 (Character Concept)

### 用途
生成角色的单张全身概念立绘 — 包含完整的场景氛围和光影渲染。这是角色视觉化的**第一步**，后续三视图以此为参考锚点。

### 与三视图的区别

| | 概念图 (Concept) | 三视图 (Turnaround) |
|---|---|---|
| 背景 | 有场景/氛围/光影 | 纯色/透明 |
| 角度 | 单角度（通常正面或3/4） | 多角度（正/侧/背/表情） |
| 用途 | 视觉风格确认、导演审核 | 分镜生图的技术参考锚点 |
| 参考价值 | 风格定调 | 角色特征一致性 |

### 预设 ComfyUI 工作流节点

```
LoadImage (风格参考1) ─┐
LoadImage (风格参考2) ─┤
                       ├→ IPAdapter → KSampler → VAE Decode → SaveImage
CLIP Text Encode ──────┤
                       ↑
                  CR Seed
```

**标记节点 Title**：
- `opsv-prompt` → CLIP Text Encode (正向)
- `opsv-negative_prompt` → CLIP Text Encode (负向)
- `opsv-seed` → CR Seed
- `opsv-image1` → Load Image (风格参考 1)
- `opsv-image2` → Load Image (风格参考 2，可选)

### Frontmatter 配置

```yaml
---
category: comic_character
status: drafting
title: "成年陆然 — 真龙化身（概念图）"
workflow_id: "your-character-concept-workflow-id"
workflow_path: "comic_character_concept.json"
node_mapping:
  prompt:
    nodeId: "6"
    fieldName: "text"
  negative_prompt:
    nodeId: "7"
    fieldName: "text"
  seed:
    nodeId: "3"
    fieldName: "seed"
  image1:
    nodeId: "10"
    fieldName: "image"
  image2:
    nodeId: "11"
    fieldName: "image"
---
```

### 角色概念图 Prompt 示例

```yaml
prompt: >
  Full body character illustration of a young Chinese man, age 20 appearance,
  tall lean build with sharp jawline and lazy half-lidded amber eyes.
  Dark hair loosely tied back, one intact dragon horn visible on the left
  side of his forehead, the right horn broken at the base.
  
  Wearing worn dark grey traveling robes with subtle gold thread embroidery
  at the collar and cuffs — hints of former nobility. A jade pendant hangs
  from his belt, cracked but still glowing faintly. His posture is relaxed
  but alert, one hand resting casually on a weathered sword hilt.
  
  Standing in a moonlit bamboo grove, silver moonlight filtering through
  the leaves, casting dappled shadows across his face. Faint golden aura
  shimmering around his right hand — the dormant dragon power.
  
  Ancient Chinese fantasy donghua style, cinematic portrait composition,
  4K, hyper-detailed, volumetric moonlight, atmospheric depth.
```

### 编译命令

```bash
opsv comfy --model runninghub.comic --category comic_character --workflow comic_character_concept
opsv comfy --model comfylocal.comic --category comic_character --workflow-dir workflows/character_concept/
```

### 验证标准

```
□ 角色外观与 visual_detailed 描述匹配
□ 风格与 project.md 的 global_style_postfix 一致
□ 服装/发型/配饰/体型可清晰辨认
□ 光影氛围符合角色定位（主角→戏剧化, 龙套→简洁）
```

## 工作流 1：角色三视图 (Character Turnaround)

### 用途
生成角色的多角度展示图 — 正面、侧面、背面、表情集。作为后续所有分镜中该角色的视觉锚点。

**⚠️ 必须以 approved 概念图为 IPAdapter 参考输入**，确保三视图与概念图视觉一致。三视图剔除所有背景渲染，是干净的、表达角色身份特征的技术参考图。

### 预设 ComfyUI 工作流说明

**工作流节点设计**：
```
LoadImage (概念图) ──→ IPAdapter → KSampler → VAE Decode → SaveImage
                              ↑
CLIP Text Encode (prompt) ───┤
CLIP Text Encode (negative) ─┤
                              ↑
                        CR Seed
```

**标记节点 Title**（在 ComfyUI 中右键节点 → Title）：
- `opsv-prompt` → CLIP Text Encode (正向)
- `opsv-negative_prompt` → CLIP Text Encode (负向)
- `opsv-seed` → CR Seed
- `opsv-image1` → Load Image (**概念图**，非风格参考)

### Frontmatter 配置

```yaml
---
category: comic_character_turnaround
status: drafting
title: "成年陆然 — 角色三视图"
character_id: "@lu_ran"
based_on_concept: "elements/characters/lu_ran_concept.png"  # ← 概念图路径（必填）
workflow_id: "your-character-turnaround-workflow-id"
workflow_path: "comic_character_turnaround.json"
node_mapping:
  prompt:
    nodeId: "6"
    fieldName: "text"
  negative_prompt:
    nodeId: "7"
    fieldName: "text"
  seed:
    nodeId: "3"
    fieldName: "seed"
  image1:                                                    # ← 概念图作为 IPAdapter 参考
    nodeId: "10"
    fieldName: "image"
---
```

### 角色三视图 Prompt 示例

```yaml
prompt: >
  Character turnaround sheet of a young Chinese man, age 20 appearance.
  Front view: Tall lean build, sharp jawline, lazy half-lidded amber eyes,
  dark hair loosely tied back, one intact dragon horn on left side of head,
  right horn visibly broken. Wearing dark blue-grey traveler's robes
  with subtle dragon scale pattern. Expression: relaxed, slightly amused smirk.
  Side view: Same character in profile, broken horn clearly visible,
  straight nose, relaxed posture, robes flowing naturally.
  Back view: Broad shoulders tapering to narrow waist, long hair reaching
  mid-back, robes with dragon scale embroidery on back panel.
  Expression sheet (bottom row): neutral, amused smirk, cold glare,
  gentle smile, battle determination, exhausted pain.
  Clean reference sheet format, white background, even studio lighting,
  Ancient Chinese fantasy donghua style, 4K.
negative_prompt: >
  blurry, low quality, different character, inconsistent design,
  modern clothing, missing horn, extra horns, text, watermark
```

### 编译命令

```bash
# RunningHub 云端
opsv comfy --model runninghub.comic --category comic_character

# ComfyUI 本地
opsv comfy --model comfylocal.comic --category comic_character --workflow-dir workflows/character/

# 预览模式
opsv comfy --model runninghub.comic --category comic_character --dry-run
```

---

## 工作流 2：场景定档 (Scene Establishing)

### 用途
生成场景的全景建立镜头和细节特写。场景图作为分镜中角色活动的"舞台"。

### 预设 ComfyUI 工作流节点

```
LoadImage (风格参考1) ─┐
LoadImage (风格参考2) ─┤
                       ├→ IPAdapter → KSampler → VAE Decode → SaveImage
CLIP Text Encode ──────┘
```

**标记节点 Title**：
- `opsv-prompt`
- `opsv-negative_prompt`
- `opsv-seed`
- `opsv-image1` — 风格参考 1
- `opsv-image2` — 风格参考 2（可选）

### 场景定档 Prompt 示例

```yaml
prompt: >
  Grand establishing shot of the imperial temple forbidden grounds.
  A vast stone plaza with a towering three-zhang wedding tablet at center —
  carved with dragon and phoenix motifs, faint golden light pulsing.
  Ancient cypress trees frame the square, their branches swaying slightly.
  Imperial guards in black armor stand at attention along the perimeter,
  black banners with gold imperial crests. Grey overcast sky,
  dramatic volumetric light rays breaking through clouds,
  illuminating the tablet in an almost divine shaft of light.
  Ancient Chinese fantasy donghua style, cinematic wide shot, 4K,
  atmospheric perspective, dust motes floating in light beams.
```

### 编译命令

```bash
opsv comfy --model runninghub.comic --category comic_scene
opsv comfy --model comfylocal.comic --category comic_scene --workflow-dir workflows/scene/
```

---

## 工作流 3：分镜生图 (Storyboard Frame Generation)

### ⚠️ 前置步骤（强制执行）

**在调用 ComfyUI 分镜工作流之前，必须完成角色预处理：**

```bash
# Step 0: 从分镜中提取角色列表
# 解析 @shot_NN.md 的 refs.image，找出所有 @character 引用

# Step 1: 选定引用类型（每个角色二选一）
# - 需要多角度参考 → 用 approved_turnaround
# - 单角度即可 → 用 approved_concept

# Step 2: 角色并稿（仅当 ≥ 2 个角色时）
opsv image-stitch <char1_concept.png> <char2_turnaround.png> \
     -o shots/<shot_id>/merged_chars.png --right

# Step 3: 确认场景图可用（approved_establishing）
```

### 用途
基于 approved 的角色并稿图和场景图，生成多帧连贯的分镜画面。帧数由分镜设计决定（不限于 4 帧）。

### 预设 ComfyUI 工作流节点（多参考图版本）

```
LoadImage (角色并稿图) ──┐
LoadImage (场景图)  ────┤
                        ├→ IPAdapter → KSampler → VAE Decode → SaveImage
CLIP Text Encode ───────┤
(分镜 prompt)            │
                        ┌┘
                   Grid Output
```

**标记节点 Title**：
- `opsv-prompt` — 分镜提示词
- `opsv-negative_prompt`
- `opsv-seed`
- `opsv-image1` — **角色并稿图**（opsv image-stitch 产出）
- `opsv-image2` — **场景图**（approved_establishing）
- `opsv-image3` — 风格参考（可选）

### 4 帧分镜 Prompt 示例

```yaml
prompt: >
  Four-panel comic storyboard sequence in 2x2 grid layout.
  
  Panel 1 (top-left): @lu_ran stands before the massive @wedding_tablet in @temple,
  his back to the camera, looking up at the glowing dragon engravings.
  Wide shot, golden light illuminating his silhouette.
  
  Panel 2 (top-right): Close-up on @lu_ran's face in profile, amber eyes reflecting
  golden tablet light, broken horn visible, expression is calm but resolute.

  Panel 3 (bottom-left): @yun_li_adult enters the frame from right, imperial robes flowing,
  cold expression, guards behind her. Medium shot, tension in the air.

  Panel 4 (bottom-right): Confrontation moment — @yun_li_adult raises her hand
  commanding "arrest him", @lu_ran still facing away but his hand slightly
  clenches at his side. Dramatic split lighting — cold white on her side,
  warm gold on his side.
  
  Consistent character designs across all panels. Ancient Chinese fantasy
  donghua style, cinematic composition, 4K.
refs:
  image:
    "@chars:lu_ran+yun_li":
      - shots/EP01_shot_01/merged_chars.png          # ← opsv image-stitch 产出
    "@temple":
      - opsv-queue/videospec_circle1/runninghub.comic_002/temple_1.png
    "@style:donghua":
      - refs/donghua_style_ref.png
```

### 编译命令

```bash
# 仅当角色+场景全部 approved 后才编译分镜
opsv circle refresh    # 确认 ZeroCircle ✅
opsv comfy --model runninghub.comic --category comic_storyboard
opsv comfy --model comfylocal.comic --category comic_storyboard --workflow-dir workflows/storyboard/
```

---

## 工作流配置流程

### 第一步：在 ComfyUI 中搭建工作流

1. 启动 ComfyUI（本地或通过 RunningHub 界面）
2. 按上述节点设计搭建工作流
3. 将需要 OpsV 控制的节点 Title 设为 `opsv-` 前缀
4. 导出 API 格式 JSON（Save → API format）

### 第二步：提取节点映射

```bash
# 角色概念图
opsv comfy-node-mapping comic_character_concept.json

# 角色三视图
opsv comfy-node-mapping comic_character_turnaround.json

# 场景定档
opsv comfy-node-mapping comic_scene_establishing.json

# 分镜生图
opsv comfy-node-mapping comic_storyboard.json
```

### 第三步：配置 api_config.yaml

将提取的 `node_mappings` 写入 `.opsv/api_config.yaml` 的 `runninghub.comic` 或 `comfylocal.comic` 模型配置中。

**RunningHub 模型必须配置 `upload_method: base64`**，让 provider 在执行时自动将 `nodeInfoList` 中的本地图片路径转为 base64 data URI：

```yaml
# .opsv/api_config.yaml
models:
  runninghub.comic:
    provider: runninghub
    api_url: https://www.runninghub.cn/openapi/v2/task/create
    api_status_url: https://www.runninghub.cn/openapi/v2/task/status
    workflowId: "your-workflow-id"
    node_mappings:
      prompt:
        nodeId: "6"
        fieldName: "text"
      # ... 其他节点映射
    defaults:
      upload_method: base64  # ← 必配！自动 Jimp 预处理本地图片
```

**`upload_method: base64` 的工作原理**：
- RunningHubProvider 在提交任务前遍历 `nodeInfoList`
- 对每个 `fieldValue` 中的本地文件路径调用 `resolveImageToBase64()`
- Jimp 读取 → 缩放到 ≤1M 像素 → JPEG quality 85 → `data:image/jpeg;base64,...`
- `http://` 和 `data:` 开头的值直接透传，不做预处理

> Agent 无需手动预处理图片 — provider 自动完成。只需确保 `api_config.yaml` 中配置了 `upload_method: base64`。

### 第四步：文档中引用

在 frontmatter 中配置 `workflow_id`（RunningHub）或 `workflow_path`（ComfyUI Local），以及 `node_mapping`。

---

## node_mapping 降级策略

| 优先级 | 来源 | 触发条件 |
|--------|------|----------|
| 1 | `api_config.yaml` | `--force-api-mapping` 强制使用 |
| 2 | frontmatter `node_mapping` | 默认行为，frontmatter 有值时优先 |
| 3 | `api_config.yaml` node_mappings | frontmatter 无值时兜底 |

---

## 迭代修改

```bash
# 克隆任务
opsv iterate opsv-queue/videospec_circle1/runninghub.comic_001/@lu_ran.json
# → 生成 @lu_ran_2.json

# 编辑 @lu_ran_2.json（修改 prompt、seed 等）

# 重新执行
opsv run opsv-queue/videospec_circle1/runninghub.comic_001/@lu_ran_2.json

# 审查
opsv review
```

**迭代铁律**：必须用 `opsv iterate`，严禁手动 `cp`。

---

## 产出文件结构

```
opsv-queue/videospec_circle1/
├── runninghub.comic_concept/       # 角色概念图产出
│   ├── lu_ran_concept.json
│   ├── lu_ran_concept_1.png        # 全身立绘（含场景/光影）
│   ├── yun_li_concept.json
│   └── yun_li_concept_1.png
├── runninghub.comic_turnaround/     # 角色三视图产出（基于概念图）
│   ├── lu_ran_turnaround.json
│   ├── lu_ran_turnaround_1.png     # 三视图网格（纯色背景）
│   ├── yun_li_turnaround.json
│   └── yun_li_turnaround_1.png
├── runninghub.comic_scene/         # 场景定档产出
│   ├── @temple.json
│   ├── @temple_1.png
│   ├── @sea_shore.json
│   └── @sea_shore_1.png
└── runninghub.comic_storyboard/    # 分镜生图产出
    ├── EP01_shot_01_merged_chars.png   # ← opsv image-stitch 预处理产出
    ├── EP01_shot_01.json
    ├── EP01_shot_01_1.png              # 分镜画面
    ├── EP01_shot_02_merged_chars.png
    ├── EP01_shot_02.json
    └── EP01_shot_02_1.png
```

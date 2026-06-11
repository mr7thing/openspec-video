---
name: comic-pipeline
description: 漫剧制作全局管线 — 5 阶段门控、迭代检查工具、质量验证命令、跨 Agent 交接协议。
---

# 漫剧制作全局管线 (Comic Pipeline)

## 管线概览

```
阶段一          阶段二          阶段三            阶段四          阶段五
剧本拆解  →  分镜设计  →  视觉资产生产  →  动态视频制作  →  剪辑后期成片
(Creative)  (Storyboard)  (ComfyUI+Imagen) (Animation)    (Post)
    │            │              │                │              │
    ▼            ▼              ▼                ▼              ▼
 project.md  storyboard/   elements/        shots/         episode/
             shot_NN.md    scenes/          comic_shot/    comic_episode/
                           comic_voice/                    final/
```

## 五阶段门控 (Stage Gates)

每个阶段有明确的**准入条件**和**放行标准**。Agent 不得跳过门控直接进入下一阶段。

### 阶段一：剧本拆解 → 门控

| 准入 | `project.md` 创建完成 |
|------|----------------------|
| 产出 | `project.md`（含角色清单、场景清单、分集大纲、视觉风格定调） |
| 放行标准 | `opsv validate` 零错误；导演确认风格方向 |

**Creative-Agent 在此阶段的验证命令**：
```bash
opsv validate                                # 校验 project.md
```
> `project` category 的 `skip_prompt_check: true`，跳过 prompt 相关检查。

---

### 阶段二：分镜设计 → 门控

| 准入 | 阶段一放行；角色/场景清单已定 |
|------|------------------------------|
| 产出 | `videospec/storyboard/shot_NN.md`（每镜独立）、`storyboard/shotlist.md` |
| 放行标准 | 所有 `comic_storyboard` 文档 `opsv validate` 零错误；refs 双向校验通过 |

**验证命令**：
```bash
opsv validate                                                 # 全量校验
opsv refs check videospec/storyboard/shot_01.md               # 逐镜检查 refs
opsv circle create --dir videospec                            # 首次创建依赖图
opsv circle refresh                                           # 刷新依赖状态
```

**分镜 refs 检查清单**（Guardian-Agent 执行）：
```
□ 每个 @character_id 都在 refs.image 中有声明
□ 每个 @scene_id 都在 refs.image 中有声明
□ 分镜的 refs 不包含未在 prompt 中出现的角色/场景
□ first_frame / last_frame 指向存在的资产或合法的 @FRAME: 引用
□ motion_prompt 仅描述动作，不描述外观（分离主义）
□ camera_motion 填写完整（英文运镜指令）
□ shot_type 填写完整（景别，必须为 EWS/WS/MS/MCU/CU/ECU/OTS/POV/INSERT 之一）
□ camera_angle 填写完整（机位角度）
□ transition 填写完整（转场方式）
□ dialogue 字段存在（有台词→填内容+speaker，无台词→显式 null）
□ dialogue_speaker 指向的角色已在 character assets 中注册
□ connect_to_next 标记合理（同场景连续镜→true，场景切换→按需评估）
```
**台词覆盖验证**（Guardian 额外执行）：
```bash
# 检查所有分镜中 dialogue 为 null 的比例（建议 ≥30% 镜头有台词以保证叙事密度）
for f in videospec/storyboard/shot_*.md; do
  speaker=$(grep 'dialogue_speaker:' "$f" | head -1)
  echo "$f → $speaker"
done
```

---

### 阶段三：视觉资产生产 → 门控

| 准入 | 阶段二放行；ZeroCircle 资产清单就绪 |
|------|-------------------------------------|
| 产出 | 角色定档图（`comic_character`）、场景定档图（`comic_scene`）、配音文件（`comic_voice`）、音效（`comic_sfx`） |
| 放行标准 | ZeroCircle 全部 `approved`；Guardian syncing 对齐完成 |

**生产管线**：

```
ZeroCircle 资产:
  ├─ comic_character       ──→ ① 角色概念图  →  ② 角色三视图（基于概念图）
  ├─ comic_scene           ──→ ComfyUI 场景定档工作流 / Seedream 5.0 文生图
  ├─ comic_voice           ──→ SiliconFlow CosyVoice2 TTS
  └─ comic_sfx             ──→ (人工素材库 / AI 音效生成)

FirstCircle 资产:
  ├─ comic_storyboard      ──→ ① 角色并稿预处理（opsv image-stitch）
  │                            ② 场景角色合成 → 4 帧分镜生图
  └─ comic_storyboard_next ──→ next-scene 角色合成 (opsv-2511next分镜, 用于 connect_to_next=true 的镜头衔接)
```

### ⚠️ 子步骤输入输出契约（Agent 执行强制遵守）

以下每个子步骤的输入→输出→依赖链必须严格按序执行，不得跳过中间产物。

> **图片预处理**：所有 `runninghub.comic` / `runninghub.nextscene` 模型应在 `api_config.yaml` 中配置 `defaults.upload_method: base64`。RunningHubProvider 在提交任务时自动将 `nodeInfoList` 中的本地图片路径转为 base64 data URI（Jimp 缩放≤1M像素，JPEG quality 85），Agent 无需手动处理。

#### 3A. 角色资产 — 两步流水线

```
Step 3A.1: 角色概念图 (Character Concept)
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - @<character>.md (visual_detailed + prompt)               │
│   - project.md (global_style_postfix)                        │
│   - 风格参考图 (refs/image)                                   │
│                                                              │
│ 过程:                                                        │
│   opsv comfy --model runninghub.comic                        │
│             --category comic_character                       │
│             --workflow comic_character_concept  ← 概念图工作流 │
│                                                              │
│ 输出:                                                        │
│   → elements/characters/<char_id>_concept.png                │
│   → 写入 @<character>.md: approved_concept                   │
│                                                              │
│ 放行: opsv review → approve → approved_concept 字段非空      │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ 概念图 approved 后才可进入 3A.2
                              ▼
Step 3A.2: 角色三视图 (Character Turnaround)
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - @<character>.md (visual_detailed + prompt)               │
│   - approved_concept (概念图作为 IPAdapter 参考) ← Step 3A.1 │
│                                                              │
│ 过程:                                                        │
│   opsv comfy --model runninghub.comic                        │
│             --category comic_character_turnaround            │
│                                                              │
│ 输出:                                                        │
│   → elements/characters/<char_id>_turnaround.png             │
│   → 写入 @<character>.md: approved_turnaround                │
│                                                              │
│ ⚠ 三视图要求: 纯色/透明背景, 无环境渲染, 4 角度+表情集       │
│ 放行: opsv review → approve → approved_turnaround 字段非空   │
└──────────────────────────────────────────────────────────────┘
```

#### 3B. 场景资产 — 单步

```
Step 3B.1: 场景定档 (Scene Establishing)
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - @<scene>.md (visual_detailed + prompt)                   │
│   - project.md (global_style_postfix)                        │
│   - 风格参考图 (refs/image)  ← 只能引用风格，不能引用角色    │
│                                                              │
│ 过程:                                                        │
│   opsv comfy --model runninghub.comic --category comic_scene │
│                                                              │
│ 输出:                                                        │
│   → elements/scenes/<scene_id>_establishing.png              │
│   → 写入 @<scene>.md: approved_establishing                  │
│                                                              │
│ 放行: opsv review → approve                                  │
└──────────────────────────────────────────────────────────────┘
```

#### 3C. 分镜生图 — 三步流水线（含预处理）

```
Step 3C.1: 角色并稿预处理 ← ⚠ 分镜生图前必须执行
┌──────────────────────────────────────────────────────────────┐
│ 触发条件: 分镜中存在 ≥ 2 个不同角色需要合成                   │
│                                                              │
│ 输入:                                                        │
│   - 各角色的 approved_concept 或 approved_turnaround          │
│     （按分镜需求选择：需要多角度参考→三视图, 单角度→概念图）   │
│                                                              │
│ 过程:                                                        │
│   opsv image-stitch <char1.png> <char2.png> ...               │
│        -o <shot_dir>/merged_chars.png --right                 │
│                                                              │
│ 输出:                                                        │
│   → <shot_dir>/merged_chars.png  (单张并稿图)                │
│                                                              │
│ 后续: RunningHubProvider 在 upload_method=base64 模式下      │
│       自动将 merged_chars.png 转为 base64→送进 nodeInfoList   │
│       Agent 只需确保文件路径正确，无需手动编码               │
│                                                              │
│ ⚠ 如果分镜只有 1 个角色, 跳过此步骤, 直接用单张角色图        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
Step 3C.2: 场景角色合成 → 分镜生图
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - 角色并稿图 (merged_chars.png) ← Step 3C.1              │
│   - 场景定档图 (approved_establishing) ← Step 3B.1           │
│   - @shot_NN.md (分镜 prompt + shot_type + camera 等)        │
│                                                              │
│ 过程:                                                        │
│   opsv comfy --model runninghub.comic                        │
│             --category comic_storyboard                      │
│                                                              │
│ 输出:                                                        │
│   → shots/<shot_id>/storyboard_4frame.png                   │
│   → 写入 @shot_NN.md: approved_storyboard                    │
│                                                              │
│ 放行: opsv review → approve                                  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ 仅当 connect_to_next = true
                              ▼
Step 3C.3: next-scene 镜头衔接（可选）
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - 前一镜尾帧 (shot_N.last_frame)                           │
│   - 当前镜首帧 (shot_N+1.first_frame)                        │
│                                                              │
│ 过程:                                                        │
│   opsv comfy --model runninghub.nextscene                    │
│             --workflow opsv-2511next分镜                     │
│                                                              │
│ 输出:                                                        │
│   → shots/<shot_id>/transition_frame.png                     │
└──────────────────────────────────────────────────────────────┘
```

#### 3D. 配音资产

```
Step 3D.1: 角色配音生成
┌──────────────────────────────────────────────────────────────┐
│ 输入:                                                        │
│   - @<character>.md (voice_profile)                          │
│   - @shot_NN.md (dialogue + dialogue_speaker)                │
│                                                              │
│ 过程:                                                        │
│   opsv tts --model siliconflow.cosyvoice2                    │
│            --voice-profile <char_id>                         │
│                                                              │
│ 输出:                                                        │
│   → comic_voice/<char_id>/<shot_NN>.wav                      │
│                                                              │
│ ⚠ 配音唯一台词来源 = 分镜 dialogue 字段                       │
└──────────────────────────────────────────────────────────────┘
```

### 迭代检查命令（Runner-Agent 在每个 Circle 执行）：

```bash
# ZeroCircle — 角色概念图 (substep 3A.1)
opsv comfy --model runninghub.comic --category comic_character --workflow comic_character_concept
opsv review
# 全部概念图 approved 后 → 进入三视图
opsv comfy --model runninghub.comic --category comic_character_turnaround
opsv review

# ZeroCircle — 场景 (substep 3B.1)
opsv comfy --model runninghub.comic --category comic_scene
opsv imagen --model volc.seadream5 --category comic_scene
opsv review

# ZeroCircle — 配音 (substep 3D.1)
opsv tts --model siliconflow.cosyvoice2 --category comic_voice
opsv review

# 审查 approve 后
opsv circle refresh       # ← ZeroCircle 全部 ✅ ?

# ==== FirstCircle — 分镜生图（仅当 ZeroCircle 全部 approved）====

# 预处理：角色并稿 (substep 3C.1) — 按需执行
for shot in videospec/storyboard/shot_*.md; do
  # Agent 从分镜中提取角色列表, 判断是否需要合并
  # opsv image-stitch char1.png char2.png -o merged.png --right
done

# 分镜生图 (substep 3C.2)
opsv comfy --model runninghub.comic --category comic_storyboard
opsv review

# 如有 connect_to_next=true 的镜头 → next-scene 合成 (substep 3C.3)
opsv comfy --model runninghub.nextscene --workflow opsv-2511next分镜 --category comic_storyboard
opsv review
opsv circle refresh

---

### 阶段四：动态视频制作 → 门控

| 准入 | 阶段三放行；分镜首帧/尾帧 approved |
|------|-----------------------------------|
| 产出 | 动态镜头视频 (`comic_shot`) |
| 放行标准 | 所有 `comic_shot` approved；Guardian syncing 对齐完成 |

**视频生成模型选择指南**：

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 人物对话/微表情 | `volc.seedance2` | 最高质量，多参考图 |
| 快速预览/迭代 | `volc.seedance2f` | 速度快 |
| 场景运镜 | `siliconflow.wani2v` | I2V 支持 |
| 4 帧参考驱动 | `volc.seedance2` + 9 张 reference_images | 最高一致性 |

**验证命令**：
```bash
opsv animate --model volc.seedance2 --category comic_shot --dry-run
opsv animate --model volc.seedance2 --category comic_shot
opsv run opsv-queue/videospec_circle2/volc.seedance2_001/
opsv review
opsv circle refresh
```

---

### 阶段五：剪辑后期成片 → 门控

| 准入 | 阶段四放行；全部镜头 approved；全部配音 approved |
|------|-------------------------------------------------|
| 产出 | `comic_episode` 单集成片 |
| 放行标准 | 全片渲染完成；字幕+音频合成通过 |

**验证命令**：
```bash
opsv validate --category comic_episode
opsv circle refresh
```

---

## 跨 Agent 交接协议

### Creative → Guardian

```
📋 COMIC CREATIVE HANDOFF
episode:     "EP01"
created:     ["@yun_li_adult.md", "@lu_ran.md", "@temple.md"]
modified:    ["@yun_li_adult.md"]
refs_check:  "DAG valid — 8 nodes, 0 cycles, 3 layers"
next:        "Guardian, please validate comic assets"
```

### Guardian → Runner

```
✅ COMIC GUARDIAN CLEARANCE
approved:   ["@yun_li_adult.md", "@lu_ran.md", "@temple.md"]
blocked:    []
warnings:   ["@temple.md voice_profile 字段为空（场景无需配音）"]
syncing:    []
next:       "Runner, ZeroCircle ready for ComfyUI compilation"
```

### Runner → Creative（Draft 回滚）

```
🔄 COMIC DRAFT ROLLBACK
asset:      "@shot_01.md"
reason:     "导演反馈：陆然面部光影偏暗，需要增加龙珠金芒补光"
draft_ref:  "opsv-queue/videospec_circle2/runninghub.comic_001/shot_01_1.png"
suggestion: "修改 visual_detailed 增加 'golden rim light from dragon pearl, warm key light on face'"
next:       "Creative, please revise shot_01 lighting"
```

---

## 全局质量检查命令（Agent 循环迭代工具）

### 每个阶段结束时运行

```bash
# 1. 全量校验
opsv validate

# 2. 依赖图刷新
opsv circle refresh

# 3. 逐 category 校验
opsv validate --category comic_character
opsv validate --category comic_scene
opsv validate --category comic_storyboard
opsv validate --category comic_shot
opsv validate --category comic_voice
opsv validate --category comic_episode
```

### 每个 Circle 编译前运行

```bash
# 检查当前 Circle 状态
opsv circle refresh | grep -E "⭕|⏳|✅"

# 若 ZeroCircle 全部 ✅ → 可编译 FirstCircle
# 若 ZeroCircle 有 ⏳ → 继续完成当前 Circle
```

### 迭代修改后运行

```bash
# 修改源文档后
opsv validate                           # 校验修改
opsv circle refresh                     # 刷新状态
opsv imagen --model volc.seadream5 --no-skip-approved  # 强制重编译
opsv run <path>                         # 重新执行
opsv review                             # 重新审查
```

---

## 提示词工程库 (Prompt Engineering Library)

### 漫剧通用风格后缀

所有 `comic_character` / `comic_scene` / `comic_storyboard` 的 prompt 应追加 `global_style_postfix`（在 `project.md` 中定义）：

```yaml
# project.md
global_style_postfix: >
  Ancient Chinese fantasy donghua style, inspired by Chang'an San Wan Li,
  cinematic lighting, 4K, hyper-detailed, clean linework, rich color palette,
  gold and crimson accent tones, volumetric lighting, depth of field
```

### 角色定档提示词公式

```
[角色名], [年龄性别], [核心外貌特征], [服装描述], [标志性道具],
[光影氛围], [构图: full body / medium shot / portrait],
[风格后缀]
```

### 场景定档提示词公式

```
[场景名], [时间/天气], [建筑风格], [规模感],
[主色调], [光影条件], [氛围],
[风格后缀]
```

### 4 帧分镜提示词公式

```
Frame 1 (opening): [画面描述]
Frame 2 (development): [画面描述]
Frame 3 (climax): [画面描述]
Frame 4 (resolution): [画面描述]
Maintain consistent character design and lighting across all frames.
[风格后缀]
```

---

## 模型选择决策树

```
需要生成什么？
├─ 角色视觉
│   ├─ 角色概念图（风格确认 + 导演审核）
│   │   └─ ComfyUI 概念图工作流 (runninghub.comic, workflow: comic_character_concept)
│   └─ 角色三视图（基于 approved 概念图）
│       └─ ComfyUI 三视图工作流 (runninghub.comic, workflow: comic_character_turnaround)
├─ 场景定档图
│   ├─ 复杂光影 + 精细场景 → ComfyUI 场景工作流 (runninghub.comic)
│   └─ 通用场景 → Seedream 5.0 (volc.seadream5)
├─ 分镜生图
│   ├─ 预处理 → opsv image-stitch（角色并稿）
│   ├─ 场景角色合成 → ComfyUI 分镜工作流 (runninghub.comic)
│   └─ 连续镜头衔接 (connect_to_next=true) → next-scene 角色合成 (runninghub.nextscene)
├─ 动态视频
│   ├─ 高质量镜头 → Seedance 2.0 (volc.seedance2)
│   ├─ 快速预览 → Seedance 2.0 Fast (volc.seedance2f)
│   └─ 轻量 I2V → Wan2.2 I2V (siliconflow.wani2v)
├─ 角色配音
│   └─ CosyVoice2 TTS (siliconflow.cosyvoice2)
└─ 音效
    └─ 素材库 / 人工标注
```

## 导航

| 需要什么 | 去哪里 |
|---------|--------|
| 剧本拆解 + 角色/场景设计 | `skills/comic-creative/SKILL.md` |
| 角色三视图模板 | `skills/comic-creative/references/character-turnaround-template.md` |
| 分镜规范源（术语/Schema/6段式） | `skills/storyboard-ai-video/SKILL.md` |
| 分镜脚本创作 | `skills/comic-storyboard/SKILL.md` |
| ComfyUI 资产生成 | `skills/comic-comfyui/SKILL.md` |
| 角色并稿脚本 | `opsv image-stitch` CLI |
| 视频动画生成 | `skills/comic-animation/SKILL.md` |
| 配音/语音生成 | `skills/comic-voice/SKILL.md` |
| 后期成片 | `skills/comic-post/SKILL.md` |
| OpsV 核心 CLi | `skills/opsv/SKILL.md` |
| OpsV Cloud 会话 | `skills/cloud/SKILL.md` |

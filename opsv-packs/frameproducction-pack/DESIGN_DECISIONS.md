# FrameProduction Pack — 关键设计决策记录

> 本文档记录 frameproduction-pack 的技能包设计决策。

---

## 1. 技术栈选型决策

### 1.1 为什么用 ComfyUI 而非 GPT Image 2

multi-ref-pack 使用 GPT Image 2 + Seedance 作为核心模型，frameproduction-pack 选择 ComfyUI 作为执行引擎，原因：

| 维度 | multi-ref-pack | frameproduction-pack |
|------|---------------|---------------------|
| 图像生成 | GPT Image 2 (云端 API) | Flux Klein 9B / Qwen Image Edit 2511 (本地 ComfyUI) |
| 视频生成 | Seedance (云端 API) | LTX-2.3 Director (本地 ComfyUI 节点) |
| 声音 | 外部 TTS | Qwen3 TTS (本地 ComfyUI 节点) |
| 控制精度 | 多参考图注入 | LoRA Stack + 节点级控制 |
| 成本 | API 按次计费 | 本地 GPU 推理 |
| 灵活性 | 模型固定 | 可替换 LoRA、可改节点 |

### 1.2 LoRA Stack 控制

Klein9B 工作流使用 `CR LoRA Stack` 节点，支持最多 3 个 LoRA 同时加载：
- `switch_1/2/3`：开关控制
- `lora_name_X`：LoRA 文件路径
- `model_weight_X` / `clip_weight_X`：权重

这是 frameproduction-pack 的核心差异化能力——通过 LoRA 精确控制角色风格和场景风格。

### 1.3 LTX Director 时间线编排

导演台工作流使用 `LTXDirector` 节点，核心创新：
- **多段时间线**：每个 segment 可独立指定图像、prompt、长度
- **音频同步**：LTXV 原生支持音频 latent 拼接
- **Guide Strength**：每段可独立控制引导强度
- **Resize 模式**：crop/fit/pad 三种适配方式

---

## 2. 管线阶段映射

### 2.1 S3 角色资产（合并设计 + 三视图）

将角色设计和三视图扩展合并为 S3，因为：
- 两者都依赖 S2 Shortlist 的资产需求清单
- 角色设计是基础，三视图是扩展，有天然依赖关系
- 可在同一个 Circle 中并行编译

### 2.2 S4 场景/道具（Klein9B 文生图）

场景和道具使用同一个 Klein9B 文生图工作流，通过不同 LoRA Stack 区分：
- 场景：通用 prompt + 场景 LoRA
- 道具：精细 prompt + 道具 LoRA
- 两者不互相依赖，可在同一 Circle 并行

### 2.3 S5 声音资产（克隆 + 设计）

声音分为两类：
- **声音克隆**：有参考音频时使用（角色配音）
- **声音设计**：无参考音频时从零设计（旁白/BGM 提示音）
- 两者使用不同的 Qwen3 TTS 节点（VoiceClone vs VoiceDesign）

### 2.4 S6 镜头调度 + Next Scene

- **Klein9B 镜头调度**：基于参考图 + Qwen3-VL 分析，生成镜头术语 prompt
- **Next Scene**：基于上一镜头的图像延续，生成下一镜头的分镜图
- 两者互补：前者分析镜头语言，后者延续叙事

### 2.5 S7 视频合成（唯一视频输出）

导演台是管线中**唯一的视频生成技能**，所有其他技能产出都是图像/音频资产。

---

## 3. 与 multi-ref-pack 的复用关系

### 3.1 共享技能（不重复创建）

以下技能在 multi-ref-pack 中已定义，frameproduction-pack 直接引用：

| 技能 | 来源 | 说明 |
|------|------|------|
| `shot-graphify` | multi-ref-pack / ops-skills-create | 图谱分析 |
| `shot-breakdown` | multi-ref-pack | 剧本拆解 |
| `create-shortlist` | multi-ref-pack | Shortlist 生成 |
| `opsv-frame-pipeline` | frameproduction-pack 自建 | 管线导航 |

### 3.2 独立技能（ComfyUI 专用）

以下技能是 frameproduction-pack 独有的：

| 技能 | 对应工作流 | 说明 |
|------|-----------|------|
| `frame-video-director` | 导演台 | LTX Director 视频合成 |
| `frame-klein9b-image` | Klein9b 文生图 | Flux Klein 9B 图像生成 |
| `frame-klein9b-camera` | Klein9b 镜头调度 | 镜头术语分析 |
| `frame-character-multiview` | i2i 角色三视图 | 三视图扩展 |
| `frame-character-design` | 角色定制 | Z-Image + SeedVR2 |
| `frame-voice-clone` | 声音克隆 | Qwen3 TTS VoiceClone |
| `frame-voice-design` | TTS 设计音色 | Qwen3 TTS VoiceDesign |
| `frame-next-scene` | 2511 Next 分镜 | 场景延续 |

---

## 4. 产物命名约定

| 技能 | 产物格式 | 示例 |
|------|---------|------|
| frame-character-design | `{角色名}_character_{N}.png` | `LuRan_character_1.png` |
| frame-character-multiview | `{角色名}_multiview_{N}.png` | `LuRan_multiview_1.png` |
| frame-klein9b-image | `{场景/道具名}_asset_{N}.png` | `Dojo-Day_asset_1.png` |
| frame-voice-clone | `{角色名}_voice_clone_{N}.flac` | `LuRan_voice_clone_1.flac` |
| frame-voice-design | `{类型}_voice_design_{N}.flac` | `narrator_voice_design_1.flac` |
| frame-klein9b-camera | `{shot_id}_camera_{N}.png` | `S01-Shot01_camera_1.png` |
| frame-next-scene | `{shot_id}_next_{N}.png` | `S01-Shot02_next_1.png` |
| frame-video-director | `{项目名}_ep{N}.mp4` | `dragon_ball_ep01.mp4` |

> 所有产物命名由 OPSV 命令自动管理（`_1`, `_2`, `_M1` 等后缀），Agent 不需要手动改名。

---

## 5. refs 语义约定

| 引用类型 | 放入 refs 的 key | 说明 |
|---------|-----------------|------|
| 角色图/多视图 | `refs.image` | 所有图像资产 |
| 场景/道具图 | `refs.image` | 同上 |
| 镜头调度图 | `refs.image` | 同上 |
| 分镜延续图 | `refs.image` | 同上 |
| 视频片段 | `refs.video` | 仅 S7 导演台产出 |
| 音频片段 | `refs.audio` | 声音克隆/设计产物 |

---

## 6. 注意事项

1. **ComfyUI 工作流文件是只读的** — Agent 不应该修改 `.json` 工作流文件，只读取 nodeMappings 获取输入/输出端口
2. **opsv-workflow.json 是契约** — 定义了技能与 ComfyUI 工作流的映射关系，包含 `nodeMappings` 字段
3. **LoRA 文件路径是硬编码在工作流中的** — 如果需要替换 LoRA，需要修改 `.json` 工作流文件
4. **SeedVR2 超分是可选步骤** — 角色定制工作流中的 SeedVR2 节点可选择启用/禁用
5. **LTX Director 的 timeline_data 是 JSON 字符串** — 需要在 frontmatter 中以字符串形式存储

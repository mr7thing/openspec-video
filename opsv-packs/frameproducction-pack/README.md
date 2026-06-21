# FrameProduction Pack — ComfyUI 帧驱动技能包

> **核心定位**: 基于 ComfyUI 工作流的帧驱动视频生产管线，与 multi-ref-pack（GPT Image 2 + Seedance 参考图驱动）形成互补。
> **技术栈**: ComfyUI + Flux Klein 9B + Qwen Image Edit 2511 + LTX-2.3 Director + SeedVR2 + Qwen3 TTS

---

## 管线概览

```
S0: 项目启动（管线导航）
S1: 图谱分析（复用 shot-graphify / shot-breakdown）
S2: Shortlist（复用 create-shortlist）
S3: 角色资产设计（frame-character-design + frame-character-multiview）
S4: 场景/道具资产（frame-klein9b-image + frame-next-scene）
S5: 声音资产（frame-voice-clone + frame-voice-design）
S6: 镜头调度 + 分镜（frame-klein9b-camera + frame-next-scene）
S7: 视频合成（frame-video-director）
```

## 技能清单（8 个）

| 阶段 | 技能名 | 对应 ComfyUI 工作流 | 输入 | 产出 |
|------|--------|---------------------|------|------|
| S3 | `frame-character-design` | 角色定制 (Z-Image + SeedVR2) | 角色描述 | 高清角色图 |
| S3 | `frame-character-multiview` | i2i 角色三视图 | 角色描述 + 参考图 | 多视角角色图 |
| S4 | `frame-klein9b-image` | Klein9b 文生图 | prompt + seed + LoRA | 高质量场景/道具图 |
| S5 | `frame-voice-clone` | 声音克隆 (Qwen3 TTS) | 参考音频 + 文本 | 克隆语音 |
| S5 | `frame-voice-design` | Qwen3 TTS 设计音色 | 文本 + 声音设计描述 | 设计语音 |
| S6 | `frame-klein9b-camera` | Klein9b 镜头调度 | 参考图 + prompt + seed | 镜头调度图 |
| S6 | `frame-next-scene` | 2511 Next 分镜 | 场景图 + 角色图 | 下一镜头分镜图 |
| S7 | `frame-video-director` | 导演台 (LTX Director) | 时间线 + 分段图像+提示词 | 合成视频(mp4+音频) |

## 技术特点

### 与 multi-ref-pack 的区别

| 维度 | multi-ref-pack | frameproduction-pack |
|------|---------------|---------------------|
| 图像模型 | GPT Image 2 (webapp.gemini) | Flux Klein 9B / Qwen Image Edit 2511 |
| 视频模型 | Seedance | LTX-2.3 (LTX Director) |
| 参考机制 | 多参考图注入 | ComfyUI refs + LoRA Stack |
| 镜头调度 | 手动编写 prompt | Qwen3-VL 辅助镜头术语分析 |
| 角色资产 | Z-Image Turbo | Z-Image Turbo + SeedVR2 超分 |
| 声音 | 独立 S7 阶段 | 独立 S5 阶段（克隆+设计） |
| 分镜 | 3×3 网格 (GPT Image 2) | Next Scene 延续 (Qwen 2511) |

### 核心工作流

1. **导演台 (LTX Director)** — 唯一真正"视频"输出的技能，基于时间线分段合成
2. **角色流水线** — Z-Image 生成 → SeedVR2 超分 → 三视图扩展
3. **镜头调度** — Klein 9B + Camera Blocking LoRA + Qwen3-VL 辅助
4. **声音设计** — Qwen3 TTS 支持克隆和设计两种模式

## 目录结构

```
frameproducction-pack/
├── README.md
├── DESIGN_DECISIONS.md
├── SKILL_SPEC.md
├── videospec/
│   └── _category_validate.yaml
└── .agent/
    ├── AGENTS.md
    └── skills/
        ├── frame-video-director/
        ├── frame-klein9b-image/
        ├── frame-klein9b-camera/
        ├── frame-character-multiview/
        ├── frame-character-design/
        ├── frame-voice-clone/
        ├── frame-voice-design/
        └── frame-next-scene/
```

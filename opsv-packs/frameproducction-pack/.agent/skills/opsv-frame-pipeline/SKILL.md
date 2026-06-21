---
name: opsv-frame-pipeline
description: >
  FrameProduction 管线导航 — 介绍基于 ComfyUI 帧驱动的视频生产管线 S0-S7。
  包含技能清单、工作流映射、CLI 命令速查。
  Use this skill whenever the user needs to navigate the frameproduction-pack pipeline,
  understand which ComfyUI workflow maps to which stage, or find the right CLI command.
  Trigger on: "pipeline", "管线", "S0-S7", "workflow map", "技能清单", "comfyui workflow".
  Distinguishes from multi-ref-pack by focusing on ComfyUI-based production (Klein9B, LTX Director, Qwen Edit)
  rather than GPT Image 2 + Seedance.
disable-model-invocation: false
user-invocable: true
---

# FrameProduction 管线导航

> **阶段**: S0 · 项目启动
> **输入**: 无（导航索引）
> **产出**: 无（纯信息参考）
> **技能数**: 共享（所有技能引用此管线）

---

## 1. 管线总览

```
S0 项目启动 ──→ S1 图谱分析 ──→ S2 Shortlist ──→ S3 角色资产 ──→ S4 场景/道具
                                                                 │
S7 视频合成 ←── S6 镜头调度 ←── S5 声音资产 ←──┴─────────────────┘
```

## 2. 技能速查

| 阶段 | 技能名 | 一句话描述 | 核心模型 |
|------|--------|-----------|---------|
| S3 | frame-character-design | Z-Image 生成角色 + SeedVR2 超分 | Z-Image Turbo + SeedVR2 |
| S3 | frame-character-multiview | i2i 角色三视图扩展 | Qwen Image Edit 2511 |
| S4 | frame-klein9b-image | Klein9B 文生图（场景/道具） | Flux Klein 9B + LoRA |
| S5 | frame-voice-clone | Qwen3 TTS 声音克隆 | Qwen3 TTS + Whisper |
| S5 | frame-voice-design | Qwen3 TTS 音色设计 | Qwen3 TTS Voice Design |
| S6 | frame-klein9b-camera | Klein9B 镜头调度分析 | Flux Klein 9B + Qwen3-VL |
| S6 | frame-next-scene | Next Scene 分镜延续 | Qwen Image Edit 2511 |
| S7 | frame-video-director | LTX Director 时间线合成 | LTX-2.3 + LTX Director |

## 3. CLI 命令速查

```bash
# 编译图像任务
opsv comfy --manifest <manifest> --category frame_klein9b_image

# 编译视频任务
opsv comfy --manifest <manifest> --category frame_video_director

# 执行任务
opsv run <task.json>

# 验证文档
opsv validate --dir videospec

# 创建/刷新 Circle
opsv circle create --dir videospec
opsv circle refresh --dir videospec

# 审阅
opsv review --circle
opsv approved

# 迭代
opsv iterate <task_path>
```

## 4. ComfyUI 工作流映射

每个技能对应一个 ComfyUI 工作流文件，位于 `comfyui-workflows/` 目录下：

| 技能 | 工作流文件 | opsv-workflow.json |
|------|-----------|-------------------|
| frame-video-director | `opsv- 导演台_api-id-*.json` | `opsv- 导演台_*.opsv-workflow.json` |
| frame-klein9b-image | `opsv-klein9b_api-id-*.json` | `opsv-klein9b_*.opsv-workflow.json` |
| frame-klein9b-camera | `opsv-klein9b镜头调度_api-id-*.json` | `opsv-klein9b镜头调度_*.opsv-workflow.json` |
| frame-character-multiview | `opsv-i2i角色三视图_api-id-*.json` | `opsv-i2i角色三视图.opsv-workflow.json` |
| frame-character-design | `opsv-角色定制_api-id-*.json` | 无（内联 pipeline） |
| frame-voice-clone | `opsv-声音克隆_api-id-*.json` | `opsv-声音克隆_*.opsv-workflow.json` |
| frame-voice-design | `opsv-Qwen3 TTS 设计音色_api-id-*.json` | `opsv-Qwen3 TTS 设计音色_*.opsv-workflow.json` |
| frame-next-scene | `opsv-2511next分镜_api-id-*.json` | 无（LLM API 节点内嵌） |

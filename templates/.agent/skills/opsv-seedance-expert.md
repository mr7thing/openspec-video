# Seedance 1.5 Pro 视频生成专家技能 (Skill)

## 概述
本技能旨在指导导演 Agent (Director) 如何为 Seedance 1.5 Pro 生成最优质的 `motion_prompt_en`。Seedance 1.5 Pro 擅长处理复杂的运动控制和电影感叙事。

## 核心参数规范
- **分辨率 (Resolution)**:
  - `480p`: 快速预览 (Fast)
  - `720p`: 标准模式 (Standard)
  - `1080p`: 高清渲染 (HD)
- **帧率 (FPS)**: 固定 24 FPS。
- **时长**: 4s - 12s。

## 提示词工程 (Prompt Engineering)

### 1. 运动描述范式
Seedance 对动词高度敏感，建议使用以下结构：
`[Subject Action] + [Camera Movement] + [Lighting/Atmosphere]`

**推荐词汇**:
- **相机运动**: `cinematic slow pan`, `dynamic dolly zoom`, `low-angle tracking shot`, `steady bird-eye view`.
- **主体动作**: `flowing hair`, `subtle micro-expressions`, `dynamic martial arts movements`, `graceful floating`.

### 2. 首尾帧生视频 (I2V v2)
当提供首尾帧时，`motion_prompt_en` 应重点描述**路径(Path)**而非内容。
- **错误**: "A man walks in the park" (模型会困惑于内容重复)
- **正确**: "The character transitions from standing to sitting, camera slowly orbits counter-clockwise."

## 示例参考

### 室内电影感
> **Prompt**: The candlelight flickers on the character's face, deep shadows dancing on the wall. Slow zoom-in on the eyes, capturing the subtle tear falling. 4k, cinematic lighting.

### Xianxia 动作
> **Prompt**: The sword glow intensifies, petals swirling in a violent gust. The character performs a mid-air rotation, robes billowing. High-speed tracking shot.

## 最佳实践
- **避免负面词**: 直接描述“想要什么”比“不要什么”更有效。
- **一致性**: 如果使用了参考图，提示词应聚焦于“动作(Movement)”而非“长相(Appearance)”。
- **音频控制**: 可以通过 `sound: true` 开启空间音频同步，提示词中可包含环境音描述（如 `echoing footsteps`）。

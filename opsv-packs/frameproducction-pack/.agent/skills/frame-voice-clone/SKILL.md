---
name: frame-voice-clone
description: >
  声音克隆 — 基于 Qwen3 TTS Voice Clone 的配音生成。
  输入参考音频 + 文本，输出角色配音。
  Use this skill whenever the user wants to clone a voice from a reference audio
  using the Qwen3 TTS ComfyUI workflow.
  Trigger on: "声音克隆", "voice clone", "TTS 克隆", "配音", "voice synthesis",
  "Qwen3 TTS", "克隆声音".
  Distinguishes from frame-voice-design by using reference audio (not text prompt)
  to clone an existing voice. Uses Whisper transcription for reference text extraction.
disable-model-invocation: false
user-invocable: true
---

# 声音克隆 (Voice Clone)

> **阶段**: S5 · 声音资产 (Stage 5)
> **输入**: S2 Shortlist 声音需求清单 + 参考音频 + 配音文本
> **产出**: 克隆语音（flac）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S5 声音克隆）
> **验收**: `opsv validate --dir videospec --category frame_voice_clone` + 音频审阅

---

## 1. 职责边界

**你做**：
- 为每个角色准备配音文本
- 上传参考音频（角色声音样本）
- 设置语速（speed factor）
- 调用 `opsv comfy` 编译声音克隆任务
- 执行 `opsv run` 生成克隆语音

**你不做**：
- 设计全新音色（那是 frame-voice-design 的事）
- 生成 BGM（那是 S5 的另一部分）

---

## 2. 触发条件

- S2 Shortlist 已确定声音需求清单
- 角色参考音频已准备好

---

## 3. 工作流程

```
S2 Shortlist 声音需求 + 参考音频 + 配音文本
      │
      ▼
┌──────────────────────────────┐
│ Step 1: Whisper 转录参考音频  │
│   自动提取参考音频的文本       │
│   用于 TTS 训练对齐           │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建声音文档          │
│   elements/voice_            │
│   LuRan.md                    │
│   frontmatter: prompt +      │
│   generation_type: audio     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行声音克隆     │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_voice_clone    │
│   opsv run <task.json>       │
│   → 产出 flac 音频            │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 审阅+审批+资产回写    │
│   opsv review --circle       │
│   opsv approved              │
│   回写 asset_id               │
└─────────────────────────────┘
```

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
4 步：Whisper 转录 → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S2 Shortlist
- **验证**: `opsv refs check` 确认参考音频存在

### ③ 提示词生成
- prompt = 配音文本（角色台词）
- 语速因子：0.95（正常偏快）或 1.0（标准）
- 示例：`"但真正的墙，不该只是颜料的容器。它应承载时间，呼吸温度..."`

### ④ 引用语法
- 声音克隆不需要 refs.image
- 但 S7 导演台会引用此声音资产（refs.audio）

### ⑤ 任务环编排
- 每个角色声音独立编译，可并行执行
- 在同一 Circle 中处理所有声音

### ⑥ 迭代与 Review
- 音色不像 → 更换参考音频 → 重新克隆
- 语速不对 → 调整 speed factor → 重新克隆
- 审阅标准：音色一致性、清晰度、情感表达
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/qwen-tts/voice_LuRan_clone_1.flac"
```

---

## 5. 注意事项（踩过的坑）

1. **Qwen3 TTS 12Hz** — 使用 `Qwen/Qwen3-TTS-12Hz-1.7B-Base` 模型
2. **Whisper 自动转录** — `Apply Whisper` 节点自动从参考音频提取文本
3. **语速范围** — 0.5-2.0，1.0 为标准速度
4. **SaveAudio (FLAC Deprecated)** — 输出格式为 FLAC
5. **root 目录 .md 不验证** — 声音文档放在 `elements/` 下

---

## 6. references/

- `references/voice_clone_template.md` — 声音克隆文档模板
- `references/sample_voice_clone.md` — 完整声音克隆示例

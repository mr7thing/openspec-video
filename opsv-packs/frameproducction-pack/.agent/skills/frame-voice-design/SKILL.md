---
name: frame-voice-design
description: >
  音色设计 — 基于 Qwen3 TTS Voice Design 的全新音色生成。
  输入文本 + 声音设计描述（性别/年龄/口音/情绪等），输出设计语音。
  Use this skill whenever the user wants to design a brand-new voice
  (not cloning from reference) using the Qwen3 TTS Voice Design ComfyUI workflow.
  Trigger on: "音色设计", "voice design", "TTS 设计", "design voice",
  "Qwen3 Voice Design", "创造声音", "voice creation".
  Distinguishes from frame-voice-clone by using text-based voice specification
  (not reference audio). Generates entirely new voices from design parameters.
disable-model-invocation: false
user-invocable: true
---

# 音色设计 (Voice Design)

> **阶段**: S5 · 声音资产 (Stage 5)
> **输入**: S2 Shortlist 声音需求清单 + 声音设计描述
> **产出**: 设计语音（flac）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S5 声音设计）
> **验收**: `opsv validate --dir videospec --category frame_voice_design` + 音频审阅

---

## 1. 职责边界

**你做**：
- 为每个新音色编写声音设计描述（性别/年龄/口音/情绪/语速等）
- 编写配音文本
- 设置 `seed`
- 调用 `opsv comfy` 编译音色设计任务
- 执行 `opsv run` 生成设计语音

**你不做**：
- 克隆已有声音（那是 frame-voice-clone 的事）
- 生成 BGM（那是 S5 的另一部分）

---

## 2. 触发条件

- S2 Shortlist 已确定声音需求清单
- 需要全新的音色（无参考音频）

---

## 3. 工作流程

```
S2 Shortlist 声音需求 + 声音设计描述 + 配音文本
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 编写声音设计描述       │
│   性别/年龄/口音/音高/语速     │
│   音色质感/情绪/语调/语气      │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建声音文档          │
│   elements/voice_            │
│   narrator.md                 │
│   frontmatter: prompt +      │
│   generation_type: audio     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行音色设计     │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_voice_design   │
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
4 步：写设计描述 → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S2 Shortlist
- **验证**: `opsv refs check` 确认无外部 refs

### ③ 提示词生成
- 声音设计描述必须详细：性别、年龄、口音、音高、语速、音色质感、情绪、语调、语气
- 示例：`"性别：男性 | 年龄: 25-35 岁 | 口音：标准普通话 | 情绪：强装镇定的祝福→不舍的急切呼唤→撕心裂肺的绝望哀求"`

### ④ 引用语法
- 声音设计不需要 refs.image
- 但 S7 导演台会引用此声音资产（refs.audio）

### ⑤ 任务环编排
- 每个声音独立编译，可并行执行
- 在同一 Circle 中处理所有声音

### ⑥ 迭代与 Review
- 音色不符合预期 → 调整设计描述 → `opsv iterate` → 重新生成
- 审阅标准：音色是否符合角色设定、情感表达是否到位
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/qwen-tts-design/voice_narrator_design_1.flac"
```

---

## 5. 注意事项（踩过的坑）

1. **Qwen3 TTS Voice Design** — 使用 `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` 模型
2. **声音设计描述格式** — 多行文本，每行一个属性（性别/年龄/口音等）
3. **seed 控制随机性** — 同一描述不同 seed 会产生不同音色
4. **SaveAudio (FLAC Deprecated)** — 输出格式为 FLAC
5. **root 目录 .md 不验证** — 声音文档放在 `elements/` 下

---

## 6. references/

- `references/voice_design_template.md` — 声音设计文档模板
- `references/sample_voice_design.md` — 完整声音设计示例
- `references/voice_spec_guide.md` — 声音设计描述编写指南

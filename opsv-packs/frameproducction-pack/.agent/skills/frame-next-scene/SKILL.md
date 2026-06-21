---
name: frame-next-scene
description: >
  Next Scene 分镜延续 — 基于 Qwen Image Edit 2511 + SeedVR2 + RH LLM API 的场景延续分镜生成。
  输入上一镜头的场景图+角色图，生成下一镜头的分镜图，保持角色外观一致性和场景连续性。
  Use this skill whenever the user wants to generate the next scene storyboard frame
  continuing from the previous shot, using Qwen Image Edit 2511 with LLM-assisted
  prompt generation and SeedVR2 upscaling.
  Trigger on: "next scene", "下一镜头", "场景延续", "分镜延续", "scene continuation",
  "next storyboard", "next frame", "镜头延续".
  Distinguishes from multi-ref-pack's shot-storyboard by using Qwen Image Edit 2511
  (not GPT Image 2) with LLM-assisted prompt generation and SeedVR2 upscaling.
disable-model-invocation: false
user-invocable: true
---

# Next Scene 分镜延续 (Next Scene)

> **阶段**: S6 · 分镜延续 (Stage 6)
> **输入**: S4 场景资产 + S3 角色资产 + S1 镜头描述
> **产出**: 下一镜头分镜图（png）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S6 分镜延续）
> **验收**: `opsv validate --dir videospec --category frame_next_scene` + 分镜审阅

---

## 1. 职责边界

**你做**：
- 为每个镜头编写 Next Scene prompt（场景延续 + 角色动作 + 镜头运动）
- 上传上一镜头的场景图和角色图作为参考
- 调用 `opsv comfy` 编译 Next Scene 任务
- 执行 `opsv run` 生成分镜图
- 可选：使用 SeedVR2 超分

**你不做**：
- 生成最终视频（那是 S7 的事）
- 修改角色/场景资产（那是 S3/S4 的事）

---

## 2. 触发条件

- S3 角色资产全部 `approved`
- S4 场景资产全部 `approved`
- S1 Script.md 已完成镜头描述

---

## 3. 工作流程

```
S3 角色资产 + S4 场景资产 + S1 镜头描述
      │
      ▼
┌──────────────────────────────┐
│ Step 1: LLM 辅助 prompt 生成  │
│   RH LLM API 节点分析         │
│   上一镜头图像 + 角色图        │
│   生成下一镜头 prompt          │
│   "Next Scene；prompt..."     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: Qwen Image Edit 2511 │
│   基于 prompt + 参考图         │
│   生成下一镜头分镜图           │
│   next-scene_lora-v2-3000    │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: SeedVR2 超分(可选)    │
│   将分镜图超分到更高分辨率     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 创建分镜文档          │
│   shots/S01-Shot02_next.md   │
│   frontmatter: prompt +      │
│   refs.image (场景+角色)      │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 5: 审阅+审批+资产回写    │
│   opsv review --circle       │
│   opsv approved              │
│   回写 asset_id               │
└─────────────────────────────┘
```

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
5 步：LLM prompt 生成 → Qwen Edit 2511 生成 → 超分(可选) → 创建文档 → 审阅回写。

### ② 依赖处理
- **上游**: S3 角色资产 + S4 场景资产 + S1 Script.md
- **验证**: `opsv refs check` 确认 `refs.image` 中的场景/角色资产已 `approved`

### ③ 提示词生成
- LLM 辅助生成：`"你是一位拥有 10 年以上经验的电影分镜脚本设计师..."`
- 输出格式：`"Next Scene；prompt"` 每段 100 字左右
- 保持：人物外观一致、色调光影统一、背景元素延续、构图具备电影感

### ④ 引用语法
- `refs.image` 包含场景参考图 + 角色参考图
- 编译时 OPSV 将 `@id` 解析为实际图像路径

### ⑤ 任务环编排
- 每个 Next Scene 依赖前一镜头的输出
- 必须按顺序执行（Shot01 → Shot02 → Shot03...）
- 不在同一 Circle 中并行

### ⑥ 迭代与 Review
- 分镜不连贯 → 调整 prompt → `opsv iterate` → 重新生成
- 审阅标准：角色一致性、场景连续性、镜头运动合理性
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/qwen-edit-next/next_S01-Shot02_1.png"
```

---

## 5. 注意事项（踩过的坑）

1. **next-scene_lora-v2-3000** — 专门针对场景延续的 LoRA，3000 步训练
2. **FireRed-Image-Edit-1.1** — 基础 UNET 模型
3. **Qwen-Image-Lightning-4steps** — 加速到 4 步推理
4. **RH_LLMAPI_NODE** — RunningHub LLM API 节点，自动生成下一镜头 prompt
5. **SeedVR2VideoUpscaler** — 可选超分步骤（max_resolution=0 表示不限制）
6. **ImageStitch** — 不拼接，每镜头独立输出
7. **root 目录 .md 不验证** — 分镜文档放在 `shots/` 下

---

## 6. references/

- `references/next_scene_template.md` — Next Scene 文档模板
- `references/sample_next_scene.md` — 完整 Next Scene 示例
- `references/llm_prompt_spec.md` — LLM prompt 生成规范

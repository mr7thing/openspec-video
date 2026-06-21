---
name: frame-klein9b-camera
description: >
  Klein9B 镜头调度 — 基于 Flux Klein 9B + Camera Blocking LoRA + Qwen3-VL 的镜头调度分析。
  输入参考图 + 镜头描述，输出带有镜头运动标注的调度图。
  Use this skill whenever the user wants to generate camera blocking/direction images
  using the Klein9B ComfyUI workflow with Qwen3-VL assisted camera terminology analysis.
  Trigger on: "镜头调度", "camera blocking", "运镜", "camera direction", "klein9b camera",
  "镜头分析", "camera analysis".
  Distinguishes from multi-ref-pack's shot-storyboard by using Qwen3-VL for automatic
  camera terminology extraction from reference images, and Camera Blocking LoRA for
  specialized camera direction output.
disable-model-invocation: false
user-invocable: true
---

# Klein9B 镜头调度 (Klein9B Camera Blocking)

> **阶段**: S6 · 镜头调度 (Stage 6)
> **输入**: S3 角色资产 + S4 场景资产 + S1 镜头描述
> **产出**: 镜头调度图（png）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S6 镜头调度）
> **验收**: `opsv validate --dir videospec --category frame_klein9b_camera` + 调度图审阅

---

## 1. 职责边界

**你做**：
- 为每个镜头编写调度 prompt（镜头运动 + 景别 + 机位）
- 选择角色/场景参考图作为 input image
- 设置 `seed`、Camera Blocking LoRA
- 调用 `opsv comfy` 编译镜头调度任务
- 执行 `opsv run` 生成调度图

**你不做**：
- 修改角色/场景资产（那是 S3/S4 的事）
- 编写最终视频 prompt（那是 S7 的事）

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
│ Step 1: Qwen3-VL 分析参考图   │
│   自动提取镜头术语             │
│   frontal upward shot         │
│   push in to close-up         │
│   等                          │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 编写调度 prompt       │
│   镜头运动 + 景别 + 机位       │
│   选择 Camera Blocking LoRA   │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 创建调度文档          │
│   shots/S01-Shot01_camera.md │
│   frontmatter: prompt +      │
│   seed + refs.image          │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 编译+执行             │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_klein9b_camera │
│   opsv run <task.json>       │
│   → 产出 png 调度图           │
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
5 步：Qwen3-VL 分析 → 写 prompt → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S3 角色资产 + S4 场景资产 + S1 Script.md
- **验证**: `opsv refs check` 确认 `refs.image` 中的角色/场景资产已 `approved`

### ③ 提示词生成
- prompt 包含镜头术语（push in / pan left / tilt up 等）
- 可结合 Qwen3-VL 自动提取的镜头术语
- 示例：`"push in to extreme close-up, frontal upward shot, character centered, dramatic lighting"`

### ④ 引用语法
- `refs.image` 包含角色资产 + 场景资产
- 编译时 OPSV 将 `@id` 解析为实际图像路径

### ⑤ 任务环编排
- 每个镜头独立编译，可并行执行
- 在同一 Circle 中处理所有镜头

### ⑥ 迭代与 Review
- 镜头运动不对 → 调整 prompt → `opsv iterate` → 重新生成
- 审阅标准：镜头运动是否合理、构图是否符合分镜意图
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/klein9b-camera/S01-Shot01_camera_1.png"
```

---

## 5. 注意事项（踩过的坑）

1. **Camera Blocking LoRA** — `klein9b-Camera-Blocking.safetensors` 是专用 LoRA，控制镜头运动表现
2. **Qwen3-VL 辅助** — 工作流内嵌 Qwen3-VQA 节点，自动分析参考图并推荐镜头术语
3. **String Concat 拼接 prompt** — Qwen3-VL 的输出与手动 prompt 拼接后使用
4. **ResizeImagesByLongerEdge** — 输入图自动 resize 到 1920 长边
5. **ReferenceLatent** — 使用 ReferenceLatent 节点将 conditioning 与 latent 关联
6. **root 目录 .md 不验证** — 调度文档放在 `shots/` 下

---

## 6. references/

- `references/camera_term_guide.md` — 镜头术语完整列表（Qwen3-VL 可用术语集）
- `references/sample_camera.md` — 镜头调度文档范本

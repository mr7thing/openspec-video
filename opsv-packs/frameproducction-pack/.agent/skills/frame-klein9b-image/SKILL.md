---
name: frame-klein9b-image
description: >
  Klein9B 文生图 — 基于 Flux Klein 9B + LoRA Stack 的高质量图像生成。
  用于场景资产和道具资产的生成，支持多 LoRA 叠加控制风格。
  Use this skill whenever the user wants to generate scene or prop images
  using the Klein9B ComfyUI workflow with LoRA stack control.
  Trigger on: "klein9b", "文生图", "场景生成", "道具生成", "LoRA 生成",
  "flux klein", "scene image", "prop image", "text-to-image".
  Distinguishes from multi-ref-pack's Create-elements by using ComfyUI's
  Flux Klein 9B model with CR LoRA Stack node instead of GPT Image 2.
disable-model-invocation: false
user-invocable: true
---

# Klein9B 文生图 (Klein9B Text-to-Image)

> **阶段**: S4 · 场景/道具资产 (Stage 4)
> **输入**: S2 Shortlist 资产需求清单 + S1 Script.md 场景/道具描述
> **产出**: 高质量场景/道具图（png）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S4 图像生成）
> **验收**: `opsv validate --dir videospec --category frame_klein9b_image` + 图像审阅

---

## 1. 职责边界

**你做**：
- 为每个场景/道具编写 Klein9B prompt
- 设置 `seed`、LoRA Stack（最多 3 个 LoRA 叠加）
- 调用 `opsv comfy` 编译 Klein9B 图像生成任务
- 执行 `opsv run` 生成图像
- 处理图像审阅后的迭代（修改 prompt/seed/LoRA）

**你不做**：
- 修改角色资产（那是 S3 的事）
- 修改声音资产（那是 S5 的事）
- 生成视频（那是 S7 的事）

---

## 2. 触发条件

- S2 Shortlist 已确定资产需求清单
- S1 Script.md 已完成场景/道具描述

---

## 3. 工作流程

```
S1 Script.md 场景描述 + S2 Shortlist 资产清单
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 编写 Klein9B prompt  │
│   场景描述 + 光影 + 风格      │
│   选择 LoRA Stack            │
│   设置 seed                  │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建资产文档          │
│   elements/scene_            │
│   Dojo-Day.md                 │
│   frontmatter: prompt +      │
│   seed + lora_stack + refs   │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行图像生成     │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_klein9b_image  │
│   opsv run <task.json>       │
│   → 产出 png 图像             │
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
4 步：写 prompt → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S1 Script.md + S2 Shortlist
- **验证**: `opsv refs check` 确认无外部 refs（文生图不依赖图像资产）

### ③ 提示词生成
- prompt 必须 ≥ 50 字符
- 包含场景/道具描述 + 光影 + 风格标签
- 示例：`"杭州国家版本馆主馆内景。耐候钢板与回收砖瓦砌筑的建筑外墙，内部龙泉青瓷屏风，粉青色釉面，宋代美学。"`

### ④ 引用语法
- 文生图不需要 refs.image（不依赖图像资产）
- 但可通过 `@id` 引用其他文档中的场景描述

### ⑤ 任务环编排
- 场景和道具可并行编译（无互相依赖）
- 在同一 Circle 中执行

### ⑥ 迭代与 Review
- 图像风格不对 → 调整 prompt 或更换 LoRA → `opsv iterate` → 重新生成
- 审阅标准：是否符合场景描述、光影是否正确、分辨率是否达标
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/klein9b/scene_Dojo-Day_1.png"
```

---

## 5. 注意事项（踩过的坑）

1. **LoRA Stack 是可选的** — 如果不使用 LoRA，所有 switch 设为 "Off"
2. **seed = -1 表示随机** — 交付前固定 seed 值
3. **CFG = 1 是 Flux 默认值** — 不要随意修改
4. **steps = 6 是推荐值** — Klein9B 是 distilled 模型，不需要太多步数
5. **EmptyFlux2LatentImage 固定 1920x1088** — 这是 Klein9B 的最佳分辨率
6. **CR LoRA Stack 节点** — 支持 3 个 LoRA 同时加载，通过 switch_1/2/3 控制
7. **root 目录 .md 不验证** — 资产文档放在 `elements/` 或 `scenes/` 下

---

## 6. references/

- `references/klein9b_prompt_guide.md` — Klein9B prompt 编写指南
- `references/lora_stack_examples.md` — LoRA Stack 配置示例
- `references/sample_scene.md` — 场景资产文档范本
- `references/sample_prop.md` — 道具资产文档范本

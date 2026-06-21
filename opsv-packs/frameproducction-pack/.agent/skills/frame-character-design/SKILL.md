---
name: frame-character-design
description: >
  角色定制 — 基于 Z-Image Turbo 的角色初稿生成 + SeedVR2 超分辨率放大。
  输入角色描述，输出高分辨率角色定稿图。
  Use this skill whenever the user wants to generate initial character designs
  using Z-Image Turbo and upscale with SeedVR2 ComfyUI workflow.
  Trigger on: "角色定制", "character design", "Z-Image", "角色初稿",
  "character draft", "SeedVR2", "超分辨率", "upscale".
  Distinguishes from frame-character-multiview by generating the initial
  character image (not multi-view), using Z-Image Turbo + SeedVR2 pipeline.
disable-model-invocation: false
user-invocable: true
---

# 角色定制 (Character Design)

> **阶段**: S3 · 角色资产 (Stage 3)
> **输入**: S2 Shortlist 角色需求清单 + S1 角色描述
> **产出**: 高分辨率角色定稿图（png）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S3 角色初稿）
> **验收**: `opsv validate --dir videospec --category frame_character_design` + 角色审阅

---

## 1. 职责边界

**你做**：
- 为每个角色编写 Z-Image prompt（角色外观描述 + 风格标签）
- 调用 `opsv comfy` 编译角色生成任务
- 执行 `opsv run` 生成角色图
- 可选：启用 SeedVR2 超分流程

**你不做**：
- 生成多视图（那是 frame-character-multiview 的事）
- 修改场景/道具资产（那是 S4 的事）

---

## 2. 触发条件

- S2 Shortlist 已确定角色需求清单
- S1 Script.md 已完成角色描述

---

## 3. 工作流程

```
S1 角色描述 + S2 Shortlist 角色清单
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 编写 Z-Image prompt   │
│   角色外观 + 服装 + 风格       │
│   半身正面照 + 纯灰背景        │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建角色文档          │
│   elements/character_        │
│   LuRan.md                    │
│   frontmatter: prompt +      │
│   generation_type: image     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行角色生成     │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_character_     │
│          design               │
│   opsv run <task.json>       │
│   → 产出 png 角色图           │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: SeedVR2 超分(可选)    │
│   将 1200x1808 → 2560x3840   │
│   保留角色细节                 │
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
5 步：写 prompt → 创建文档 → 编译执行 → 超分(可选) → 审阅回写。

### ② 依赖处理
- **上游**: S1 Script.md + S2 Shortlist
- **验证**: `opsv refs check` 确认无外部 refs（文生角色不依赖图像资产）

### ③ 提示词生成
- prompt 包含角色外观 + 服装 + 风格 + 背景
- 示例：`"一位年轻的中国古装美女，额头一点梅花印，公主发髻，珠翠妆点，穿着绣有金凤的黑色皇女袍服。汉代风格，半身，正面照，标准姿态，8k 细节，纯灰色无缝背景。"`

### ④ 引用语法
- 角色定制不需要 refs.image
- 但后续 frame-character-multiview 会引用此资产

### ⑤ 任务环编排
- 每个角色独立编译，可并行执行
- SeedVR2 超分在同一个 Circle 中串行执行

### ⑥ 迭代与 Review
- 角色外观不对 → 调整 prompt → `opsv iterate` → 重新生成
- 审阅标准：角色是否符合描述、细节是否清晰
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/z-image/character_LuRan_1.png"
```

---

## 5. 注意事项（踩过的坑）

1. **Z-Image Turbo** — 使用 `z-image-turbo-fp16-aio.safetensors` UNET，4 步推理
2. **CLIP: qwen_3_4b** — Flux2 Lumina 类型 CLIP
3. **SeedVR2 BlockSwap** — 内存优化配置（blocks_to_swap=16）
4. **SeedVR2 Extra Args** — tiled VAE（tile_size=512, overlap=64）
5. **超分分辨率** — 默认 2560px 长边
6. **Root 目录 .md 不验证** — 角色文档放在 `elements/` 下

---

## 6. references/

- `references/character_design_template.md` — 角色设计文档模板
- `references/sample_character.md` — 完整角色设计示例
- `references/seedvr2_upscale_guide.md` — SeedVR2 超分参数指南

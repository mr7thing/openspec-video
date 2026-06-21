---
name: frame-character-multiview
description: >
  角色三视图扩展 — 基于 Qwen Image Edit 2511 的 i2i 角色多视图生成。
  输入角色描述 + 参考图，输出多角度角色设定图（正面/侧面/背面）。
  Use this skill whenever the user wants to generate character multi-view sheets
  using the Qwen Image Edit 2511 ComfyUI workflow.
  Trigger on: "三视图", "character multiview", "角色多角度", "i2i character",
  "character sheet", "多角度角色", "multi-view".
  Distinguishes from multi-ref-pack's create-character-multiview by using
  Qwen Image Edit 2511 (not GPT Image 2) with KepStringList prompt parsing
  and ImageStitch output.
disable-model-invocation: false
user-invocable: true
---

# 角色三视图扩展 (Character Multiview)

> **阶段**: S3 · 角色资产 (Stage 3)
> **输入**: S2 Shortlist 角色需求清单 + S1 角色描述
> **产出**: 多视角角色设定图（png 拼接图）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S3 三视图）
> **验收**: `opsv validate --dir videospec --category frame_character_multiview` + 角色审阅

---

## 1. 职责边界

**你做**：
- 为每个角色编写多视图 prompt（正面/侧面/背面描述）
- 上传角色参考图作为 input image
- 调用 `opsv comfy` 编译三视图生成任务
- 执行 `opsv run` 生成多视图角色图

**你不做**：
- 修改场景/道具资产（那是 S4 的事）
- 生成视频（那是 S7 的事）

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
│ Step 1: 编写多视图 prompt     │
│   角色描述 + 正面/侧面/背面    │
│   使用 KepStringList 解析      │
│   3 个视角各一个 prompt        │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建角色文档          │
│   elements/character_        │
│   LuRan.md                    │
│   frontmatter: prompt +      │
│   refs.image (参考图)         │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行             │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_character_     │
│          multiview            │
│   opsv run <task.json>       │
│   → 产出 png 多视图拼接图      │
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
- **验证**: `opsv refs check` 确认 `refs.image` 中的角色参考图已 `approved`

### ③ 提示词生成
- 使用 `KepStringListFromNewline` 节点解析多行 prompt
- 每个视角一个 prompt（index 0/1/2）
- 包含角色外观描述 + 风格标签 + 一致性约束
- 示例：`"一位年轻的中国古装美女，公主发髻，黑色皇女袍服。角色设定图：多角度正交视图。三张全身图..."`

### ④ 引用语法
- `refs.image` 包含角色参考图
- 编译时 OPSV 将 `@id` 解析为实际图像路径

### ⑤ 任务环编排
- 每个角色独立编译，可并行执行
- 在同一 Circle 中处理所有角色

### ⑥ 迭代与 Review
- 角色外观不对 → 调整 prompt → `opsv iterate` → 重新生成
- 审阅标准：角色一致性（多角度外观相同）、风格是否符合设定
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/qwen-edit/character_LuRan_multiview_1.png"
```

---

## 5. 注意事项（踩过的坑）

1. **Qwen Image Edit 2511** — 使用 `qwen_image_edit2511满血版.safetensors` UNET
2. **LoRA: qwen-image-edit-2511多角度** — 专门针对多角度角色生成的 LoRA
3. **LoRA: Qwen-Image-Lightning-8steps** — 加速到 8 步推理
4. **ImageStitch** — 正面图和全身图自动拼接为一张输出
5. **CR Prompt Text 节点** — 每个视角有独立的 prompt 模板（role-3view-fullbody / role-3view-halfbody）
6. **root 目录 .md 不验证** — 角色文档放在 `elements/` 下

---

## 6. references/

- `references/character_multiview_template.md` — 角色多视图文档模板
- `references/sample_character_multiview.md` — 完整角色多视图示例

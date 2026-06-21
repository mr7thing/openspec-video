---
name: create-scene-multiview
description: 场景多视图参照表生成 — 对每个高频场景生成多角度背景参照，供 S5/S6 做场景一致性约束。产出 elements/Scene-{scene_id}-MultiView.md
---

# 场景多视图 (Scene Multi-View)

> **阶段**: S4.5 · 资产扩展
> **依赖**: `create-elements` Phase 1（场景内角色已定档）
> **输入**: `videospec/shortlist.md`（`scenes[]` + `shots[]`）
> **产出**: `videospec/elements/Scene-{scene_id}-MultiView.md`
> **验收**: `opsv validate --dir videospec --category scene_multi_view`

---

## 1. 为什么需要场景多视图

同一场景在不同镜头中角度不同（远景/中景/近景），但背景必须一致。场景多视图提供场景全景布局和多角度背景基准。

---

## 2. 何时执行

`create-elements` Phase 1 全部 approved 后执行。按 `scenes[].frequency` 降序，single 场景可跳过。

---

## 3. 执行流程

1. 读取 `videospec/shortlist.md`，提取：
   - `scenes[]` → 场景 ID、名称、时间段
   - `shots[]` → 该场景的所有 Shot（`shot_type`、`camera_movement`、`time_of_day`）
2. 读取该场景内出现的角色文档（`elements/{character_id}.md`），取 `design.reference_style`
3. 将以上数据直接填入下方的系统提示词模板
4. 把完整 prompt 写入产出文档的 `prompt` 字段
5. 填写 `description`：一句话说明（如"道场日景多视图参照表"）
6. 填写 `refs`：引用的场景 + 角色文档 ID
7. 调用图片生成模型。多视图类图像优先用 GPT Image 2 或 Nano Banana 2
8. 产出 `videospec/elements/Scene-{scene_id}-MultiView.md`，执行验证

---

## 4. 系统提示词模板

```
你是专业的"场景多视图参照表大师"，从场景描述和角色信息派生出完整的多角度场景参照表，用于 AI 视频生成中的跨镜头一致性约束。

生成一张带中文标注的"场景多视图参照表"：
- 精准还原场景空间布局、建筑设计、光影方向
- 所有角度必须是同一地点（same location consistency）

【场景信息】
场景：{scene_name}
位置：{location}
描述：{scene_description}
时段：{time_of_day}
风格：{reference_style}

【布局要求】
白底布局，多角度横向排列，每个角度独立成格：
- 【全景定场】：场景整体布局，所有镜头的空间参照，广角构图
- 【主要活动区】：角色对话/动作发生的核心区域，中景构图
- 【焦点物体】：场景内核心道具/建筑近景（如有）
{extra_angles}

标注规则：
- 每个角度只显示中文标题，不显示百分比数字
- 绝对不要任何边框、方框、矩形框
- 标题用清晰黑体字

视觉要求：
- 纯白背景，柔和均匀光
- 真实照片级别，8K 超高清
- {reference_style}
- 模块间无框线分隔，自然过渡

一致性是最高优先级：所有角度必须是同一地点，建筑结构、地面纹理、光影方向完全一致。这是 AI 视频生成的跨镜头一致性基准。

{time_variants_note}
```

---

## 5. 产出模板

```yaml
---
category: scene_multi_view
status: drafting
id: Scene-{SceneName}-MultiView
description: "{一句话说明，如：道场日景多视图参照表}"
generation_type: image
refs:
  - {SceneName}
  - {CharacterID1}
  - {CharacterID2}
prompt: >
  {系统提示词模板填入场景数据后的完整 prompt}
---
```

---

---

## 5. 这 7 个关切在本技能如何贯彻

### ① 生产流程
- 读取 `shortlist.md` frontmatter 的 `scenes[]` 和 `shots[]`
- 生成场景多视图参考页 `elements/Scene-{scene_id}-MultiView.md`
- 包含广角/中景/特写/俯拍等多角度 prompt

### ② 依赖处理
- **上游**：S4 create-elements 产出的场景空镜 + 场景内角色定档
- **下游**：S5 shot-reference 的 `@Scene-{id}-MultiView` 引用

### ③ 提示词生成
- 每视角独立 prompt，以场景定档文档的 description 为锚点
- 必须读取源场景文档的构图/光照/空间信息

### ④ 引用语法
- `refs.image` 下声明 `@scene_id`，指向已 approved 的场景图路径
- 字典结构，非数组形式

### ⑤ 任务环编排
- 产出文档后 `opsv validate --category scene_multi_view`
- 通过后 `opsv circle refresh`（场景已有依赖关系，通常不 create）
- `opsv imagen --model volcengine.seadream --category scene_multi_view` 编译

### ⑥ 迭代与 Review
- 迭代走标准 `opsv iterate` + `opsv run` + `opsv review` + `opsv approved` 流程
- 场景不满足 → 改任务 JSON 的对应视角 prompt → 重跑

### ⑦ 资产回写
- approved 变体写入源文档 `## Approved References`，按视角 alt 命名

---

## 6. references/

| 文件 | 用途 |
|------|------|
| `sample_scene_multiview.md` | 场景多视图完整产出参考（Temple-Day-MultiView） |

---
name: create-character-multiview
description: 角色多视图参照表生成 — 从 Phase 1 角色定稿派生多角度参照表，供 S5/S6 跨镜头一致性约束。产出 elements/{id}-MultiView.md
---

# 角色多视图 (Character Multi-View)

> **阶段**: S4.5 · 资产扩展
> **依赖**: `create-elements` Phase 1（角色已 approved）
> **输入**: `videospec/elements/{character_id}.md`
> **产出**: `videospec/elements/{character_id}-MultiView.md`
> **验收**: `opsv validate --dir videospec --category character_multi_view`

---

## 1. 为什么需要多视图

单张角色立绘无法覆盖所有镜头角度。S5/S6 需要一套多角度参照表来保证跨镜头一致性。

---

## 2. 何时执行

角色 Phase 1 `status: approved` 后立即生成。按 `frequency` 降序：high 先做，medium 次之，single 可跳过。

---

## 3. 执行流程

1. 读取 `videospec/elements/{character_id}.md`，从 frontmatter 中直接取以下字段的值（不做任何转换）：
   - `id` → 角色名
   - `design.appearance` → 外观
   - `design.height` → 身高
   - `design.outfit_default` → 默认服装
   - `design.material` → 材质
   - `design.key_features` → 关键特征（逗号拼接）
   - `design.reference_style` → 风格
   - `wardrobe[].description` → 服装列表（换行拼接）
   - `carried_props[].description` → 道具列表（换行拼接）
2. 将以上值直接填入下方的系统提示词模板，生成完整 prompt
3. 把完整 prompt 写入产出文档的 `prompt` 字段
4. 填写 `description`：一句话说明这是什么多视图（如"陆然默认服装多视图参照表"）
5. 填写 `refs`：引用的上游文档 ID 列表
6. 调用图片生成模型。多视图类图像优先用 GPT Image 2 或 Nano Banana 2
7. 产出 `videospec/elements/{character_id}-MultiView.md`，执行验证

---

## 4. 系统提示词模板

```
你是专业的"角色多视图参照表大师"，从单张角色定稿图派生出完整的多角度角色参照表，用于 AI 视频生成中的跨镜头一致性约束。

基于角色定稿图中的人物，生成一张带中文标注的"角色多视图参照表"：
- 100% 保持角色面部特征、发型、身材比例
- 精准还原服装款式、颜色、材质质感
- 所有视图中的角色长相完全一致

【角色信息】
姓名：{id}
身高：{design.height}cm
外观：{design.appearance}
服装：{design.outfit_default}
材质：{design.material}
关键特征：{design.key_features}
风格：{design.reference_style}

【布局要求】
白底布局，中央为角色全身正面标准立绘（约占 40% 空间），周围四个模块均匀分布：
- 左上【服装拆解】：平铺展示以下服装单品，每件独立呈现、真实材质——
{wardrobe_descriptions}
- 右上【表情集】：4 种面部特写（平静、微笑、惊讶、严肃），五官与中央主体完全一致
- 左下【多角度视图】：横向排列 4 个角度（3/4左侧、3/4右侧、侧身、背面），服装发型全部一致
- 右下【随身道具】：平铺展示——
{carried_props_descriptions}

标注规则：
- 每个模块只显示中文标题，不显示百分比数字
- 绝对不要任何边框、方框、矩形框
- 标题用清晰黑体字，可用细线连接中央人物与各模块

视觉要求：
- 纯白背景，柔和均匀摄影棚光
- 真实照片级别，8K 超高清
- {design.reference_style}
- 模块间无框线分隔，自然过渡

一致性是最高优先级：所有视图中的面部、服装、发型、身高比例必须完全一致。这是 AI 视频生成的跨镜头一致性基准，不一致会导致后续所有镜头崩坏。
```

---

## 5. 产出模板

```yaml
---
category: character_multi_view
status: drafting
id: {id}-MultiView
description: "{一句话说明，如：{角色名}默认服装多视图参照表}"
generation_type: image
refs:
  - {id}
prompt: >
  {系统提示词模板填入角色数据后的完整 prompt}
---
```

---

---

## 5. 这 7 个关切在本技能如何贯彻

### ① 生产流程
- 读取 S4 产出的角色定档 `elements/{character_id}.md` frontmatter
- 生成多视图参考页 `elements/{character_id}-MultiView.md`
- 包含全身/半身/特写/45° 等多角度 prompt

### ② 依赖处理
- **上游**：S4 create-elements 产出的 `elements/{character_id}.md`（status: approved）
- **下游**：S5 shot-reference 的 `@character_id-multiview` 引用

### ③ 提示词生成
- 每视角独立 prompt，以 `@character_id` 锚定角色视觉特征
- 必须读取源角色文档的 `design` 字段（outfit/height/wardrobe/carried_props）

### ④ 引用语法
- `refs.image` 下声明 `@character_id`，指向已 approved 的角色图路径
- 字典结构，非数组形式

### ⑤ 任务环编排
- 产出文档后 `opsv validate --category character_multi_view`
- 通过后 `opsv circle create`（如首次），日常用 `refresh`
- `opsv imagen --model volcengine.seadream --category character_multi_view` 编译

### ⑥ 迭代与 Review
- 迭代走标准 `opsv iterate` + `opsv run` + `opsv review` + `opsv approved` 流程
- 多视图不满足 → 改任务 JSON 的对应视角 prompt → 重跑

### ⑦ 资产回写
- approved 变体写入 `## Approved References`，按视角 alt 命名（`![fullbody](path)` / `![portrait](path)` 等）

---

## 6. references/

| 文件 | 用途 |
|------|------|
| `sample_character_multiview.md` | 角色多视图完整产出参考（LuRan-MultiView） |

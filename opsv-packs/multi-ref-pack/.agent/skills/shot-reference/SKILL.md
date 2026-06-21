---
name: shot-reference
description: 镜头参考帧 — 每个 shot 生成一张单帧合成参考图，将角色置入场景并融合光影风格，作为后续分镜和视频生产的构图参考。
---

# 镜头参考帧 (Shot Reference Frame)

> **阶段**: S5 · 镜头参考帧 (Stage 5)
> **输入**: S4 角色多视图（`@LuRan-multiview`）+ S4 场景定稿（`@Dojo-Day`）+ S1 镜头描述
> **产出**: 单帧合成参考图（png）+ 英文 prompt 文档
> **技能数**: 1（本技能独占 S5）
> **验收**: `opsv validate --dir videospec --category shot_ref` + 人工审阅构图和光影

---

## 1. 职责边界

**你做**：
- 为每个 shot 生成**一张**关键帧合成参考图
- 将角色（引用角色多视图）置入场景（引用场景定稿）
- 重点产出：**光影风格融合** — 角色在白底多视图里是干净的，但放入场景后该有什么色调、阴影、氛围，全靠这张参考帧定义
- 这张参考帧会被 S5.5 分镜和 S6 视频生产作为参考图引用

**你不做**：
- 生成多格/时间线分解（那是 S5.5 `shot-storyboard` 的事）
- 修改角色/场景资产（那是 S4 的事）
- 生成视频（那是 S6 `shot-production` 的事）

---

## 2. 触发条件

- S4 资产全部 `approved`（角色多视图、场景定稿图可用）
- S4.5 角色/场景多视图已完成
- S3 拍摄计划已确定镜头顺序

---

## 3. 工作流程

```
S4 角色多视图 + S4 场景定稿 + S1 镜头描述
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 确定关键帧时刻       │
│   从 S1 shot 描述中选一个    │
│   最有代表性的"决定性瞬间"    │
│   （起手式 / 对峙定格 / 落幅）│
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 编写单帧 prompt      │
│   角色外观（从多视图取） +    │
│   场景空间（从场景定稿取） +  │
│   光影融合（色调/阴影/氛围）  │
│   引用 @角色多视图 + @场景    │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 创建参考帧文档        │
│   shots/epXX/shot_ref_       │
│   S01-Shot01.md               │
│   frontmatter: prompt +   │
│   refs.image（角色多视图+场景）│
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 编译+执行参考帧生成   │
│   opsv imagen --manifest M   │
│          --category shot_ref │
│   opsv run <task.json...>    │
│   → 产出单帧合成参考图        │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 5: 审阅+审批+资产回写    │
│   opsv review --circle       │
│   opsv approved              │
│   回写 asset_id 到参考帧文档  │
└─────────────────────────────┘
```

---

### Step 1: 确定关键帧时刻

每个 shot 选**一个决定性瞬间**作为参考帧：

- **动作 shot**: 起手式的定格瞬间
- **对话 shot**: 话说到一半的表情/姿势
- **空镜 shot**: 场景最具代表性的构图
- **转场 shot**: 镜头运动的落幅

> 不要追求"最帅的瞬间"，要追求"最能代表这个镜头构图的瞬间"。

### Step 2: 编写单帧 prompt (核心)

单帧参考图的核心价值是**光影风格融合**。Prompt 必须包含：

| 要素 | 来源 | 说明 |
|------|------|------|
| 角色外观 | S4 多视图 `@LuRan-multiview` | 姿势、服装、身高比例 |
| 场景空间 | S4 场景 `@Dojo-Day` | 环境布局、空间纵深 |
| 光影融合 | 你设计 | 角色在场景里的色调/阴影/氛围 |

#### Prompt 结构

```
[角色描述] in [场景描述], [光影融合描述], [构图/景别], [风格标签].

角色站位和服装参考 @LuRan-multiview 的多视图定稿
场景空间布局参考 @Dojo-Day 的场景定稿
```

**示例**：

```yaml
prompt: >
  @LuRan-multiview standing at the center of @Dojo-Day temple courtyard,
  bathed in warm golden morning light streaming from the left.
  Long shadows stretch across the stone floor, crimson robes catching
  the sunlight with a soft rim glow. Wide shot, low angle, emphasizing
  the towering temple architecture behind him.
  Chinese ancient fantasy style, 3D render, cinematic lighting, Unreal Engine quality.
```

### Step 3: 创建参考帧文档

```yaml
---
category: shot_ref
status: drafting
id: shot-ref-S01-Shot01
shot_id: S01-Shot01
generation_type: image
key_moment: "陆然步入道场，晨光初照的起手式停顿"
prompt: >
  @LuRan-multiview standing at the center of @Dojo-Day temple courtyard,
  bathed in warm golden morning light streaming from the left...
refs:
  image:
    "@LuRan-multiview":         # 角色多视图（外观/服装/姿势参照）
      - <path/to/LuRan-multiview.png>
    "@Dojo-Day":                # 场景空镜（空间布局参照）
      - <path/to/Dojo-Day.png>
---
```

> **关键字段**：
> - `key_moment`: 中文描述，说明为什么选这个瞬间
> - `refs.image`: 角色多视图 + 场景空镜（两张参考图足够合成）
> - 不需要道具——如果道具出现在该镜头，由场景或角色多视图承载

### Step 4-5: Circle refresh + 编译

```bash
# 刷新 Circle，包含新增的参考帧文档
opsv circle refresh --dir videospec

# 编译参考帧生成任务
opsv imagen --manifest opsv-queue/<project>_circle1/_manifest.json --dir videospec --category shot_ref

# 执行
opsv run opsv-queue/<project>_circle1/*/*.json
```

### Step 6: 审阅 + 回写

```bash
opsv review --circle
opsv approved
```

审批后回写 `asset_id` 到参考帧文档（供 S5.5 和 S6 引用）。

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
5 步：选关键帧 → 写 prompt → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S4 角色多视图 + 场景定稿 `approved`
- **验证**: `opsv refs check` 确认 `refs.image` 中 `@LuRan-multiview` 和 `@Dojo-Day` 都已 `approved`

### ③ 提示词生成
- 单帧 prompt，不是九宫格
- 核心价值在**光影融合**——角色在场景里的色调/阴影/氛围
- 引用角色多视图（非白底角色图）和场景空镜
- prompt 必须描述角色在场景中的光影效果

### ④ 引用语法
- `refs.image` 包含 2 类引用：角色多视图 + 场景空镜
- prompt 中通过 `@id` 引用
- 编译时 OPSV 自动解析为实际图像路径

### ⑤ 任务环编排
- 与 S5.5 shot-storyboard 属于同一批
- shot-storyboard 依赖本阶段的参考帧（先于 shot-storyboard 执行）
- OPSV 编译时通过 `refs.image` 中的 `@id` 自动建立依赖边

### ⑥ 迭代与 Review
- 光影不对 → 调整 prompt 的光影描述 → `opsv iterate` → 重新生成
- 构图不对 → 调整 key_moment 选点 + 景别 → 重新生成
- 审阅标准：角色在场景中是否自然、光影色调是否统一、构图是否合理
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`（跳过 syncing）
  - 有修改（iterate 改了 prompt/refs）：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
`syncing` 状态下回写 `asset_id` 到参考帧文档 frontmatter，供 S5.5 和 S6 `@id` 引用。

---

## 5. 注意事项

1. **单帧不是缩略图** — 是完整的构图合成，质量要求与 S4 资产同级
2. **光影融合是核心** — 这张图最独特的价值是向 AI 展示"角色在这个场景里的光影效果"
3. **key_moment 要有代表性** — 选错了瞬间，后面分镜和视频都偏
4. **引用角色多视图而非白底图** — 多视图有姿势信息，比白底单图更有用
5. **一张 shot 只出一张参考帧** — 不需要多张，一张足够传达构图和光影
6. **severity: warning 必须配 min_length**
7. **YAML key 和 category 大小写一致**
8. **`---` 分隔符成对**
9. **root 目录 .md 不验证** — 参考帧文档放在 `shots/epXX/` 下

---

## 6. references/

- `references/sample_shot_ref.md` — 镜头参考帧完整范本（含字段说明和编写要点）

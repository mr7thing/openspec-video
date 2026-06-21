---
name: shot-production
description: ⛔ SUPERSEDED — 视频生产请使用 `shotgen` 技能。本技能为旧版单镜头模式，已被 shotgen 的镜头组模式取代。详见 ../shotgen/SKILL.md。
---

# 视频生产 (Shot Production)

> **阶段**: S6 · 视频生产 (Stage 6)
> **输入**: S4 角色多视图 + S4 场景空镜 + S5 镜头参考帧 + S5.5 分镜草图 + S1 Script.md 镜头描述
> **产出**: 视频片段（mp4/webm）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S6）
> **验收**: `opsv validate --dir videospec --category shot_production` + 视频审阅

---

## 1. 职责边界

**你做**：
- 编写每个 shot 的视频生成 prompt（基于 S1 镜头描述 + S5 参考帧构图 + S5.5 分镜趋势）
- 设置多参考图引用：角色多视图 + 场景空镜 + 镜头参考帧 + 分镜草图（4 类参考图）
- 调用 `opsv animate` 编译视频生成任务
- 执行 `opsv run` 生成视频片段
- 设置 `duration`、`seed` 等生成参数
- 处理视频审阅后的迭代（补帧、重绘、微调）

**你不做**：
- 修改角色/场景资产（那是 S4 的事）
- 修改镜头参考帧（那是 S5 的事）
- 修改分镜草图（那是 S5.5 的事）
- 后期剪辑（那是交付阶段的事）
- 声音设计（那是 S7 的事）

---

## 2. 触发条件

- S4 资产全部 `approved`（角色多视图、场景空镜都可用）
- S5 镜头参考帧全部 `approved`（每镜头的合成参考通过审阅）
- S5.5 分镜草图全部 `approved`（每镜头的草图都通过审阅）

---

## 3. 工作流程

```
S4 角色多视图 + S4 场景空镜 + S5 镜头参考帧 + S5.5 分镜草图 + S1 镜头描述
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 组合参考图 + 写 prompt│
│   每个 shot 的视频 prompt =    │
│   场景动态描述 + 镜头过渡 +    │
│   角色动作 + 光影变化          │
│   参考图 = @角色多视图 +       │
│   @场景空镜 + @镜头参考帧 +    │
│   @分镜草图                    │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建 shot 生产文档    │
│   shots/epXX/shot_           │
│   production_S01-Shot01.md    │
│   frontmatter: prompt +      │
│   duration + seed + refs.image│
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行视频生成     │
│   opsv animate --manifest M  │
│           --category         │
│           shot_production│
│   opsv run <task.json...>    │
│   → 产出 mp4 视频片段         │
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

### Step 1: 组合参考图 + 编写视频 prompt (核心)

这是整个管线最关键的步骤。视频 prompt 不是从零写，而是**组合已有的信息**：

#### 参考图组合策略

每个 shot 的视频生成需要 **4 类参考图**：

| 参考图类型 | 来源 | 作用 | 必填 |
|-----------|------|------|------|
| 角色多视图 | S4 `@LuRan-multiview` | 角色外观/服装/姿势一致性 | ✅ |
| 场景空镜 | S4 `@Dojo-Day` | 场景/空间一致性 | ✅ |
| 镜头参考帧 | S5 `@shot-ref-S01-Shot01` | 角色×场景光影风格融合，降低 AI 合成难度 | ✅ |
| 分镜草图 | S5.5 `@storyboard-S01-Shot01` | 构图/运镜/时间线指导 | ✅ |

> **Seedance 多参考图机制**：每类参考图作为独立输入传入模型，模型同时参考角色外观、场景空间、光影融合和构图趋势生成视频。不支持前后帧（frame）参考。
>
> **镜头参考帧的价值**：角色多视图是白底的，场景空镜是纯背景的。镜头参考帧把两者合在一起并融了光影——AI 看到它就知道"哦，这个角色在这个场景里是这个光线效果"，大幅降低视频生成的合成难度。

#### 视频 prompt 结构

```
[场景氛围描述] + [角色动作描述] + [镜头运动描述] + [光影/色彩变化描述]

场景氛围: 基于 S2 场景定档的 mood + lighting + color_palette
角色动作: 基于 S1 shot 的 action + dialogue（有台词时）
镜头运动: 基于 S1 shot 的 camera_movement + shot_type
光影变化: 基于 S5 镜头参考帧的光影 + S1 shot 的 mood
```

**示例**：

```yaml
# shot S01-Shot01 的视频 prompt
prompt: >
  A martial artist in flowing red robes walks slowly into a traditional
  Japanese dojo temple courtyard at dawn. Morning light streams through
  the wooden doors, casting long dramatic shadows. The camera dollies in
  smoothly from a wide establishing shot, tracking his confident stride.
  Dust particles float in the golden sunbeams. Warm earthy tones with
  splashes of red. Cinematic, 4k, volumetric lighting.
```

#### Ref 引用设置

```yaml
refs:
  image:
    "@LuRan-multiview":              # 角色多视图（S4）
      - <path/to/LuRan-multiview.png>
    "@Dojo-Day":                     # 场景空镜（S4）
      - <path/to/Dojo-Day.png>
    "@shot-ref-S01-Shot01":          # 镜头参考帧（S5）— 光影风格融合
      - <path/to/shot-ref.png>
    "@storyboard-S01-Shot01":        # 分镜草图（S5.5）
      - <path/to/storyboard.png>
```

> **重要**：所有引用图都在 `refs.image` 中，都是 `image` 类型。refs 是双层字典结构（外层 input_type，内层 `@id`，值是路径数组），不是数组——见 `../opsv-ref-pipeline/references/refs_guide.md`。

### Step 2: 创建 shot 生产文档

```yaml
---
category: shot_production
status: drafting
id: shot-S01-Shot01
shot_id: S01-Shot01
prompt: "..."               # 视频 prompt（>= 50 字符）
duration: 4.5               # 秒数
seed: -1                    # -1 = 随机
fps: 24                     # 帧率
refs:
  image:
    "@LuRan-multiview":
      - <path>
    "@Dojo-Day":
      - <path>
    "@shot-ref-S01-Shot01":
      - <path>
    "@storyboard-S01-Shot01":
      - <path>
---
```

### Step 3: 编译 + 执行

```bash
# 编译视频任务（用 animate 命令）
opsv animate --manifest opsv-queue/<project>_circleN/_manifest.json --dir videospec --category shot_production

# 执行
opsv run opsv-queue/<project>_circleN/*/*.json
```

### Step 4: 审阅 + 回写

```bash
opsv review --circle
opsv approved --file "@shot-S01-Shot01"
```

审批后回写 `asset_id`。

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
4 步：组合参考图+写prompt → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S4 资产 `approved` + S5 镜头参考帧 `approved` + S5.5 分镜 `approved`
- **验证**: `opsv refs check` 确认 `refs.image` 中每个 `@id` 都已 `approved` 且可解析

### ③ 提示词生成
视频 prompt 的编写规则：
- 基于 S1 镜头描述的场景 + 动作 + 运镜信息
- 结合 S2 场景定档的氛围/光影描述
- **光影以 S5 镜头参考帧为基准** — 文字描述的光影方向/色调应与参考帧一致
- **prompt 要能跟分镜草图的构图配合起来**（参考图 + 文字描述双重约束）
- 视频类文档统一用 `prompt` 字段（不是 `visual_detailed`/`visual_brief`）—— validate 的 `refs_in_prompt_must_match_refs` 只看 `prompt` 字段
- **>= 50 字符**（否则 validate 警告）

### ④ 引用语法
- `refs.image` 包含 4 类引用：角色多视图 + 场景空镜 + 镜头参考帧 + 分镜草图
- 编译时 OPSV 将 `@id` 解析为 `asset_id` 对应的实际文件路径
- **不支持 frame refs**（Seedance 目前没有前后帧机制）

### ⑤ 任务环编排
- 编译时自动检查所有上游资产的 `status: approved`
- 编译时 OPSV 将 `@id` 解析为对应的图像路径

### ⑥ 迭代与 Review
- 视频不合预期 → `opsv iterate <task_path>` → 修改 prompt/duration/seed → 重新运行
- 迭代后新文件由 OPSV 以任务 JSON 名为基础自动命名（`{json名}_{序号}` / `{json名}_m{序号}_{序号}`），历史版本保留
- 审阅标准：角色一致性、画面流畅度、构图是否符合分镜、无闪烁/畸变
- 如需修改参考图 → 回 S4/S5/S5.5 迭代，再回到 S6
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`（跳过 syncing）
  - 有任务文件修改（iterate 改了 prompt/duration/seed）：标记 `syncing` → Guardian 从任务文件读取新 prompt/refs 回写到文档 → `opsv approved`

### ⑦ 资产回写
`syncing` 状态下回写 `asset_id` 到 shot 生产文档。无修改时直接 `approved`，不进 syncing。
```yaml
asset_id: "opsv-queue/<project>_circleN/<provider>.<model>/shot-S01-Shot01_1.mp4"   # 命名规则见 references/post_review_iteration.md
```

---

## 5. 注意事项（踩过的坑）

1. **4 类参考图缺一不可** — 角色多视图保证外观一致，场景空镜保证空间一致，镜头参考帧保证光影风格融合，分镜图保证构图一致
2. **镜头参考帧是光影基准** — prompt 中描述的光影方向/色调必须与参考帧一致，不能文字说左侧光、参考帧是右侧光
3. **prompt 必须与分镜草图配合** — 文字描述 + 草图参考图双重约束，两者不能矛盾
4. **seed = -1 每次不同** — 交付前固定 seed；迭代时用 `opsv iterate` 不改变 seed
5. **`fps` 字段** — OPSV segment schema 没有 fps 字段（API 不接受）
6. **duration 默认 4s** — 太短内容不够，太长模型可能崩。4~6s 最佳
7. **v0.11.3** — 视频类文档用 `prompt` 字段（统一字段名），图像类也用 `prompt`；`visual_detailed`/`visual_brief` 是辅助字段不参与 refs 校验
8. **severity: warning 必须配 min_length**
9. **YAML key 和 category 大小写一致**
10. **`---` 分隔符成对**
11. **root 目录 .md 不验证** — shot 生产文档放在 `shots/epXX/` 下

---

## 6. references/

- `references/video_prompt_guide.md` — 视频 prompt 编写指南（正反面示例、常见陷阱）
- `references/seedance_params.md` — Seedance 参数手册（duration/seed/cfg/step 详解）
- `references/post_review_iteration.md` — 审阅后迭代流程（迭代参考图 vs 修改 prompt）
- `guides/seedance-prompt-spec.md` — Seedance 提示词规范（7 层结构、frontmatter+body、质量检查清单）

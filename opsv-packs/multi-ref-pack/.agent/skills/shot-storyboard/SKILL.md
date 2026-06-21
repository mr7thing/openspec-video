---
name: shot-storyboard
description: 分镜多格草图 — 将镜头描述转化为 3×3 九宫格/多格分镜参考图。包含三色运动标注（🔴红=人物运动，🔵蓝=镜头运动，🟢绿=特效/冲击/能量）、正反打体系、镜头语言语法。引用角色多视图、场景空镜和 S5 镜头参考帧，指导视频生成的构图和运镜。
---

# 分镜草图 (Shot Storyboard)

> **阶段**: S5.5 · 分镜草图 (Stage 5.5)
> **输入**: S4 资产（角色多视图/场景空镜 `approved`）+ S5 镜头参考帧 + S1 Script.md 镜头描述
> **产出**: 多格分镜草图（3×3 或自定义网格 png）+ 英文 prompt 文档
> **技能数**: 1（本技能独占 S5.5）
> **验收**: `opsv validate --dir videospec --category shot_storyboard` + 人工审阅草图质量

---

## 核心特性：三色运动标注

分镜草图不仅是画面构图预览，更是**运动设计蓝图**。画面本体是灰黑铅笔稿，彩色线条标注三类运动：

| 颜色 | 标注对象 | 线型约定 |
|------|---------|---------|
| ⚫ **灰/黑** | 铅笔稿本体 | 素描线（角色轮廓、场景结构） |
| 🔴 **红色** | 人物/物体运动 | 实线箭头（行走/奔跑/跳跃/挥砍等） |
| 🔵 **蓝色** | 镜头运动 | 虚线箭头（推/拉/摇/移/跟/升降等） |
| 🟢 **绿色** | 特效/冲击/能量 | 波浪线/点线箭头（爆炸冲击波/光线方向/速度线/粒子轨迹） |

- 🔴红色标注"画面里谁往哪动"
- 🔵蓝色标注"镜头怎么动"
- 🟢绿色标注"冲击波/光线/能量往哪去"
- 三色叠加时（如角色右跑+镜头跟移+冲击波扩散），颜色各自独立不混淆
- Prompt 中**必须显式描述每格的三色线需求**

---

## 1. 职责边界

**你做**：
- 为每个 shot 编写 3×3 九宫格英文 prompt（或自定义格数）
- prompt 中包含**三色运动标注指令**（🔴红=人物运动轨迹，🔵蓝=镜头运动轨迹，🟢绿=特效/冲击/能量）
- prompt 中引用 S5 镜头参考帧（`@shot-ref-S01-Shot01`）作为构图基准
- prompt 中引用角色多视图（`@LuRan-multiview`）和场景空镜（`@Dojo-Day`）
- 通过 `opsv imagen` 编译并生成多格草图
- 草图聚焦于：画面构图、角色位置、镜头运动、物体动作 + **红蓝运动线**
- 草图**背景不重要**——干净背景或简略示意即可，重点在主体和动态

**你不做**：
- 修改角色/场景资产（那是 S4 的事）
- 修改镜头参考帧（那是 S5 的事）
- 追求草图的美观度（草图是指导视频生成的"蓝图"，不是成品）
- 生成完整视频（那是 S6 `shot-production` 的事）
- 声音设计（那是 S7 的事）

---

## 2. 触发条件

- S4 资产全部 `approved`（角色多视图、场景空镜可用）
- S5 镜头参考帧全部 `approved`（每镜头的单帧合成参考通过审阅）
- S3 拍摄计划已确定镜头顺序

---

## 3. 工作流程

```
S5 镜头参考帧 + S4 资产（角色多视图/场景空镜） + S1 镜头描述
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 编写分镜 prompt      │
│   每个 shot 一个 3×3 九宫格  │
│   prompt（引用 @镜头参考帧 +  │
│   @角色多视图 + @场景空镜）   │
│   每格描述：构图/角色位置/    │
│   运镜/光影变化               │
│   🔴红线=人物运动轨迹        │
│   🔵蓝线=镜头运动轨迹        │
│   🟢绿线=特效/冲击/能量轨迹 │
│   本体灰黑铅笔稿，背景从简   │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建分镜文档          │
│   shots/epXX/storyboard_     │
│   shot_S01-Shot01.md          │
│   frontmatter: prompt +   │
│   refs.image（参考帧+角色+场景）│
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行分镜生成     │
│   opsv imagen --manifest M   │
│          --category          │
│          shot_storyboard│
│   opsv run <task.json...>    │
│   → 产出 3×3 网格图           │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 审阅+审批+资产回写    │
│   opsv review --circle       │
│   opsv approved              │
│   回写 asset_id 到分镜文档    │
└─────────────────────────────┘
```

---

### Step 1: 编写分镜 prompt (核心技能)

每个 shot 生成一个 3×3 九宫格(推荐，也可以是4,6,12,16) prompt。分镜草图的**核心原则**：

> **运动设计 > 构图美观。** 草图是指导视频生成的"蓝图"——画面如何变化、角色如何运动、镜头如何切换才是关键。**每格必须包含三色运动线标注。本体为灰黑铅笔稿，三色彩线叠加。**

#### 九宫格布局约定

```
[格1] 起始构图      [格2] 动作发展      [格3] 动作完成
 ⚫灰黑铅笔稿        ⚫灰黑铅笔稿        ⚫灰黑铅笔稿
 🔵定机位           🔴角色右移          🔴角色落位
                    🔵跟摇→            🔵停
 🟢无                🟢无                🟢无

[格4] 镜头切换      [格5] 关键时刻      [格6] 反应/结果
 ⚫灰黑铅笔稿        ⚫灰黑铅笔稿        ⚫灰黑铅笔稿
 🔵切中景           🔴挥砍动作          🔵慢推→
 🔴角色转身         🔵慢镜头            🔴受击后退
 🟢无                🟢◎冲击波扩散      🟢✦火星飞溅

[格7] 新构图开始    [格8] 推向高潮      [格9] 镜头结束/定格
 ⚫灰黑铅笔稿        ⚫灰黑铅笔稿        ⚫灰黑铅笔稿
 🔵切全景           🔴冲刺+跳跃         🔴收势
 🔴入画→            🔵急速推→           🔵固定
 🟢无                🟢↑能量光柱         🟢→光线消散
```

> ⚫灰黑=铅笔稿本体 | 🔴红色实线箭头=人物/物体运动 | 🔵蓝色虚线箭头=镜头运动 | 🟢绿色波浪箭头=特效/冲击/能量

#### Prompt 结构

```
3x3 grid, seamless, borderless
Gray-black pencil draft sketch.
Red solid arrows indicate character/object movement paths.
Blue dashed arrows indicate camera movement.
Green wavy arrows indicate effects, impact, or energy direction.

top left: [景别] [角色位置] [动作] [光影] | 🔴→ [人物运动] | 🔵→ [镜头运动] | 🟢→ [特效/能量]
top center: [景别] [角色位置] [动作] [光影] | 🔴→ [人物运动] | 🔵→ [镜头运动] | 🟢→ [特效/能量]
...

构图基准参考 @shot-ref-S01-Shot01 的合成帧
角色站位参考 @LuRan-multiview 的多视图
场景空间参考 @Dojo-Day 的场景空镜
no margins, no film black bars, monochrome sketch with colored motion lines overlay
```

**每格必须包含六要素**：
1. **本体**：灰黑铅笔稿（角色轮廓+场景结构）
2. **景别**（wide / medium / close-up / extreme-close-up）
3. **机位**（eye-level / low-angle / high-angle / bird's-eye）
4. **角色位置+动作**（left / center / right + walking right / turning away / raising arm）
5. **人物运动线（🔴红色实线箭头）**：角色移动方向、肢体动作轨迹、物体飞行路径
6. **镜头运动线（🔵蓝色虚线箭头）**：推拉摇移跟升降的方向和路径
7. **特效/能量线（🟢绿色波浪箭头）**：冲击波、光线、粒子、速度线的扩散方向

**不需要**：
- 背景细节（草草几笔即可）
- 材质纹理（那是视频生成模型的事）
- 最终光照效果（多参考图生成时会处理）

### Step 2: 创建分镜文档

每镜头一个文档：

```yaml
---
category: shot_storyboard
status: drafting
id: storyboard-S01-Shot01
shot_id: S01-Shot01
prompt: |
  3x3 grid, seamless, borderless
  Gray-black pencil sketch.
  Red solid arrows = character/object movement, Blue dashed arrows = camera movement, Green wavy arrows = effects/impact/energy

  top left: WIDE SHOT, eye-level, static camera, no movement, no effects...
  top center: MEDIUM SHOT, @LuRan-multiview walks right → 🔴red arrow right, 🔵blue dashed arrow track right, 🟢green wavy arrow none
  ...
refs:
  image:
    "@shot-ref-S01-Shot01":      # 指向 S5 产出的镜头参考帧
      - <path/to/shot-ref.png>
    "@LuRan-multiview":          # 指向 S4 产出的角色多视图
      - <path/to/LuRan-multiview.png>
    "@Dojo-Day":                 # 指向 S4 产出的场景空镜
      - <path/to/Dojo-Day.png>
    "@Sword":                    # 道具资产
      - <path/to/Sword.png>
---
```

> `refs.image` 必须列出所有本分镜引用的资产——镜头参考帧 + 角色多视图 + 场景空镜 + 道具图。这些图会在 `opsv imagen` 编译时作为参考图注入。

### Step 3: 编译 + 执行

```bash
# 编译分镜生成任务
opsv imagen --manifest opsv-queue/<project>_circle1/_manifest.json --dir videospec --category shot_storyboard

# 执行
opsv run opsv-queue/<project>_circle1/*/*.json
```

### Step 4: 审阅 + 回写

```bash
opsv review --circle        # 审阅分镜草图
opsv approved               # 审批通过
```

审批后回写 `asset_id` 到分镜文档（供 S6 视频生成引用）。

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
4 步：写 prompt → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S4 资产 `approved` + S5 镜头参考帧 `approved`
- **验证**: `opsv refs check` 确认所有 `@id` 引用都存在且已 `approved`

### ③ 提示词生成
**这是本技能的核心价值所在**。分镜 prompt 的编写规则：
- **执行 Step 1 前必须先加载 `references/storyboard_prompt_guide.md`**，以三色运动标注体系为 prompt 编写基准
- 开头必须声明 `3x3 grid, seamless, borderless`
- **开头必须声明三色线+灰黑铅笔稿约定**：`Gray-black pencil draft sketch. Red solid arrows = ... Blue dashed arrows = ... Green wavy arrows = ...`
- 每格描述：⚫本体（灰黑铅笔稿）+ 景别 + 机位 + 角色位置/动作 + 🔴人物运动线 + 🔵镜头运动线 + 🟢特效/能量线
- **引用镜头参考帧**：在 prompt 中用 `@shot-ref-S01-Shot01` 引用 S5 产出
- **引用角色多视图+场景空镜**：`@LuRan-multiview`、`@Dojo-Day`
- 结尾：`no margins, no film black bars, monochrome sketch with colored motion lines overlay`
- 9 格构成一个完整镜头的时间线（起→承→转→合），三色线串联运动节奏

### ④ 引用语法
- `refs.image` 列出所有参考资产（镜头参考帧+角色多视图+场景空镜+道具图）
- 分镜 prompt 中通过 `@id` 引用镜头参考帧、角色多视图和场景空镜
- 这些引用在编译时由 OPSV 自动替换为实际图像路径
- **Seedance 多参考图机制**：多个 `@id` 引用 = 多张参考图输入

### ⑤ 任务环编排
- 上游资产全部 `approved` 后启动
- 每个分镜文档的 refs.image 会建立依赖边 → 编译时自动拓扑排序

### ⑥ 迭代与 Review
- 草图不合预期 → 修改 prompt → `opsv iterate` → 重新生成
- 审阅标准：构图是否流畅、角色位置是否合理、9 格是否构成完整时间线
- **不是看草图好不好看，而是看草图能否指导视频生成**
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`（跳过 syncing）
  - 有任务文件修改（iterate 改了 prompt/refs）：标记 `syncing` → Guardian 从任务文件读取新 prompt/refs 回写到文档 → `opsv approved`

### ⑦ 资产回写
`syncing` 状态下回写 `asset_id` 到分镜文档的 frontmatter，供 S6 `@id` 引用。无修改时直接 `approved`，不进 syncing。

---

## 5. 注意事项（踩过的坑）

1. **prompt 开头必须声明 3x3 grid + 三色线约定 + 灰黑铅笔稿** — 否则模型不会产出运动标注线而是全彩成品图
2. **三色线是本技能的核心差异化价值** — 没有运动标注的分镜只是普通缩略图，不是运动设计蓝图
3. **角色资产必须在 refs.image 中声明** — 否则编译时不会注入参考图，生成的角色会走样
4. **背景不重要** — 灰黑铅笔稿的背景草草几笔即可，token 留给三色运动线
5. **每格至少描述本体+景别+机位+三色线** — 这七要素减少任何一个都会降低视频生成的指导质量
6. **九宫格是时间线叙事** — 格1→格9 构成镜头的时间变化，三色线串联运动节奏
7. **三色线叠加时分清主次** — 红线右+蓝线左+绿线扩散 = 角色向右运动/镜头反向移开/冲击波环形扩散
8. **Seedance 多参考图** — 多个 @id = 多参考图输入，角色图+场景图+道具图一起参考
9. **severity: warning 必须配 min_length**
10. **YAML key 和 category 大小写一致**
11. **`---` 分隔符成对**
12. **root 目录 .md 不验证** — 分镜文档放在 `shots/epXX/` 下
13. **特效/能量线不要泛泛而写** — 要指定是什么特效（冲击波/光线/粒子/速度线）和往哪个方向扩散

---

## 6. references/

- `references/storyboard_prompt_guide.md` — **【Agent 必读】** 分镜 prompt 编写总纲：三色运动标注体系 + 两段式生产级系统提示词（Stage 1 分镜剧本生成器 / Stage 2 分镜大师）+ 完整 prompt 模板 + 反面示例。Step 1 前必须先加载。
- `references/composition_reference.md` — 构图参考表（三色运动标注规范/景别机位运动组合/镜头运动全表/正反打体系/180°轴线/剪辑语法/经典镜头句式速查）

# OPSV Multi-Ref 管线 — 关键设计决策记录

> 本文档记录构建 multi-ref-pack 技能包过程中，用户（项目所有者）做出的关键架构决策。
> 这些决策是整个 openspec-video 项目的核心设计原则，后续所有开发必须遵守。

---

## 1. 文档生命周期（Document Lifecycle）

### 1.1 三个状态

```
drafting ──→ approved              （review 直接通过，无修改）
drafting ──→ syncing ──→ approved  （review 发现任务有修改，先进 syncing 回写）
```

`opsv review` 不是状态，是**动作**——它判断任务是否有修改，决定走哪条路径：
- 任务无修改 → 直接标记 `approved`
- 任务有修改 → 标记 `syncing`，回写完成后再标记 `approved`

### 1.2 syncing 状态的含义

- **syncing 不是必经状态**，只有 iterate 修改了任务才进入。
- `syncing` 的作用：任务文件被 `opsv iterate` 修改过且 review 通过，此时需把任务 JSON 中的新 prompt/refs 回写到源文档。

---

## 2. 迭代机制（Iteration）

### 2.1 核心原则

**迭代改的是任务 JSON，不是源文档。**

- `opsv iterate <task_path>` → 修改任务 JSON 中的 prompt/duration/seed
- 源文档通过 **syncing 回写** 来同步任务 JSON 中的修改
- 这是单向的：任务 JSON ←(iterate修改)→ 重新执行 → syncing → 回写到源文档

### 2.2 产物文件命名（OPSV 命令内置）

产物命名以**任务 JSON 文件名**为基础，是 OPSV 命令内置行为，**禁止手动改名**：

| 操作 | OPSV 命令 | 产物命名 |
|------|-----------|----------|
| 首次编译 | `opsv compile`（通过 cycle） | `{任务json名}_1.png` |
| 重跑（同参数） | 重新执行 | `{任务json名}_2.png` |
| 修改迭代 | `opsv iterate <task_path>` | `{任务json名}_M1.png` |
| 修改后再跑 | 重新执行 | `{任务json名}_M2.png` |

> **核心规则**：所有命名由 OPSV 命令自动处理。Agent 通过 cycle 编译任务 JSON，通过 iterate 修改任务 JSON，文件名自动匹配，**禁止手动改名**。

### 2.3 AI 生成 ≠ 电影拍摄

- AI 生成不记录"第几次拍摄"（不需要 take number）
- 以生成结果的序号来标记：`_1`, `_2`, `_M1`, `_M2`...
- shot_id 本身不附加版本号：`S01-Shot01` 始终不变，产物后缀由 OPSV 命令自动管理
- **不要手动给产物文件加后缀或改名**——这些是 OPSV 命令的职责

---

## 3. refs 字段与媒体类型

### 3.1 refs 的 key 决定上传方式

`refs` 的 key（`image` / `video`）决定资产以什么媒体格式上传到服务端——不同 API 的上传协议不同，图片走图片通道，视频走视频通道。

### 3.2 分镜草图是 image，不是 video

- 分镜草图产物是 **3×3 网格 png 图像**，必须放在 `refs.image` 下
- `refs.video` 只用于 S6 视频生产的 mp4 产物

```yaml
# 正确
refs:
  image:
    - "@LuRan"              # 角色定稿图（png）
    - "@Dojo-Day"           # 场景定稿图（png）
    - "@storyboard-S01-Shot01"  # 分镜草图（3×3 网格 png）
  video:
    - "@shot-S01-Shot01"    # 视频片段（mp4）—— 只有 S6 产物

# 错误——分镜草图不能放 video 下
refs:
  video:
    - "@storyboard-S01-Shot01"  # ❌
```

---

## 4. shot_id 命名规范

### 4.1 格式

```
S{场景号}-Shot{镜头号}
```

示例：`S01-Shot01`, `S01-Shot02`, `S02-Shot01`

### 4.2 与旧格式的对比

| 旧格式 | 新格式 | 说明 |
|--------|--------|------|
| `S01-01-01`（含混：集-场-镜头？） | `S01-Shot01` | 清晰：场景1，镜头1 |
| `S01-01-02` | `S01-Shot02` | |
| `S01-02-01` | `S02-Shot01` | 场景2，镜头1 |

- `S` 后面是场景号（Scene）
- `Shot` 后面是镜头号
- 如果以后要加集的概念，前缀 `EP01-S01-Shot01`

---

## 5. 管线架构（Pipeline Architecture）

### 5.1 8 阶段管线（S0-S7）

```
S0: 项目启动（管线总览 + CLI 命令速查导航）
S1: 图谱分析（shot-graphify）→ 人物关系图 + 剧本结构图（Python Graphify 库）
S2: 剧本拆解（shot-breakdown）→ project.md + Script.md。核心使命：逐句切分场景的每一种画面状态，产出完整的场景状态清单。
S3: Shortlist（create-shortlist）→ shortlist.md + 资产需求清单。核心使命：按叙事节拍将细粒度镜头合并为 6-15s 生产单元。
S4: 定档设计（multi-ref-design）→ 角色/场景/道具文档（基于 S3 的需求清单）
S5: 资产生成（multi-ref-asset）→ 角色图/场景图/道具图 + 配音/BGM
S6: 分镜草图（multi-ref-storyboard）→ 3×3 多格分镜参考图
S7: 视频生产（multi-ref-production）→ mp4 视频片段
```

> 注：S1 shot-graphify 和 S2 shot-breakdown 使用 `shot-` 前缀而非 `multi-ref-`，因为这两个技能可跨技能包复用。

### 5.2 关键设计决策

**每个阶段的单一指导原则（One Job Per Stage）**

管线设计的核心信条：**每个阶段只给 Agent 一个简单、无歧义的指导原则。** 不让他做复杂判断，不让他跨阶段思考。

| 阶段 | 一句话原则 | 他只做 |
|------|-----------|--------|
| **S1 Graphify** | 切场景，理人物关系，统一线索 | 分析剧本结构 → 输出人物关系图 + project.md 风格定调 |
| **S2 Script** | 简单粗暴定场景，细粒度切 Beat | 逐句扫描 → 每个画面变化一个 Beat 条目 → Script.md |
| **S3 Shortlist** | Beat 合并为 Shot，列清单，不设计内容 | 按叙事节拍合并 Beat → 产出 Shortlist + 资产清单 → 只管列，不管做 |
| **S4 定档** | 根据清单建立定档文档 | 读 S3 清单 → 创建角色/场景/道具 .md → 确定外观描述 |
| **S5 资产生成** | 根据定档文档生成资产 | 读定档 → 生成图片/音频 → 不判断是否需要，定档有的都生成 |
| **S6 分镜** | 根据生产单元 + 资产生成分镜参考 | 读生产单元 + 定档资产 → 生成 3×3 网格 |
| **S7 视频** | 根据分镜 + 资产生成视频 | 读分镜草图 + 定档资产 → 生成 mp4 |

**为什么这么设计？**

- Agent 不是导演——他不需要"理解"整个项目，只需要把当前这一步做好
- 每一步的输入和输出边界清晰，上游漏了什么下游立刻能发现
- 复杂判断（如"这个角色要不要重新生成"）被拆成两阶段：S3 只管列出需要什么，S5 再根据清单判断是否需要重新生成
- 每一阶段的产出都是可验证的——Script.md Beat 数对不对？Shortlist每个 Shot 能不能一句话概括？资产清单和定档文档数对不对得上？

**Beat → Shot 命名分层**

S2（beat-script）产出的细粒度条目叫 **Beat**（节拍），不是 Shot：
- Beat = 剧本中画面变化的原子单位，每个画面变化一个 Beat，自然时长 2-8 秒
- Script.md 里编号格式：`S01-Beat01`

S3（create-shortlist）将 N 个 Beat 合并为 **Shot**（镜头）：
- Shot = 制片生产单元，6-15 秒，必须能用一句话概括
- shortlist.md 里编号：Shot 1、Shot 2、Shot 3……

**为什么分两层？**
- 编剧/分镜视角关注每一个画面变化（Beat）——切漏了后面补不回来
- 制片视角关注可执行的拍摄单元（Shot）——太短没法拍，太长一个镜头扛不住
- 两个名字，两个编号体系，不混淆

**S1 Graphify 插入：图谱分析先于剧本拆解**

理由：先用 Python Graphify 库分析人物关系结构和剧本结构，产出结构化数据（不完全但有关键关系）。S2 Breakdown 在有结构的基础上逐句切分场景，比无结构切分更准确——角色复用、场景关系更清晰。

Graphify 依赖：
- 需安装 Python 库 Graphify
- 整合 Graphify novel 图谱分析能力

**S3↔S4 对调：Shortlist先于定档设计**

理由：Shortlist扫完所有 Beat 后，才能知道全局资产需求——
- 有没有跨 Shot 的龙套角色需要生成资产
- 场景是否需要变体（白天/黑夜、春/夏/秋/冬等）
- 哪些道具被多 Shot 复用

Shortlist的资产需求清单是 S4 定档设计的输入依据，而不是反过来。

**声音并入 S5 资产生成**

理由：声音也是资产（配音音频、BGM），和视觉资产没有本质区别，应同时生成而非拖到最后独立一个阶段。

**`shot-` 前缀命名**

`shot-graphify` 和 `shot-breakdown`（原 `multi-ref-graphify` / `multi-ref-shots`）使用 `shot-` 前缀，因为这两个技能可跨技能包复用，不应绑定 `multi-ref` 前缀。

**Pipeline 职责精简**

Pipeline (S0) 不负责：剧本创作（剧本已有）、Circle 维护（OPSV 命令自动处理）、选管线路径（无此分支）。仅做导航索引：去哪找技能、用什么命令。

**project.md 创建时机**

project.md 不在 S0 创建。在 S2（Graphify 分析完成）后，Agent 拿到结构化数据 + 剧本原文，同时创建 project.md + Script.md。

**Script.md 的核心使命：场景状态的完整 Beat 清单**

S2（beat-script）的首要产出是 Script.md。这份文档只有一个核心任务：**把剧本中每一个场景的不同状态，完整地、细致地切出来。**

什么是"场景状态"？——同一场景内，每次画面发生变化（角色出入镜、动作转折、情绪切换、视角改变）都是一个不同的状态。Script.md 的任务就是逐句扫描剧本，把这些状态一个不漏地记录成独立 Beat 条目。

关键理解：
- Script.md 是**场景状态清单**（inventory），不是拍摄计划
- 每个状态 = 一个独立 Beat 条目，如实标注自然时长（哪怕只有 2-3 秒）
- 不需要考虑"这个 Beat 太短了要不要合并"——那是 S3 Shortlist的职责
- 切得越细，S3 的分组越灵活；切漏了 S3 救不回来

S2 结束后，Script.md 应该让读的人像过电影一样看到完整叙事——每一个画面变化都有对应的 Beat 条目。这是管线下游一切工作的基础。

**拍摄计划（shooting_schedule.md）移除**

从旧 refpack `opsv-shooting-schedule` 继承来的产物，内容从未被定义过。Shortlist（shortlist.md）已包含拍摄顺序和优先级信息，不需要独立文件。

### 5.3 与旧 refpack（13 技能）的关键变化

| 旧 | 新 | 原因 |
|----|----|------|
| `opsv-pipeline-skill` + `opsv-cli-skill` 分离 | 合并为 `multi-ref-pipeline`（S0） | 减少碎片化 |
| `opsv-graphify` 独立 | 改为 `shot-graphify`（S1） | 跨包复用，`shot-` 前缀 |
| `opsv-shot-breakdown` 独立 | 改为 `shot-breakdown`（S2） | 跨包复用，`shot-` 前缀 |
| `opsv-rolesheet` + `opsv-scene-image` 分离 | 合并为 `multi-ref-design`（S4） | 角色/场景/道具统一管理 |
| `opsv-shotlist` 独立 | 改为 `create-shortlist`（S3） | Shortlist + 资产需求清单 |
| `opsv-shooting-schedule` | **移除** | 内容从未定义，Shortlist已包含拍摄顺序 |
| `opsv-create-skill` 元技能 | 去掉 | 不属生产管线 |
| `opsv-voice-skill` 独立 | 并入 `multi-ref-asset`（S5） | 声音是资产，不应独立成阶段 |

### 5.4 Circle 自动编排

Circle 由 `opsv circle create` 根据文档间 `refs` 依赖关系自动构建有向无环图（DAG），按拓扑序分层。Agent 无需手动指定层级，只需确保 `refs` 字段正确即可。

---

## 6. 七个关切（每个 SKILL.md 必须贯彻）

每个 skill 的 SKILL.md 必须覆盖以下 7 个关切：

| # | 关切 | 说明 |
|---|------|------|
| ① | 生产流程 | 本阶段的输入→处理→产出步骤 |
| ② | 依赖处理 | 上游依赖、验证规则、Circle gate |
| ③ | 提示词生成 | prompt 的编写规范和信息来源 |
| ④ | 引用语法 | `@id` / `@:key` / `refs` 的使用方式 |
| ⑤ | 任务环编排 | 在 Circle 层级中的位置和约束 |
| ⑥ | 迭代与 Review | 审阅标准、iterate 路径、syncing 回写 |
| ⑦ | 资产回写 | `asset_id` 回写时机和格式 |

---

## 7. 引用语法（@ Syntax）

### 7.1 引用类型

| 语法 | 类型 | 说明 |
|------|------|------|
| `@id` | 外部资产引用 | 指向另一个文档或资产（如 `@LuRan`） |
| `@id:variant` | 变体引用 | 指定资产的特定变体（如 `@LuRan:portrait`） |
| `@:key` | 内部设计引用 | 指向同文档内的 Design References |
| `@FRAME:shotId_first/last` | 帧引用 | 指向上游产出的首帧/尾帧 |

### 7.2 核心规则

- `@` 是文档引用语法，不是文件名
- `refs` 的 key 决定媒体上传格式
- 下游通过 `@id` 引用上游产出，编译时 OPSV 自动解析为实际文件路径

---

## 8. 技能包目录结构

```
opsv-packs/multi-ref-pack/
├── README.md
├── DESIGN_DECISIONS.md
├── .agent/
│   ├── USER.md                    # 用户画像 + 生命周期说明
│   ├── AGENTS.md                  # 角色分工
│   └── skills/
│       ├── multi-ref-pipeline/    # S0
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── refs_guide.md
│       │       ├── file_spec.md
│       │       └── cli_reference.md
│       ├── shot-graphify/         # S1
│       │   ├── SKILL.md
│       │   └── references/
│       │       └── graphify_guide.md
│       ├── shot-breakdown/        # S2
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── project_template.md
│       │       ├── script_template.md
│       │       └── breakdown_guide.md
│       ├── shot-shotlist/         # S3
│       │   ├── SKILL.md
│       │   └── references/
│       │       └── shortlist_template.md
│       ├── multi-ref-design/      # S4
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── rolesheet_template.md
│       │       ├── scene_template.md
│       │       └── prop_template.md
│       ├── multi-ref-asset/       # S5（含视觉 + 音频资产）
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── asset_generation_guide.md
│       │       ├── quality_checklist.md
│       │       ├── voice_prompt_guide.md
│       │       └── bgm_prompt_guide.md
│       ├── multi-ref-storyboard/  # S6
│       │   ├── SKILL.md
│       │   └── references/
│       │       ├── storyboard_prompt_guide.md
│       │       └── composition_reference.md
│       └── multi-ref-production/  # S7
│           ├── SKILL.md
│           └── references/
│               ├── video_prompt_guide.md
│               ├── seedance_params.md
│               └── post_review_iteration.md
```

### 8.1 项目目录结构（videospec/）

```
<project>/
├── project.md                    # 项目元信息（S2 产出）
├── .opsv/
│   ├── api_config.yaml           # API 密钥
│   └── input_types.yaml          # 输入类型注册（可选）
├── videospec/
│   ├── script.md                 # 剧本拆解产物（S2 产出）
│   ├── shortlist.md         # Shortlist（S3 产出）
│   ├── _category_validate.yaml   # 验证规则（包内置）
│   ├── elements/                 # 共享资产（角色/道具等，category 自定义）
│   ├── scenes/                   # 场景（固定目录，DEFAULT_SCAN_SUBDIRS）
│   └── shots/                    # 镜头
│       ├── S01-Shot01.md         # 当前 EP 的单个镜头
│       ├── S01-Shot02.md
│       ├── EP01/                 # 已完成的 EP，移入子目录（circle 扫不到）
│       └── EP02/                 # 空目录占位，下一批镜头
└── opsv-queue/                   # OPSV 自动管理
    └── videospec_circle1/
        └── _manifest.json
```

### 8.2 EPXX 目录规则

- `shots/` 根目录放**当前正在拍**的 EP 的单个 shot `.md` 文件
- 一个 EP 拍完后，将所有 shot `.md` 移入 `shots/EP{XX}/` 子目录
- Circle 只扫描第一层 `.md`，子目录内的已完成镜头不会被扫到
- `shots/EP{下一集}/` 创建空目录占位

## 9. 关键纠正记录

以下是本次审查中发现并修正的关键错误：

| # | 问题 | 修正 |
|---|------|------|
| 1 | 生命周期：`drafting → syncing → approved` 不可跳跃 | 改为两条路径，syncing 可跳过 |
| 2 | syncing 含义模糊 | 明确 syncing = 任务文件有修改需回写 |
| 3 | `refs.video` 下放了分镜草图 | 分镜草图是 image，移回 `refs.image` |
| 4 | shot_id 格式 `S01-01-01` 含混 | 改为 `S01-Shot01` |
| 5 | 产物命名写死了具体文件名 | 改为通用规则：`{文档id}_{序号}` / `{文档id}_M{序号}` |
| 6 | 产物命名说是"文档 ID" | 更正为"任务 JSON 文件名"（迭代改的是任务 JSON） |
| 7 | 17 个 reference 文档全空 | 全部补全实际内容 |
| 8 | `@LuRan_1.png` 把 @ 当成文件名前缀 | `@` 是引用语法，不是文件名前缀 |
| 9 | 管线顺序：S2 定档设计 → S3 场记计划 | 对调为 S2 场记计划 → S3 定档设计。理由：场记扫完全部镜头后才知全局资产需求（龙套复用、场景变体） |
| 10 | S7 声音设计独立阶段 | 声音并入 S5 资产生成——声音也是资产（配音/BGM），和视觉资产无本质区别 |
| 11 | Pipeline 职责过重 | 精简为导航索引：去哪找技能、用什么命令。不做 Circle 维护（命令自处理）、不做管线路径选择（无此分支）、不做剧本创作（剧本已有） |
| 12 | project.md 在 S0 创建 | 移到 S2，Graphify 分析完成后与 Script.md 同批次创建 |
| 13 | Circle 层级手写 ZeroCircle/FirstCircle/EndCircle | Circle 由 `opsv circle create` 根据 refs DAG 自动构建，Agent 不手写。命名规则：`{目录名}_circle{N}` |
| 14 | `circle refresh` 被描述为"读取新 manifest" | `circle refresh` 不产生新文件，更新现有 manifest；检查 approved 状态 → 标记通过 → 生成 test.json 时自动跳过 |
| 15 | 目录结构缺少 `scenes/` | `DEFAULT_SCAN_SUBDIRS = ['elements', 'scenes', 'shots']`，`scenes/` 是固定目录 |
| 16 | `shooting_schedule.md` 存在但从未定义 | 移除。从旧 refpack `opsv-shooting-schedule` 继承的空壳，Shortlist已包含拍摄顺序信息 |
| 17 | Graphify 被错误移除 | 恢复为 S1。Graphify 分析的 Structured data 供 S2 分解使用，需安装 Python Graphify 库 |
| 18 | `multi-ref-graphify` / `multi-ref-shots` 命名 | 改为 `shot-graphify` / `shot-breakdown`，因可跨技能包复用 |
| 19 | validate 被理解为质量评判 | validate = 守门人（格式把关），不评判质量好不好。未来计划引入 AI 产物分析 |
| 20 | 云审阅功能未注明状态 | 补充：云审阅功能暂未开放 |
| 21 | 命名规范不统一 | 统一驼峰命名（CamelCase）：`Storyboard` 非 `storyboard`，`Shot` 非 `shot`。名称+属性用分隔符连接（如 `S01-Shot01`） |
| 22 | Category 字段无约束 | Category 用户可自定义（`character`/`role` 均可），但 `scenes` 是固定目录名不可变 |

| 23 | `create-shotlistsheet` → `create-shortlist` | 全面重命名：目录、skill 名、产出文件、category、模板文件。产出从 3 项扩展到 5 项（Shot 镜头语言 + 台词时间轴 + 音效清单 + 资产需求清单 + Shot 场记表），工作流从 3 步扩到 6 步 |
| 24 | EP 目录 vs 一级目录 | 支持两种工作模式：模式 A（默认）`--dir videospec`，文档放一级目录；模式 B `--dir videospec/EP{XX}`，整集文档集中在 EP 目录。Circle 只扫第一层 `.md`。两种模式可混用——默认模式跑完后手动整理到 EP 目录归档 |
| 25 | Frontmatter = 下游确定性合同 | S3 shortlist.md 的 frontmatter 是 S4/S5/S6/S7 的输入合同。`shots`/`characters`/`scenes`/`props` 四个数组是下游唯一的数据来源——下游不需要解析正文表格。正文表格是给人类看的展开版，frontmatter 是机器消费的确定版。原则：下游要引用的、不可改的内容，必须入 frontmatter |

---

> 本文档是 OPSV 项目的"宪法级"设计文件。所有后续开发、skill 创建、文档编写都必须遵守上述决策。

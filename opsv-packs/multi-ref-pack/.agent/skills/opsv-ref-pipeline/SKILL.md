---
name: multi-ref-pipeline
description: OPSV 完整生产管线总览 — 启动项目、导航 8 阶段、CLI 命令速查。作为项目初始化第一技能载入。
---

# Multi-Ref 管线引擎 (Pipeline)

> **阶段**: S0 · 项目启动
> **产出**: 项目结构初始化 + 管线导航指引
> **技能数**: 1（本技能独占 S0）

---

## 1. 核心原则

**OPSV 命令优先。** 所有文档和产物的生命周期由 OPSV CLI 命令管理。Agent 必须尽可能使用 CLI 命令，禁止手动删除文件——OPSV 自动做增量保存，遵守规则即可。

---

## 2. 工作区 (Workspace)

**`videospec/` = 默认工作区。** 所有产出文档和资产的根目录。

| 规则 | 说明 |
|------|------|
| 工作区根 | `videospec/` — `opsv validate --dir videospec` 扫第一层 `.md` |
| 脚本类文档 | `Script.md`、`shortlist.md`、`project.md` 放 `videospec/` 根目录 |
| 镜头文档 | `shots/` 第一层只放单个镜头 `.md`（如 `S01-Shot01.md`），完成 EP 移入子目录 |
| 共享资产 | `elements/` — 角色/场景/道具定档 `.md`，跨镜头复用 |
| 场景目录 | `scenes/` — 固定目录 |

```bash
videospec/
├── project.md                   # S0 定调
├── Script.md                    # S2 Beat 拆解产出
├── shortlist.md            # S3 Shortlist
├── elements/                    # 共享资产
├── scenes/                      # 固定目录
└── shots/                       # 镜头文档
    ├── S01-Shot01.md
    ├── S01-Shot02.md
    ├── EP01/                    # 已完成 EP
    └── EP02/
```

### 2.1 两种工作模式

OPSV 支持两种目录组织方式，根据项目规模选择：

**模式 A：一级目录（默认）** — `--dir videospec`

Script.md、shortlist.md 等集级别文档放在 `videospec/` 根目录，Shot 放在 `shots/` 根目录。适合单集项目或快速原型。

```bash
opsv validate --dir videospec
```

**模式 B：EP 目录** — `--dir videospec/EP01`

整集所有文档（Script.md、shortlist.md、Storyboard、Shot）集中在一个 EP 目录下，Circle 只扫该 EP 的第一层 `.md`。适合多集并行制作，每集独立跑任务环。

```bash
opsv validate --dir videospec/EP01
```

```
videospec/
├── project.md                        # 项目级（跨集共享）
├── elements/                         # 共享资产（跨集复用）
├── scenes/                           # 场景定义（跨集共享）
├── EP01/                             # 模式 B：EP01 独立工作区
│   ├── Script.md                     # S2 产出
│   ├── shortlist.md                  # S3 产出
│   ├── Storyboard.md                 # S5.5 产出
│   └── shots/                        # S3 镜头文档
│       ├── S01-Shot01.md
│       └── S01-Shot02.md
└── EP02/                             # 下一集
```

**模式选择规则**：
- 默认用模式 A，快速启动不纠结
- 明确多集并行时直接用模式 B，`--dir videospec/EP{XX}` 跑完整任务环
- 两种模式可以混用——模式 A 跑完一集后手动整理到 EP 目录归档即可

## 3. 各阶段速查

| 阶段 | 技能名 | 产出 | 进入条件 |
|------|--------|------|----------|
| **S0** | `multi-ref-pipeline` | 项目结构 + 导航 | 首次启动 |
| **S1** | `graphify-drama` | 实体关系图 + `videospec/project.md`（风格定调） | S0 完成 |
| **S2** | `beat-script` | `project.md` + `videospec/Script.md`<br/>核心：逐句切分场景的每一种画面状态，产出完整的 Beat 清单 | S1 完成（有结构化数据 + project.md） |
| **S3** | `create-shortlist` | `videospec/shortlist.md`（含镜头语言/prompt/台词时间轴/音效/资产需求）<br/>核心：Beat → Shot 合并 + 完整制片决策 | S2 Script.md approved |
| **S4** | `create-elements` | 角色定档 + 角色图/场景图/道具图 + 配音/BGM | S3 资产需求清单就绪 |
| **S5** | `shot-reference` | 单帧合成参考图（角色+场景光影融合） | S4 关键资产 approved |
| **S5.5** | `shot-storyboard` | 3×3 多格分镜参考图 | S5 参考帧 approved |
| **S6** | `shotgen` | 镜头组文档 → mp4 视频片段（4 镜/组/12s，Seedance 批量生成） | S5.5 分镜图 approved |

> **注**: S4 `create-elements` 整合了原独立阶段"定档设计"（角色/场景外观定义本属资产生成的前置步骤，现已并入）。声音设计（配音/BGM/SFX）由 `create-elements` Phase 2 一并处理。

---

## 4. 职责边界（Pipeline = 导航索引）

**你做**：
- 初始化项目结构：`opsv init` 命令
- 导航到正确的阶段技能
- 提供 CLI 命令速查参考

**你不做**：
- 剧本创作（剧本由用户提供）
- Circle 维护（OPSV 命令 `circle create` / `circle refresh` 自动处理）
- 任何阶段的文档内容写作（那是下游各技能的事）
- 直接运行 `opsv run`（那是执行阶段的事）
- "选管线路径"（标准/风格化/意境等分支不存在）

---

## 5. 触发条件

- 首次启动新项目时（必须最先加载）
- 用户询问"现在该做什么"时 → 查进度表，导航到当前阶段
- 用户询问 CLI 命令用法时 → 提供命令速查

---

## 6. 初始化项目

### 6.1 opsv init

```bash
# 已在项目目录内 → 在当前目录下创建 videospec/ 等标准目录
opsv init

# 新建项目 → 创建项目目录并初始化
opsv init --dir <project-name>
```

### 6.2 初始目录结构（init 后）

```
<project>/
├── .opsv/
│   ├── api_config.yaml           # API 密钥
│   └── input_types.yaml          # 输入类型注册（可选）
├── videospec/
│   ├── elements/                 # 共享资产（角色/道具等）
│   ├── scenes/                   # 场景（固定目录）
│   └── shots/                    # 镜头
└── .agent/skills/                # 技能包目录（本包）
```

### 6.3 后续文档补充（由下游阶段创建）

```
videospec/
├── script.md                     # S2 beat-script 产出
├── shortlist.md             # S3 create-shortlist 产出
├── elements/                     # S4 create-elements 产出（角色/场景/道具定档 + 资产）
│   ├── LuRan.md
│   └── ...
├── scenes/                       # S4 create-elements 产出
│   ├── Dojo-Day.md
│   └── ...
└── shots/                        # 当前 EP 镜头
    ├── S01-Shot01.md             # S2 beat-script 产出
    ├── S01-Shot02.md
    ├── EP01/                     # 已完成 EP，移入子目录（circle 扫不到）
    └── EP02/                     # 空目录占位，下一批
```

### 6.4 EPXX 目录规则

- `shots/` 根目录放**当前正在拍**的 EP 的单个 shot `.md`
- 一个 EP 拍完后，全部移入 `shots/EP{XX}/` 子目录
- Circle 只扫描第一层 `.md`（不递归），子目录内已完成镜头不会被扫到

---

## 7. Circle 编排

Circle 由 `opsv circle create --dir <dir>` 根据文档间 `refs` 依赖关系自动构建有向无环图（DAG），按拓扑序分层。

**命名规则**：`{目录名}_circle{N}`
- 默认 `--dir videospec` → `videospec_circle1`
- 自定义 `--dir elements/role` → `role_circle1`
- 可用 `--name` 覆盖

**核心命令**：
- `opsv circle create --dir videospec` — 构建 Circle DAG（增量，找到最大 N 创建 N+1，不覆盖）
- `opsv circle refresh --dir videospec` — 刷新状态（不产生新文件，更新现有 manifest；检查 approved → 生成 test.json 时自动跳过已通过项）
- `opsv validate --category <cat>` — 每层完成后校验
- `opsv review --circle` — 人工审阅
- `opsv approved` — 审批通过，解锁下游

**使用原则**：
- `circle create` **仅在依赖关系变化时**使用
- 完成一环进入下一环时，**不用重建 Circle**，直接基于已有 manifest 跑
- 如果 `circle refresh` 检测到 index 拓扑变化，会报错提示用 `circle create`

---

## 8. CLI 命令速查

### 8.1 初始化

| 场景 | 命令 |
|------|------|
| 在已有项目目录初始化 | `opsv init` |
| 新建项目并初始化 | `opsv init --dir <name>` |

### 8.2 校验与状态

| 场景 | 命令 |
|------|------|
| 校验工作区全部文档 | `opsv validate`（默认 `--dir videospec`） |
| 校验指定目录 | `opsv validate --dir <path>` |
| 按分类校验 | `opsv validate --category <cat>` |
| 严格模式 | `opsv validate --strict` |

`opsv validate` 是守门人——读分类校验规则做基本格式把关，提醒 Agent 输出是否 OK。不通过 → 重新处理。不评判质量。

### 8.3 Circle 管理

| 场景 | 命令 |
|------|------|
| 创建 Circle（依赖变化时） | `opsv circle create --dir videospec` |
| 刷新状态（日常迭代） | `opsv circle refresh --dir videospec` |
| 指定目标目录 | `opsv circle create --dir scenes --name <name>` |

### 8.4 编译与执行

| 场景 | 命令 |
|------|------|
| 编译图片任务 | `opsv imagen --manifest <manifest> --category <cat>` |
| 编译指定资产 | `opsv imagen --manifest <manifest> --file <id>` |
| 编译视频任务 | `opsv animate --manifest <manifest> --category <cat>` |
| 执行任务 | `opsv run <path>` |

- `opsv run` 和 `opsv iterate` 都有**目录参数**，指向编译好的含 `test.json` 队列的目录
- `opsv iterate`：复制目录做增量处理

### 8.5 审阅与审批

| 场景 | 命令 |
|------|------|
| 本地审阅 | `opsv review --circle` |
| 云审阅 | `opsv review --cloud`（暂未开放） |
| 批量审批 | `opsv approved --file "@id1,@id2"` |

- 审阅与审批为 AI 与人类通过 UI 交互设计
- 人类也可直接与 AI 对话，让 AI 执行审批 — `opsv approve` 为此设计，AI 批量审批已沟通确认的事项
- **云审阅功能暂未开放**

### 8.6 引用与同步

| 场景 | 命令 |
|------|------|
| 检查 refs | `opsv refs check` |
| 同步 refs | `opsv refs sync` |

### 8.7 辅助

| 场景 | 命令 |
|------|------|
| 拼接图片 | `opsv image-stitch <imgs...> --right --output <out>` |
| 提取 ComfyUI 节点 | `opsv comfy-node-mapping --workflow <wf>` |

---

## 9. 注意事项（踩过的坑）

1. **OPSV 命令优先** — 文档和产物生命周期由 CLI 管理，禁止手动删除文件
2. **不是所有文档都进 Circle** — 只有多媒体资产（imagen/animate）才进 Circle。script.md、shortlist.md 等文档不进 Circle
3. **Circle 是增量创建** — `circle create` 找到最大 N 创建 N+1，不覆盖已有 Circle
4. **shots/ EPXX 规则** — 完成 EP 移入子目录，circle 只扫描第一层，扫不到已完成镜头
5. **`--category` 过滤** — 编译时用 `--category` 精确指定，避免误编
6. **`@` 前缀** — `@id` 是 prompt 引用语法，不是文件名前缀。文件名不含 `@`
7. **命名规范** — 统一 CamelCase（`Storyboard` 非 `storyboard`，`Shot` 非 `shot`）
8. **`scenes/` 是固定目录** — `DEFAULT_SCAN_SUBDIRS = ['elements', 'scenes', 'shots']`
9. **`project.md` 不是 S0 创建** — 由 S2 `beat-script` 在 Graphify 分析后与 Script.md 同批次创建
10. **未来计划**: validate 引入 AI 产物分析（暂不处理）

---

---

## 9. 这 7 个关切在本技能如何贯彻

> 本技能是管线导航器（S0），不直接参与生产。以下将 7 个关切映射到各下游阶段的职责。

### ① 生产流程
- **本技能**：`opsv init` 创建项目骨架，然后导航到 S1 → S2 → ... → S6
- **不对应具体产出**，而是确保 Agent 知道每一步该加载哪个阶段技能

### ② 依赖处理
- 本技能不产生文档，不参与 Circle DAG
- 各下游技能的依赖由它们各自的 `refs` 字段在 `circle create` 时自动解析
- Circle 创建时机：**只在依赖关系（refs）变化时**调用 `opsv circle create`

### ③ 提示词生成
- 不在本技能范围内。提示词由各阶段技能的 references 模板和 guidance 处理
- 统一规则：prompt 中的 `@id` 必须在 `refs` 声明（`opsv refs check` 验证）

### ④ 引用语法
- 核心参考文档：`references/refs_guide.md`
- `refs` 为**双层字典结构**（外层 input_type，内层 `@id`，值为路径数组）
- **数组形式 `- "@id"` 已废弃**，编译器会拒绝

### ⑤ 任务环编排
- 本技能不产出任务环内容，仅记录 Circle 语义：
  - `opsv circle create`：依赖变化时重建 DAG
  - `opsv circle refresh`：日常刷新状态
  - Circle 由 OPSV 自动分层（ZeroCircle → FirstCircle → ...），**禁止手写层级**

### ⑥ 迭代与 Review
- iterate / review / approved 流程见各下游技能的 §4 和 §6
- 统一规则：产物不满足 → `opsv iterate` 复制任务（自动 `_m{N}` 后缀）→ 改任务 JSON → `opsv run` 重跑
- **禁止手改产物文件名**，命名由命令自动管

### ⑦ 资产回写
- review 通过后 `opsv approved` 自动将 approved 变体写入源文档 body 的 `## Approved References`
- syncing 状态（有 `_mN` 产物）→ Agent 需把任务 JSON 改动回写到源 `.md` → 再次 approved

---

## 10. references/

- `references/cli_reference.md` — 完整 CLI 命令树
- `references/refs_guide.md` — `@` 引用语法完整指南
- `references/file_spec.md` — 文件命名规范与目录结构

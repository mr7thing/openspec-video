---
name: opsv
description: OpsV v0.10.0 核心框架 — Circle 架构、统一 @ 语法、refs 分组、prompt 编译、类别校验。
---

# OpsV 框架规范 (v0.10.0)

OpenSpec-Video (OpsV) 是一个面向 AI 视频生产的结构化工作流框架。它将创意过程拆解为可编译、可审查、可迭代的工业管线。

## 核心概念

### 文档唯一真相原则

**文档 `.md` 是资产属性的唯一权威来源。** Manifest 声明资产存在并发现其产出，但绝不覆盖或推断文档级属性。

- **docId 来自 manifest**：`opsv review` 从 `_manifest.json` 的 `assets` 键获取 docId 列表，不从输出文件名反推
- **属性来自 frontmatter**：`category`、`status` 等描述字段从源文档 YAML frontmatter 读取，manifest 中的值仅为快照
- **产出按 docId 匹配**：用 docId 前缀在 circle 目录中匹配输出文件，不做文件名反解
- **命名源自文档**：所有产物命名由文档 `@id` 派生：`@hero.md` → `@hero.json` → `@hero_1.png`

### Circle 架构
生产管线按依赖层级划分为 Circle，每一 Circle 对应一批可并行执行的渲染任务：

| Circle | 职责 | 产出 |
|--------|------|------|
| **zerocircle** | 基础静态资产（角色、场景、道具） | `opsv-queue/videospec_circle1/volcengine.seadream_001/` |
| **firstcircle** | 基于 approved 资产的分镜图像 | `opsv-queue/videospec_circle2/volcengine.seadream_001/` |
| **secondcircle** | 中间层级（按需扩展） | ... |
| **endcircle** | 末端动态视频（仅当 shotlist.md 存在） | `opsv-queue/videospec.circleN/volcengine.seedance/` |

**铁律**：
- 严禁在 ZeroCircle 未完成 Review/Approve 时强行下发 FirstCircle
- `opsv circle refresh` 每次运行都**重新扫描**所有文档重建依赖图，不可依赖缓存
- 任何文档变更（`refs` 修改、Approve/Draft、新增/删除文件）后必须重新执行 `opsv circle refresh`

### 全局资产引用
所有实体必须通过 `@id` 全局引用，命名规范：
- 全部小写，下划线分隔
- 如 `@role_hero`, `@scene_bar`, `@prop_gun`
- 引用带变体：`@classroom:morning`

### 双通道参考图体系 (v0.8.3)

OpsV 区分两种参考图来源，分别对应文档的两个不同区域：

| 区域 | 方向 | 用途 | 读取方式 |
|------|------|------|----------|
| `## Design References` | **输入侧** | 本文档的设计参考图，编译时作为 `reference_images` 传入生成 API | `DesignRefReader` 读取自身文档的 `## Design References` |
| `## Approved References` | **输出侧** | 审阅通过后的定档图像，供**其他文档**通过 `@assetId:variant` 引用时读取 | `ApprovedRefReader` 读取被引用文档的 `## Approved References` |

**外部引用**（`@assetId:variant` in body + `refs:` in frontmatter）→ 读取**被引用文档**的 `## Approved References`
**内部引用**（`## Design References` section in own document）→ 读取**自身文档**的 `## Design References` 作为 `reference_images`

- `Asset.approvedRefs`：存储从被引用文档 `## Approved References` 解析出的图像路径
- `Asset.designRefs`：存储从自身文档 `## Design References` 解析出的图像路径（v0.8.3 新增）

### 引用语法体系 (v0.10.0)

统一的 `@` 前缀语法，覆盖所有引用场景：

| 形式 | 含义 | 示例 |
|------|------|------|
| `@id` | 外部资产 | `@hero` |
| `@id:variant` | 外部资产 + variant | `@style:night` |
| `@:key` | 本文档 Design References 中的图 | `@:angle_side` |
| `@FRAME:shotId_first/last` | 帧引用（编译时解析，不进 refs） | `@FRAME:shot_01_first` |

### Refs 分组结构 (v0.10.0)

**frontmatter refs 按 input_type 分组**，每个 key 必须有至少一个明确路径：

```yaml
refs:
  image:
    "@hero":
      - opsv-queue/.../hero_1.png
    "@:angle_side":          # 本文档引用
      - ./refs/hero_side.png
    "@style:night":          # variant
      - opsv-queue/.../style_night.png
  video:
    "@swim_loop":
      - opsv-queue/.../swim.mp4
  audio:
    "@bgm":
      - opsv-queue/.../bgm.mp3
```

**核心规则**：
- 每个 ref 必须**至少**指向 1 个资产文件（路径数组非空）
- 一个 ref 可对应多个文件（人物多角度、流程序列）
- prompt + visual_brief + visual_detailed 中每个 @-token 都必须在 refs 中有对应 key
- refs 中每个 key 都必须在 prompt 中被引用（双向校验，违反 = error）

### Design References 区域

```markdown
## Design References

### image
![angle_side](./refs/hero_side.png)    ← alt 文本 = @:key
![angle_front](./refs/hero_front.png)

### video
![motion_ref](./refs/run.mp4)
```

- 资料堆性质，可堆任意参考图
- alt 文本（`[]` 里的字符串）= `@:key` 的索引
- 只有 prompt 中 `@:xxx` 引用的图才进 refs

### Input Types 注册表

`.opsv/input_types.yaml` 集中定义所有合法的 input_type（image / video / audio / bvh / mask / 自定义）：
- frontmatter refs 分组 key 必须来自此注册表
- api_config `inputs.<key>` 也受此约束
- 找不到时编译报错

### Prompt 编译模式 (v0.10.0)

由 `--prompt-mode` CLI 选项或 api_config `prompt_compile_mode` 控制：

| 模式 | 行为 | 适用 |
|------|------|------|
| `keep` (默认) | prompt 原文不变 + 在 `_opsv._refs_map` 附加 `{ "@hero": "@hero" }` 映射表 | 现代模型能直接理解 @ 语法 |
| `index` | `@hero` → `image1`、`@:angle_side` → `image2` | ComfyUI 节点编号场景 |
| `name` | `@hero` → `hero`、`@:angle_side` → `angle_side` | 模型按语义名匹配 |

### api_config inputs 配置

```yaml
volc.seedance2:
  prompt_compile_mode: keep      # 可选：keep | index | name
  inputs:
    prompt:
      source: prompt
      target: content[0].text
    image:
      source: refs[image]        # 取 refs.image 所有路径
      target: content[].image_url
    audio:
      source: refs[audio]
      target: content[].audio_url

runninghub.default:
  inputs:
    prompt:    { source: prompt }
    image1:    { source: refs[image][0] }    # 取 refs.image 第一个
    seed:      { source: default.seed }
```

**source 快捷路径**：
- `prompt` / `negative_prompt` — frontmatter 字段
- `first_frame` / `last_frame` — frame_ref 字段
- `refs[image]` / `refs[image][N]` — 分组 refs 全部或第 N 个
- `reference_images[N]` — 兼容旧路径
- `job.payload.X` / `default.X` — 通用 dot-path

### opsv refs 工具

```bash
opsv refs check <file>          # 报告 prompt ↔ refs 差异
opsv refs sync <file> --write   # 自动补全 refs（多候选留空让 review 处理）
```

### Category 校验配置 (v0.10.0)

`.opsv/category_validate.yaml`（项目级）+ `~/.opsv/category_validate.yaml`（用户级）+ 内置默认：

```yaml
shot:
  required_fields: [status, prompt, refs]
  field_schema:
    prompt:
      min_length: 20
      no_placeholder: true                    # 禁用 TODO/FIXME/XXX/TBD
      refs_in_prompt_must_match_refs: true   # 双向校验

project:
  required_fields: [status]
  skip_prompt_check: true                    # project 元数据，无需 prompt
```

CLI 选项：
```bash
opsv validate --category shot              # 只验证 shot 类型
opsv validate --strict                      # warning 也视为失败
opsv validate --skip-category-rules        # 跳过 category 规则
```

### 状态机
每个可审阅对象拥有 `status` 字段：

| 状态 | 含义 |
|------|------|
| `drafting` | 起草中（默认，无任何审阅动作记录） |
| `syncing` | 修改过的任务经 approve 后，生成物与源文档描述字段尚未对齐，**阻断下游 Circle** |
| `approved` | 已完全就绪，可作为下游依赖 |

**状态流转**：
- 原始任务（`id.json` → 生成物 `id_1.ext`）approve → **直接 `approved`**
- 修改任务（`id_2.json` → 生成物 `id_2_1.ext`）approve → **`syncing`** → Agent 对齐后 → `approved`

**CLI 非冲突原则**：Review approve 仅做两件事：
1. 追加 review 记录（时间戳 + approve 意见 + 如有修改则记录 task JSON 路径）
2. 根据生成物文件名模式设置状态（`approved` 或 `syncing`）

**绝不修改 `prompt`、`visual_detailed`、`visual_brief` 等内容字段**，所有字段对齐由 Agent 完成。

**一致性铁律**:
- `status: approved` 的文档**必须**包含至少一张有效的 `## Approved References` 参考图（`![variant](path)` 格式）
- `syncing` 资产虽已有 Approved References，但被视为"未就绪"，**阻断下游 Circle 执行**
- Agent 检查 `syncing` 资产的 review 记录中的 `modified_task` 路径，对齐文档描述字段与修改后 task JSON
- `opsv validate` 会自动校验 status 与 Approved References 一致性、syncing 字段对齐状态

### Syncing Gate (v0.8.8)
Produce 命令编译时会验证所有 `@ref` 引用的资产状态：
- 引用的资产状态为 `syncing` → 跳过当前资产的编译，输出警告
- 引用的资产状态为 `approved` → 通过验证，正常编译
- 这是 Manifest-First 架构的关键保障，确保依赖链完整

### Circle 状态图标（`opsv circle refresh` 输出）

| 图标 | 状态 | 含义 |
|------|------|------|
| ⭕ | 未开始 | 该 Circle 无任何 approved 资产 |
| ⏳ | 进行中 | 部分资产已批准，或存在 syncing 资产（N syncing） |
| ✅ | 已完成 | 全部资产已批准，可晋升下一 Circle |

## 资产目录结构

```
videospec/                         # 创意资产根目录
├── project.md                     # 全局配置 + 资产花名册
├── stories/story.md              # 故事大纲
├── elements/@role_hero.md        # 角色定义（@id 全局引用）
├── scenes/@scene_bar.md          # 场景定义
├── shots/
    ├── shot_01.md                # 分镜数据源（v0.8）
    ├── shot_02.md
    └── shotlist.md               # 视频工程图纸（末环，独立不进依赖图）

.opsv/                              # OpsV 内部状态
├── api_config.yaml
└── videospec_graph.json           # 依赖图（由 opsv circle create 生成）
                                    # _manifest.json 现位于各 .circleN/ 目录内

opsv-queue/                         # 渲染产物目录
└── videospec_circle1/             # 按 basename.circleN 组织
    ├── _manifest.json             # 该 Circle 资产清单 + 状态快照（含 assets 字段）
    └── volcengine.seadream/       # Provider.Model 扁平目录
        ├── @hero.json             # 初始编译的任务
        ├── @hero_1.png            # 初始编译的产出
        ├── @hero_2.json           # 修改后的任务（序号递增）
        └── @hero_2_1.png          # 修改任务的产出（多一层_N）

videospec_circle2/                 # 后续 Circle（批次号递增）
    ├── _manifest.json
    └── volcengine.seedance/
```

### 命名规则

- **Circle 目录**：统一格式 `{basename}.circle{N}/`，如 `videospec_circle1/`、`videospec_circle2/`。Layer 语义（ZeroCircle、FirstCircle、EndCircle）存储在 `_manifest.json` 中，不再作为目录名
- **多剧集**：每个剧集独立建图，如 `episode_2_circle1/`
- **Graph 名**：由 `opsv circle create --dir <path>` 的路径名决定，`--name` 可覆盖 basename
- **Provider 目录**：扁平 `provider.model/` 格式，直接位于 Circle 目录下，无 queue_N 子目录
- **Shot 文件**：`shot_*.md` 的 ID 绑定到文件名，修改文件名 = 删除重建

### 任务 JSON 与生成物命名约定

| 场景 | 任务 JSON | 生成物 | Review 结果 |
|------|-----------|--------|-------------|
| 初始编译 | `@hero.json` | `@hero_1.png` | 原始任务 → 直接 `approved` |
| 修改后重编译 | `@hero_2.json` | `@hero_2_1.png` | 修改任务 → `syncing`，Agent 需对齐 |
| 再次修改 | `@hero_3.json` | `@hero_3_1.png` | 修改任务 → `syncing`，Agent 需对齐 |

**规则**：
- 初始编译：`id.json` → 生成物 `id_1.ext`
- 修改任务递增序号：`id_2.json`、`id_3.json`...
- 修改任务生成物：`id_N_1.ext`（多一个 `_1` 层级）
- Review 通过生成物文件名判断来源：
  - `id_N.ext` 模式 → 原始任务 → 直接 `approved`
  - `id_N_N.ext` 模式 → 修改任务 → `syncing` + review 记录中追加 `modified_task` 路径

### Shot 文件系统

每个分镜是独立的 `shot_*.md` 文件：

```yaml
---
# id 由文件名推导（shot_01.md → id: shot_01），frontmatter 无需声明
status: drafting
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "5s"
refs:
  image:
    "@role_hero":
      - opsv-queue/.../role_hero_1.png
    "@scene_forest":
      - opsv-queue/.../scene_forest_1.png
---

## Shot 01 - 开场森林

@role_hero 走进 @scene_forest，镜头缓慢推进...

## Design References
<!-- 资料堆，可放任意参考 -->
[森林场景](#scene_forest)
```

- `id` 绑定文件名，改名 = 删除重建
- `first_frame` / `last_frame` 用 `@shot_XX:first/last` 语法
- `refs` 为 `{ type: { @key: paths[] } }` 分组结构，参与拓扑排序，决定 Circle 分层
- prompt 中的 `@id` / `@:key` 必须与 refs 一一对应（双向校验）
- `shotlist.md` 是末环，独立处理，不进依赖图

## Agent 角色速查

| 角色 | 职责 | 对应文档 |
|------|------|---------|
| **Creative-Agent** | 创意脑暴、资产设计、分镜撰写、Shotlist 生成 | `creative-workflow.md` |
| **Runner-Agent** | 任务生成、编译执行、物理渲染、产物归档 | `ops-workflow.md` |
| **Guardian-Agent** | 文档校验、审查把关、状态同步、质量守卫 | `ops-workflow.md` |

## Frontmatter 格式规范

**⚠️ 关键约束：`---` 分隔符必须是文件第一行**

OpsV 的 `FrontmatterParser` 要求 YAML frontmatter 的 `---` 开始符必须出现在文件的第一行。文件开头的任何 Markdown 注释、标题、或空行都会导致解析失败。

**正确格式**：
```markdown
---
category: shot-production
status: drafting
title: Shot 01
duration: "5s"
first_frame: "/path/to/shot_01_1.png"
negative_prompt: "low quality, blurry"
refs:
  image:
    "@scene_lab":
      - opsv-queue/.../scene_lab_1.png
    "@hero":
      - opsv-queue/.../hero_1.png
visual_detailed: |
  @hero 进入 @scene_lab...
---

正文从此处开始...
```

**错误格式（常见）**：
```markdown
# Shot Title
> 描述文字

---
category: shot-production
# --- 必须在这里（即第一行），不能有任何前置内容
```

**Shot 文档结构**：
- 每个 shot 是独立 `.md` 文件，拥有自己的 frontmatter
- frontmatter 必填字段：`category`、`status`
- Shot 特定字段：`duration`、`first_frame`、`last_frame`、`frame_ref`
- Prompt 取值优先级：`prompt` → `visual_detailed` → `visual_brief` → body 第一段
- `refs` 为 `{ type: { @key: paths[] } }` 分组结构，type 必须在 `.opsv/input_types.yaml` 注册
- prompt 中的 `@id` / `@id:variant` / `@:key` / `@FRAME:*` 由 `RefSyntaxParser` 统一解析
- `opsv refs check <file>` 校验 prompt ↔ refs 双向对应
- `opsv refs sync <file>` 自动补全 refs（多候选留空让 review 确定）
- ComfyUI / RunningHub 工作流支持 `seed: random`（自动替换为随机自然数）

## 关键工作流命令

```bash
# 文档校验（任何修改后必做）
opsv validate

# 新建并激活依赖图
opsv circle create --dir videospec
opsv circle create --dir episode_2         # 多剧集
opsv circle create --dir videospec --name custom  # 覆盖 basename
opsv circle create --dir videospec --skip-middle-circle  # 简化模式

# 刷新依赖图状态（合并原 status + deps 功能）
opsv circle refresh

# 图像任务生成 + 编译（直接产出可执行 .json，无 jobs.json 中间层）
opsv imagen --model volcengine.seadream-5.0-lite
# 选项: --manifest, --file, --category, --status-skip, --dry-run

# 视频任务生成 + 编译（直接产出可执行 .json）
opsv animate --model volcengine.seedance-2.0
# 选项: --manifest, --file, --category, --status-skip, --dry-run

# ComfyUI 工作流编译（node_mapping 必填）
opsv comfy --model comfylocal.klein9b    # 本地 ComfyUI（使用 node_mapping）
opsv comfy --model runninghub.default     # RunningHub 云端（使用 node_mapping）

# 生成 node_mappings（本地和 RunningHub 通用）
opsv comfy-node-mapping my_workflow.json -o my_workflow.opsv-workflow.json
# → 在 ComfyUI 中用 opsv- 前缀标记节点 → 导出 API 格式 JSON → 运行此命令提取映射

# WebApp 生成（新增）
opsv webapp --model <provider.model>

# 音频生成（规划中）
opsv audio --model <provider.model>

# 按路径执行渲染
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/shot_01.json
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/   # 执行目录下所有任务
opsv run <path1> <path2> ...                                      # 多路径
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/ -c 3  # 并发执行

# 迭代（修改任务后重跑）
opsv iterate opsv-queue/videospec_circle1/volcengine.seadream_001/@hero.json
opsv iterate opsv-queue/videospec_circle1/volcengine.seadream_001/   # 迭代整个目录

# 审阅
opsv review                              # 全局模式：文档为唯一真相，扫描所有 Circle
opsv review --circle                     # Manifest 模式：聚焦单个 Circle
opsv review --circle videospec_circle1   # 指定 Circle 目录
opsv review --latest                     # 仅最新 Circle
opsv review --port 3100 --ttl 300        # 自定义端口与空闲超时
#    → 全局模式：category/status 来自文档 frontmatter，manifest 仅用于发现 docId 和输出
#    → Manifest 模式：从 manifest 获取 docId，递归扫描 provider 目录（含嵌套子目录）
#    → 启动时自动 git commit checkpoint
#    → Approve 后（根据生成物文件名自动判断）：
#      - 原始任务生成物 (id_1.ext) → 直接 approved
#      - 修改任务生成物 (id_2_1.ext) → syncing + 记录 modified_task 路径
#    → CLI 绝不修改 prompt 等内容字段
#    → syncing 状态的资产：Agent 需对齐 visual_detailed/visual_brief/refs 后改为 approved
#    → 全部 approved 后 opsv circle refresh 自动更新 _manifest.json
```

## Node Mapping 降级策略 (v0.10.0)

编译时 node_mapping 的来源优先级：

| 优先级 | 来源 | 触发条件 |
|--------|------|----------|
| 1 | `api_config.yaml` `node_mappings` | `--force-api-mapping` 强制使用 |
| 2 | 文档 frontmatter `node_mapping` | 默认行为，frontmatter 有值时优先 |
| 3 | `api_config.yaml` `node_mappings` | frontmatter 无值时兜底 |

```bash
# 默认：frontmatter 优先 → api_config 兜底
opsv comfy --model runninghub.default

# 强制使用 api_config 的 mapping（忽略 frontmatter）
opsv comfy --model runninghub.default --force-api-mapping
```

**inputs + node_mappings 协作**（v0.10.0）：
- `inputs` 定义数据来源（source 快捷路径）和注入目标（target），由 InputEvaluator 求值
- `node_mappings` 定义工作流节点注入位置（nodeId + fieldName）
- inputs key 与 node_mappings key 对齐：inputs 解析值，node_mappings 指定注入位置

**ComfyUI 工作流配置流程**：
1. 在 ComfyUI 中用 `opsv-` 前缀标记需要外部控制的节点（如 `opsv-prompt`、`opsv-image1`、`opsv-seed`）
2. 导出 API 格式 JSON（Save → API format）
3. `opsv comfy-node-mapping workflow.json -o workflow.opsv-workflow.json` 提取映射
4. 将 node_mappings 写入 api_config.yaml 或 frontmatter
5. 可选：添加 `inputs` 配置声明数据来源

## 导航索引

- **创意管线**（脑暴 → 架构 → 资产 → 剧本 → 动画）→ 见 `creative-workflow.md`
- **运维管线**（校验 → 生成 → 编译 → 渲染 → 审查）→ 见 `ops-workflow.md`
- **CLI 速查** → 见 `references/cli_reference.md`
- **文档模板** → 见 `references/` 目录
  - `element_template.md` — 角色/道具/场景等静态资产
  - `scene_template.md` — 场景描述
  - `workflow_template.md` — ComfyUI / RunningHub 工作流配置（含 workflow + node_mapping）

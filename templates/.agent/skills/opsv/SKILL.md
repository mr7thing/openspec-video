---
name: opsv
description: OpsV 核心框架 — Circle 架构、@-引用语法、refs 语义、状态机、CLI 命令速查。三个 Agent 角色的共享参考手册。
---

# OpsV 核心框架

## 1. Circle 架构

生产管线按依赖层级划分为 Circle，每层对应一批可并行执行的渲染任务：

```
ZeroCircle    →  基础静态资产（角色、场景、道具）
FirstCircle   →  基于 approved 资产的分镜图像
SecondCircle  →  中间层级（按需）
EndCircle     →  动态视频（仅当 shotlist.md 存在）
```

**铁律**：
- Circle 执行顺序严格递增——ZeroCircle 未全部 approved 时，禁止启动 FirstCircle
- `opsv circle refresh` 每次运行都重新扫描所有文档，不可缓存上次结果
- 任何文档变更（refs 修改、Approve/Draft、新增/删除）后必须重新执行 `opsv circle refresh`
- `syncing` 状态的资产阻断下游 Circle 编译

## 2. 目录结构

```
videospec/                          # 创意资产根目录
├── project.md                      # 全局配置 + 资产花名册
├── stories/story.md                # 故事大纲
├── elements/@hero.md               # 角色（文件名 = @id）
├── scenes/@temple.md               # 场景
├── shots/
│   ├── shot_01.md                  # 分镜（独立文件）
│   ├── shot_02.md
│   └── shotlist.md                 # 视频工程图纸（末环）

opsv-queue/                         # 渲染产物（增量，不删除）
└── videospec_circle1/              # 一个 Circle 批次 = 所有层级的总和
    ├── _manifest.json              # 含全部 Layer: zerocircle, firstcircle, ...
    ├── volcengine.seadream_001/    # ZeroCircle 编译产出
    │   ├── @hero.json              # 初始编译的任务
    │   ├── @hero_1.png             # 初始编译的产出
    │   ├── @hero_2.json            # 修改后的任务（序号递增）
    │   └── @hero_2_1.png           # 修改任务的产出
    └── volcengine.seedance_001/    # FirstCircle 编译产出（同一目录）
```

### 命名规则

| 对象 | 规则 | 示例 |
|------|------|------|
| 文档文件名 | `@id.md` | `@hero.md`, `@temple.md`, `shot_01.md` |
| Circle 目录 | `{basename}_circle{N}`（批次号，仅依赖结构变化时递增） | `videospec_circle1` |
| Provider 目录 | `{provider}.{model}` 扁平 | `volcengine.seadream_001` |
| 初始任务 JSON | `{id}.json` | `@hero.json`, `shot_01.json` |
| 初始产出 | `{id}_{1}.{ext}` | `@hero_1.png`, `shot_01_1.mp4` |
| 修改任务 JSON | `{id}_{N}.json` (N≥2) | `@hero_2.json` |
| 修改产出 | `{id}_{N}_{1}.{ext}` | `@hero_2_1.png` |
| 迭代目录 | `{provider}.{model}_it_{NNN}` | `volcengine.seadream_001_it_001` |

## 3. @ 引用语法

统一的 `@` 前缀体系，覆盖全部引用场景：

| 形式 | 含义 | 解析时机 |
|------|------|---------|
| `@id` | 外部资产引用 | 编译时解析为 approved refs |
| `@id:variant` | 外部资产 + variant | 编译时解析指定 variant |
| `@:key` | 本文档 Design References 中的图 | 编译时从自身 `## Design References` 解析 |
| `@FRAME:shotId_first` | 上游分镜首帧 | 编译时搜 `.circleN/provider.model/` 目录 |
| `@FRAME:shotId_last` | 上游分镜尾帧 | 同上 |

### @FRAME 路径解析

`@FRAME:` 在 `opsv animate` 编译时搜索所有 `.circleN/<provider.model>/` 目录，解析为相对路径。编译时不检查文件存在性（上游视频可能尚未生成）。

## 4. Refs 语义

**refs 只表达「生成此资产所需的视觉输入依赖」，不是剧情关系、上下文关系或归属关系。**

refs 必须构成有向无环图（DAG），否则 Circle 拓扑排序失败。

### 自检三连问

在写 refs 之前，对每个引用目标问：

1. 我画/生成这个资产时，**这张参考图必须先存在**吗？
2. 如果没有这张图，模型**画不出/画错**当前资产的视觉效果吗？
3. 这个引用是**视觉输入**，还是**剧情说明**？

只有三个答案都是「视觉输入依赖」，才进 refs。

### 正确层级示例

```
第 0 层: 风格参考、素材库
  refs: {}   ← 不依赖任何 OpsV 资产

第 1 层: 角色定档 (@hero)
  refs: { image: { "@style:anime": [...] } }   ← 仅依赖第 0 层

第 2 层: 场景定档 (@temple)
  refs: { image: { "@style:anime": [...] } }   ← 仅依赖第 0 层（不依赖角色！）

第 3 层: 分镜画面 (@shot_01)
  refs: { image: { "@hero": [...], "@temple": [...] } }   ← 依赖用到角色+场景

第 4 层: 分镜视频 (shotlist)
  refs: { image: { "@shot_01:first": [...], "@shot_01:last": [...] } }
```

### ⚠️ 常见错误（反例）

```yaml
# ❌ 角色定档引用了场景
# elements/yun_li_adult.md
refs:
  image:
    "@temple":  [...]    # 画云力时不需要先有庙宇

# ❌ 场景定档引用了将出现在场景中的角色
# scenes/temple.md
refs:
  image:
    "@hero":   [...]     # 画庙宇时不需要先有英雄

# ❌ 角色 A 和角色 B 互相引用
# elements/sister.md
refs:
  image:
    "@brother": [...]    # 两个独立角色不该互相依赖

# ❌ 分镜引用了"不在画面中"的资产
# shots/shot_01.md — prompt: "@hero 独自站在 @temple 前"
refs:
  image:
    "@villain": [...]    # villain 根本不在画面里，为什么需要他的图？
    "@bar": [...]        # bar 是闪回镜头出现的，当前画面没有
```

详细的 refs 编写指南和自检清单见 `skills/opsv/references/refs_guide.md`。

## 5. Refs 结构（v0.10+）

```yaml
refs:
  image:
    "@hero":
      - opsv-queue/videospec_circle1/volcengine.seadream_001/hero_1.png
    "@:angle_front":
      - ./refs/hero_front.png
  video:
    "@swim_loop":
      - opsv-queue/videospec_circle2/volcengine.seedance_001/swim.mp4
```

**硬性规则**：
- 每个 key 必须至少 1 个路径（数组非空）
- 每个 `@` token（在 `prompt` 字段中）必须在 refs 中有对应 key
- refs 中每个 key 必须在 `prompt` 中被引用（双向校验）
- input_type（`image`/`video`/`audio` 等）必须在 `.opsv/input_types.yaml` 中注册
- 校验工具：`opsv refs check <file>` / `opsv refs sync <file> --write`

## 6. 双通道参考图

| 区域 | 方向 | 用途 | 谁写入 |
|------|------|------|--------|
| `## Design References` | **输入侧** | 本文档的参考素材，编译时作为 `reference_images` 传给 API | Agent 手动编辑 |
| `## Approved References` | **输出侧** | 审查通过后的定档图像，供其他文档通过 `@id:variant` 引用 | review 自动写入 |

**一致性铁律**：`status: approved` ⇔ 必须有至少一张 `![variant](path)` 格式的 Approved References。

## 7. 状态机

```
drafting → syncing → approved
```

| 状态 | 含义 | 触发条件 |
|------|------|---------|
| `drafting` | 创作中 | 新建文档默认；审查 Draft 后回退 |
| `syncing` | 待 Agent 对齐 | 修改任务 approve 后（生成物来自 `id_N.json`） |
| `approved` | 已就绪 | 原始任务 approve 后；Agent 完成 syncing 对齐后 |

**流转规则**：

| 触发 | 产出物模式 | 新状态 | 下游 Circle |
|------|-----------|--------|------------|
| 初始 approve | `id_1.ext` | `approved` | ✅ 解锁 |
| 修改后 approve | `id_2_1.ext` | `syncing` | ❌ 阻断 |
| Agent 完成对齐 | — | `approved`（Agent 手动设） | ✅ 解锁 |
| Draft 驳回 | — | `drafting` | ❌ 阻断 |

**syncing → approved Agent 对齐步骤**（详见 `skills/guardian/SKILL.md`）：
1. 读取 review 记录中的 `modified_task` 路径
2. 加载修改后的 task JSON
3. 对比 task JSON 的 `content[].text` ↔ 源文档 `prompt`
4. 翻译 `prompt` → `visual_detailed`（英文→中文）
5. 提炼 → `visual_brief`（≤120 字）
6. 对齐 refs 与 `## Design References`
7. `status: syncing → approved`
8. `opsv validate` 确认

## 8. Prompt 写作指南

**prompt 是给生成模型的指令，不是叙事。**

| ✅ 正确 | ❌ 错误 |
|---------|---------|
| 描述"画面里的元素" | 描述"故事发生了什么" |
| `@id` 是能在结果中看到的对象 | `@id` 是回忆/闪回/不在场的角色 |
| 写构图、光、镜头、风格 | 写背景故事、角色心情、前情提要 |

```markdown
# ✅ 正确
prompt: >
  @hero 站在 @temple 庭院中央，背对镜头。逆光剪影，金色暮光从檐角洒下。
  写实电影感，浅景深，35mm 胶片质感。

# ❌ 错误
prompt: >
  @hero 这时想起多年前与 @villain 在 @bar 的相遇。
  @brother 此时还在 @sea_beach 不知情况。
  # ← @villain/@bar/@brother/@sea_beach 都不在画面里
```

## 9. 关键 CLI 命令

### 管线命令

```bash
opsv validate                          # 校验文档（每次修改后必做）
opsv circle create --dir videospec     # 新建依赖图 + Circle 目录
opsv circle refresh                    # 刷新依赖图状态（每次变更后必做）

opsv imagen --model volcengine.seadream   # 编译图像任务
opsv animate --model volcengine.seedance  # 编译视频任务
opsv comfy --model runninghub.default     # 编译 ComfyUI 任务

opsv run <path>                        # 执行单个任务
opsv run <dir>/                        # 执行目录下全部任务
opsv run <dir>/ --retry                # 重试失败任务
opsv run <p1> <p2> -c 3                # 多路径并发执行

opsv iterate <task.json>               # 克隆任务用于迭代
opsv iterate <dir>/                    # 克隆整个 provider 目录

opsv review                            # 启动审查 Web UI
opsv review --circle                   # Manifest 模式
opsv review --latest                   # 仅最新 Circle
```

### 管理命令

```bash
opsv init [name]                       # 初始化项目
opsv refs check <file>                 # 检查 prompt ↔ refs 一致性
opsv refs sync <file> --write          # 自动补全 refs
opsv comfy-node-mapping <file> -o <out> # 提取 ComfyUI node_mappings
opsv script                            # 从 shot_*.md 聚合 Script.md
```

### Cloud 命令

```bash
opsv login                             # OAuth Device Flow 登录
opsv review --cloud                    # 云端隧道审查
opsv review --cloud --status <sid>     # 查看会话状态
opsv review --cloud --rotate-review-token <sid>  # 轮换审查 token
opsv review --cloud --close <sid>      # 关闭云端会话
```

完整 CLI 参考见 `skills/opsv/references/cli_reference.md`。

## 10. Category 体系

OpsV 只有 **两个** 内置 category。其余全部由用户在项目中自定义。

| category | 用途 | 特殊行为 |
|----------|------|---------|
| `project` | 项目元数据——风格方向、世界观、画面比例、剧集大纲 | 跳过 prompt 检查（不参与生成） |
| `shotlist` | 批量视频生成，末环 EndCircle | 特殊格式；`opsv animate` 编译目标 |

**自定义 category** 在 `videospec/_category_validate.yaml` 中定义（叠加 `~/.opsv/category_validate.yaml` 用户级配置）。常见自定义：`element`、`scene`、`shot`。用户完全自由命名，每个 category 可声明自己的必填字段和验证规则。

> 视频生成不仅限于 shotlist——任何 category 的文档都可以通过 ComfyUI 工作流（如 4 帧/9 帧配置）生成视频。

## 11. 导航

| 需要什么 | 文件 |
|---------|------|
| Frontmatter 字段完整定义 | `references/frontmatter_schema.md` |
| refs 编写指南 + 反例库 + 自检清单 | `references/refs_guide.md` |
| 角色/场景/分镜文档模板 | `references/workflow_templates.md` |
| 命名规范大全 | `references/naming_conventions.md` |
| CLI 命令完整参考 | `references/cli_reference.md` |

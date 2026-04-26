---
name: opsv
description: OpsV v0.7.0 核心框架 — Circle 架构、资产管线、任务编排与审查协议。
---

# OpsV 框架规范 (v0.7.0)

OpenSpec-Video (OpsV) 是一个面向 AI 视频生产的结构化工作流框架。它将创意过程拆解为可编译、可审查、可迭代的工业管线。

## 核心概念

### Circle 架构
生产管线按依赖层级划分为 Circle，每一 Circle 对应一批可并行执行的渲染任务：

| Circle | 职责 | 产出 |
|--------|------|------|
| **ZeroCircle** | 基础静态资产（角色、场景、道具） | `opsv-queue/videospec_zerocircle_1/imagen_jobs.json` |
| **FirstCircle** | 基于 approved 资产的分镜图像 | `opsv-queue/videospec_firstcircle_1/imagen_jobs.json` |
| **...** | 中间层级（按需扩展） | ... |
| **EndCircle** | 末端动态视频（自动推断） | `opsv-queue/<graphName>_endcircle_1/video_jobs.json` |

**铁律**：
- 严禁在 ZeroCircle 未完成 Review/Approve 时强行下发 FirstCircle
- `opsv circle status` 每次运行都**重新扫描**所有文档重建依赖图，不可依赖缓存
- 任何文档变更（`refs` 修改、Approve/Draft、新增/删除文件）后必须重新执行 `opsv circle status`

### 全局资产引用
所有实体必须通过 `@id` 全局引用，命名规范：
- 全部小写，下划线分隔
- 如 `@role_hero`, `@scene_bar`, `@prop_gun`
- 引用带变体：`@classroom:morning`

### 状态机
每个可审阅对象拥有 `status` 字段：

| 状态 | 含义 |
|------|------|
| `draft` / `drafting` | 起草中（两者等价，`drafting` 为旧版兼容） |
| `syncing` | Approve 回写完成，`prompt_en` 已更新但 `visual_detailed`/`visual_brief`/`refs` 尚未对齐，**阻断下游 Circle** |
| `approved` | 已完全就绪，可作为下游依赖 |

**状态流转**：`drafting → draft → [渲染] → [approve] → syncing → [Agent对齐] → approved`

**一致性铁律**:
- `status: approved` 的文档**必须**包含至少一张有效的 `## Approved References` 参考图（`![variant](path)` 格式）
- `syncing` 资产虽然已有 Approved References，但被视为"未就绪"，**阻断下游 Circle 执行**
- `opsv validate` 会自动校验 status 与 Approved References 一致性、syncing 字段对齐状态

### Circle 状态图标（`opsv circle status` 输出）

| 图标 | 状态 | 含义 |
|------|------|------|
| ⭕ | 未开始 | 该 Circle 无任何 approved 资产 |
| ⏳ | 进行中 | 部分资产已批准，或存在 syncing 资产（⚠️ N syncing） |
| ✅ | 已完成 | 全部资产已批准，可晋升下一 Circle |

## 资产目录结构

```
videospec/                         # 创意资产根目录
├── project.md                     # 全局配置 + 资产花名册
├── stories/story.md              # 故事大纲
├── elements/@role_hero.md        # 角色定义（@id 全局引用）
├── scenes/@scene_bar.md          # 场景定义
└── shots/
    ├── shot_01.md                # 分镜数据源（v0.7.0）
    ├── shot_02.md
    ├── Script.md                 # 聚合展示（由 opsv script 生成）
    └── Shotlist.md               # 视频工程图纸（末环，独立不进依赖图）

.opsv/                              # OpsV 内部状态
├── api_config.yaml
├── videospec_graph.json           # 依赖图（由 opsv circle create 生成）
└── videospec_manifest.json       # 状态快照（由 opsv circle status 自动写入）

opsv-queue/                         # 渲染产物目录
├── videospec_zerocircle_1/        # 目录名格式：{graphName}_{circleName}_N
│   ├── imagen_jobs.json
│   └── volcengine-seadream5/queue_1/
│       ├── shot_01.json
│       └── shot_01_1.png
└── videospec_endcircle_1/
    ├── video_jobs.json
    └── volcengine-seedance2/queue_1/
```

### 命名规则

- **Circle 目录**：统一格式 `{graphName}_{circleName}_N`，如 `videospec_zerocircle_1`、`videospec_firstcircle_1`、`videospec_endcircle_1`
- **多剧集**：每个剧集独立建图，如 `episode_2_zerocircle_1`
- **Graph 名**：由 `opsv circle create --dir <path>` 的路径名决定
- **Shot 文件**：`shot_*.md` 的 ID 绑定到文件名，修改文件名 = 删除重建

### Shot 文件系统

每个分镜是独立的 `shot_*.md` 文件：

```yaml
---
# id 由文件名推导（shot_01.md → id: shot_01），frontmatter 无需声明
status: draft
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "5s"
refs:
  - "@role_hero"
  - "@scene_forest"
---

## Shot 01 - 开场森林

角色走进阴暗的森林，镜头缓慢推进...
```

- `id` 绑定文件名，改名 = 删除重建
- `first_frame` / `last_frame` 用 `@shot_XX:first/last` 语法
- `refs` 参与拓扑排序，决定 Circle 分层
- `Script.md` 由 `opsv script` 从 shot_*.md 聚合生成（带来源标注）
- `Shotlist.md` 是末环，独立处理，不进依赖图

## Agent 角色速查

| 角色 | 职责 | 对应文档 |
|------|------|---------|
| **Creative-Agent** | 创意脑暴、资产设计、分镜撰写、Shotlist 生成 | `creative-workflow.md` |
| **Runner-Agent** | 任务生成、编译入队、物理渲染、产物归档 | `ops-workflow.md` |
| **Guardian-Agent** | 文档校验、审查把关、状态同步、质量守卫 | `ops-workflow.md` |

## 关键工作流命令

```bash
# 文档校验（任何修改后必做）
opsv validate

# 新建并激活依赖图
opsv circle create --dir videospec
opsv circle create --dir episode_2         # 多剧集
opsv circle create --dir videospec --skip-middle-circle  # 简化模式

# 依赖图状态（status 合并 manifest，自动写入 .opsv/videospec_manifest.json）
opsv circle status

# 依赖分析
opsv deps

# 图像任务生成（自动推断 Circle，默认跳过已 approved 资产）
opsv imagen [targets...]
# 选项: --preview, --shots, --circle <name>, --no-skip-approved, --skip-circle-check

# 视频任务生成（自动推断末端 Circle）
opsv animate
# 选项: --circle <name>, --skip-circle-check

# 编译为可执行 API 请求体
opsv queue compile <jobs.json> --model <provider.model|alias> --circle <name>

# 执行渲染
opsv queue run --model <provider.model|alias> --circle <name> [--retry]

# 审阅
opsv review
#    → 启动时自动 git commit checkpoint: "[review] {ts} — started"
#    → 关闭时自动 git commit: "[review done] {ts} ({reason})"
#    → Approve 后: prompt_en已覆盖 + Design References已同步 + status→syncing
#    → Agent 对齐 visual_detailed/visual_brief/refs 后手动改为 approved
#    → 全部 approved 后 opsv circle status 自动更新 manifest
```

## 导航索引

- **创意管线**（脑暴 → 架构 → 资产 → 剧本 → 动画）→ 见 `creative-workflow.md`
- **运维管线**（校验 → 生成 → 编译 → 渲染 → 审查）→ 见 `ops-workflow.md`
- **CLI 速查** → 见 `references/cli_reference.md`
- **文档模板** → 见 `references/` 目录

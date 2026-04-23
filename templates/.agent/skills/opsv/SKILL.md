---
name: opsv
description: OpenSpec-Video (OpsV) v0.6.4 核心框架规范。涵盖从创意脑暴到视频渲染的完整管线，包括 Circle 架构、资产定义、分镜设计、任务编排与审查协议。
---

# OpsV 框架规范 (v0.6.4)

OpenSpec-Video (OpsV) 是一个面向 AI 视频生产的结构化工作流框架。它将创意过程拆解为可编译、可审查、可迭代的工业管线。

## 核心概念

### Circle 架构
生产管线按依赖层级划分为 Circle，每一 Circle 对应一批可并行执行的渲染任务：

| Circle | 职责 | 产出 |
|--------|------|------|
| **ZeroCircle** | 基础静态资产（角色、场景、道具） | `opsv-queue/zerocircle_1/imagen_jobs.json` |
| **FirstCircle** | 基于 approved 资产的分镜图像 | `opsv-queue/firstcircle_1/imagen_jobs.json` |
| **...** | 中间层级（按需扩展） | ... |
| **EndCircle** | 末端动态视频（自动推断） | `opsv-queue/<endcircle>/video_jobs.json` |

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
- `draft` / `drafting` — 起草中（两者等价，`drafting` 为旧版兼容）
- `approved` — 已通过审查，可作为下游依赖

**一致性铁律**: `status: approved` 的文档**必须**包含至少一张有效的 `## Approved References` 参考图（`![variant](path)` 格式）。`opsv validate` 会自动校验此项。

### Circle 状态图标（`opsv circle status` 输出）

| 图标 | 状态 | 含义 |
|------|------|------|
| ⭕ | 未开始 | 该 Circle 无任何 approved 资产 |
| ⏳ | 进行中 | 部分资产已批准 |
| ✅ | 已完成 | 全部资产已批准，可晋升下一 Circle |

### 目录结构
```
videospec/
├── project.md              # 全局配置 + 资产花名册
├── stories/
│   └── story.md            # 故事大纲（## Act N 结构）
├── elements/
│   ├── @role_hero.md       # 角色定义
│   └── @prop_gun.md        # 道具定义
├── scenes/
│   └── @scene_bar.md       # 场景定义
└── shots/
    ├── Script.md           # 分镜设计
    └── Shotlist.md         # 视频工程图纸（显式账本）

opsv-queue/                 # 统一队列目录（替代旧 artifacts/、queue/）
├── circle_manifest.json    # 拓扑快照（由 opsv circle manifest 生成）
├── zerocircle_1/
│   └── imagen_jobs.json
├── firstcircle_1/
│   ├── volcengine/
│   │   └── queue_1/         # 每次 compile 必然创建新 batch（queue_N+1）
│   │       ├── shot_01.json # 完整 API 请求体（Agent 可直接编辑执行）
│   │       ├── shot_01_1.png
│   │       ├── shot_01.log  # JSONL 执行日志
│   │       └── shot_02.json
│   └── ...
└── frames/                  # @FRAME 引用的尾帧落盘目录
```

## v0.6.4 重大变更

| 旧版本 (v0.5.x) | v0.6.4 |
|-----------------|--------|
| `artifacts/` 目录 | **全部迁移到** `opsv-queue/` |
| `imagen` 直接入队 | `imagen` 只生成 `imagen_jobs.json`，由 `queue compile` 编译为 `.json` |
| `--provider.model` 伪 flag | **`--model <provider.model|alias>`**（如 `--model volc.sd2`） |
| `@FRAME` 解析到 `opsv-queue/frames/` | `@FRAME` 编译为**相对路径** `shot_XX_last.png` |
| `queue.json` manifest | **compile 不再生成**；run 直接扫描 `.json` 文件 |
| `opsv generate` | 拆分为 `opsv imagen / animate / comfy` |
| 资产覆盖式命名 | **本地递增序号** `{jobId}_{runSeq}.{ext}` |
| `.json` = 意图层 | **.json = 可直接发送的 API 请求体**，run 时不再读 api_config |
| Seedance 1.5 旧 API | **新增 Seedance 2.0** Content Generation API（`content[]` 数组格式） |
| 本地文件仅支持路径引用 | **image/audio 支持 Base64 Data URI** 内联（video 除外） |

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

# Circle 状态刷新（文档/Review 变更后必做）
opsv circle status
opsv circle manifest        # 全部 approved 后固化快照

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
```

## 导航索引

- **创意管线**（脑暴 → 架构 → 资产 → 剧本 → 动画）→ 见 `creative-workflow.md`
- **运维管线**（校验 → 生成 → 编译 → 渲染 → 审查）→ 见 `ops-workflow.md`
- **CLI 速查** → 见 `references/cli_reference.md`
- **文档模板** → 见 `references/` 目录

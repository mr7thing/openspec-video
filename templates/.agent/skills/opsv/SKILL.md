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
| **FirstCircle** | 基于资产的分镜图像 | `opsv-queue/firstcircle_1/imagen_jobs.json` |
| **...** | 中间层级（按需扩展） | ... |
| **EndCircle** | 末端动态视频（自动推断） | `opsv-queue/<endcircle>/video_jobs.json` |

**铁律**：严禁在 ZeroCircle 未完成 Review/Approve 时强行下发 FirstCircle。

### 全局资产引用
所有实体必须通过 `@id` 全局引用，命名规范：
- 全部小写，下划线分隔
- 如 `@role_hero`, `@scene_bar`, `@prop_gun`
- 引用带变体：`@classroom:morning`

### 状态机
每个可审阅对象拥有 `status` 字段：
- `draft` — 起草中
- `pending` — 等待渲染
- `approved` — 已通过审查，可作为下游依赖

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
├── zerocircle_1/
│   └── imagen_jobs.json
├── firstcircle_1/
│   ├── volcengine/
│   │   └── queue_1/         # 每次 compile 必然创建新 batch（queue_N+1）
│   │       ├── queue.json   # 只读索引（compile 时生成）
│   │       ├── shot_01.json # 完整 API 请求体（Agent 可直接编辑执行）
│   │       ├── shot_01_1.png
│   │       ├── shot_01.log  # JSONL 执行日志
│   │       └── shot_02.json
│   └── ...
└── frames/                  # @FRAME 引用目标目录
```

## Agent 角色速查

| 角色 | 职责 | 对应文档 |
|------|------|---------|
| **Creative-Agent** | 创意脑暴、资产设计、分镜撰写、Shotlist 生成 | `creative-workflow.md` |
| **Runner-Agent** | 任务生成、编译入队、物理渲染、产物归档 | `ops-workflow.md` |
| **Guardian-Agent** | 文档校验、审查把关、状态同步、质量守卫 | `ops-workflow.md` |

## 导航索引

- **创意管线**（脑暴 → 架构 → 资产 → 剧本 → 动画）→ 见 `creative-workflow.md`
- **运维管线**（校验 → 生成 → 编译 → 渲染 → 审查）→ 见 `ops-workflow.md`
- **CLI 速查** → 见 `references/cli_reference.md`
- **文档模板** → 见 `references/` 目录

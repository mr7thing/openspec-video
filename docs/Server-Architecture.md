# OpenSpec-Video Server Architecture (v0.6.3)

## 1. 架构拓扑 (Arch Topology)

OpenSpec-Video 推行严格的服务生态分类协议："Global vs. Contextual"。系统中的后台服务（Daemon / Web Server）按照生命周期和作用域划分明确职责�?
### 1.1 Global Daemon 服务
**职责定位**: 充当系统底座，支持浏览器扩展 (Chrome Extension)，负责在不同�?OpsV 项目与浏览器间进行持久连接和通信�?- 端口: 默认 `3061` (可通过 `.env` 文件�?`OPSV_DAEMON_PORT` 配置)
- 生命周期: 全局唯一，跨项目运行
- 启动模式: `opsv daemon start` (独立 PID 守护)
- 连接类型: WebSocket

### 1.2 Local UI Review 服务
**职责定位**: 充当项目上下文工具，负责针对特定项目的交互式可视化审阅与 Approve 流程�?- 端口: 默认 `3456` (可通过 `.env` 文件�?`OPSV_REVIEW_PORT` 配置)
- 生命周期: 项目边界，随审阅流程即启即停
- 启动模式: `opsv review` (根据特定�?Batch 解析)
- 连接类型: HTTP REST + Web Interface

### 1.3 Local Task Worker (Cycle & Batch Pipeline)
**职责定位**: 异步任务执行器。在 v0.6.3 中，�?`QueueWatcher` 负责维护�?- **物理分片**: 环境不再使用固定�?`inbox/working` 文件夹，而是按照 `Cycle/Provider/Batch` 进行物理分片�?- **Manifest 驱动**: 每个 Batch 拥有一�?`queue.json`，记录该批次的所有任务状态与执行轨迹�?- **原子�?*: 扫描器逐个锁定 `pending` 状态的任务进行消费，支持大规模并发下的目录隔离�?
---

## 2. 配置中心 (Configuration)

服务端口等环境级参数已从硬编码解耦，交由 `.env` 服务管理配置文件集中控制�?
```env
# 全局 Daemon 端口
OPSV_DAEMON_PORT=3061

# Local Review 端口
OPSV_REVIEW_PORT=3456
```

> **注意 (Attention)**
> 第三�?Agent 或子系统在与这些端点对接时，**必须优先读取 `.env`** 中的环境变量进行连接，严�?fallback 前未检�?env 配置�?
---

## 3. 服务生命周期自动化协�?(Automation Protocol)

所有环境核查与服务拉起应由上层 Orchestrator �?Agent (例如 `opsv-director`) 自动处理，实�?*无感知自启动**战略�?
### 前置钩子 (Pre-flight Hooks)
执行需调用浏览器功能或需要依�?Daemon 环境的任务时，必须先进行服务检查：
1. 检查端口监听态或进程状�?(`opsv daemon status` �?API ping)
2. 当进程沉睡或未存活时，自动运�?`opsv daemon start` 进行自愈启动 
3. 在开始任务前预留充足 buffer（约需 1000ms），随后通知执行主任�?
---

## 4. Cycle & Batch 物理管线 (v0.6.3)

```
opsv-queue/                    # 生产环境总信�?└── {Cycle}/                   # 生成�?(例如 ZeroCircle_1)
    └── {Provider}/            # 供应�?(例如 volcengine)
        └── queue_{N}/         # 执行批次 (Batch, 例如 queue_1)
            ├── queue.json     # 批次清单 (包含状态、日志、结果映�?
            ├── shot_01.json   # 任务意图 (Pure Intention)
            └── shot_01.mp4    # 落地资产 (生成的最终文�?
```

### 状态流转协�?- **Compile 阶段**: `StandardAPICompiler` 在目�?Cycle 下创建新�?`queue_{N}` 目录，并注册意图 JSON�?- **Run 阶段**: `QueueWatcher` 递归扫描目录，针对每�?`queue.json` 中标记为 `pending` 的项目调�?Provider�?- **结果回写**: 这里�?状态流�?不再是文件的物理移动，而是�?`queue.json` 内部修改字段值，并将 API Log 持久化�?
### 架构决策 (ADR)

**ADR-1: 目录即状�?(Directory as State)**
- 放弃 UUID 命名，文件名直接映射 JobId�?- 价�? 极佳的人类可读性，无需额外数据库即可追溯迭代过程�?
**ADR-2: 运行�?fs/promises 标准�?*
- 所有运行时文件 I/O 统一使用 `fs/promises`
- 顶层 boot 代码（env 加载、CLI 解析）保�?sync fs

通过此规范，OpenSpec-Video 实现了强隔离、无依赖冲突的微服务架构体验，从手工环境干预演化至无感知工程自动接管�?

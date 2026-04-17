# OpenSpec-Video Server Architecture (v0.5+)

## 1. 架构拓扑 (Arch Topology)

OpenSpec-Video 推行严格的服务生态分类协议：“Global vs. Contextual”。系统中的后台服务（Daemon / Web Server）按照生命周期和作用域划分明确职责。

### 1.1 Global Daemon 服务
**职责定位**: 充当系统底座，支持浏览器扩展 (Chrome Extension)，负责在不同的 OpsV 项目与浏览器间进行持久连接和通信。
- 端口: 默认 `3061` (可通过 `.env` 文件中 `OPSV_DAEMON_PORT` 配置)
- 生命周期: 全局唯一，跨项目运行
- 启动模式: `opsv daemon serve` / `opsv start` (独立 PID 守护)
- 连接类型: WebSocket

### 1.2 Local UI Review 服务
**职责定位**: 充当项目上下文工具，负责针对特定项目的交互式可视化审阅与 Approve 流程。
- 端口: 默认 `3456` (可通过 `.env` 文件中 `OPSV_REVIEW_PORT` 配置)
- 生命周期: 项目边界，随审阅流程即启即停
- 启动模式: `opsv review` (根据特定的 Batch 解析)
- 连接类型: HTTP REST + Web Interface

### 1.3 Local Task Worker
**职责定位**: 单点任务消费者（不监听任何网络端口）。
- 生命周期: 针对具体意图自动派生进程处理 `processTask(task)`
- 执行模式: 随用随销，通过队状态进行原子级别隔离

---

## 2. 配置中心 (Configuration)

服务端口等环境级参数已从硬编码解耦，交由 `.env` 服务管理配置文件集中控制：

```env
# 全局 Daemon 端口
OPSV_DAEMON_PORT=3061

# Local Review 端口
OPSV_REVIEW_PORT=3456
```

> **注意 (Attention)**
> 第三方 Agent 或子系统在与这些端点对接时，**必须优先读取 `.env`** 中的环境变量进行连接，严禁 fallback 前未检出 env 配置。

---

## 3. 服务生命周期自动化协议 (Automation Protocol)

所有环境核查与服务拉起应由上层 Orchestrator 或 Agent (例如 `opsv-director`) 自动处理，实行**无感知自启动**战略。

### 前置钩子 (Pre-flight Hooks)
执行需调用浏览器功能或需要依赖 Daemon 环境的任务时，必须先进行服务检查：
1. 检查端口监听态或进程状态 (`opsv status` 或 API ping)
2. 当进程沉睡或未存活时，自动运行 `opsv start` 进行自愈启动 
3. 在开始任务前预留充足 buffer（约需 1000ms），随后通知执行主任务

通过此规范，OpenSpec-Video 实现了强隔离、无依赖冲突的微服务架构体验，从手工环境干预演化至无感知工程自动接管。

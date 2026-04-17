# OpenSpec-Video (OpsV) 0.6.0 (Spooler Queue Era)

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Narrative Markdown into industrial-grade video & image generation tasks via physical state machines.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional, **Spec-First** video production pipeline. v0.6.0 introduces the **Spooler Queue** architecture, a major leap in reliability that isolates creative intent from API execution using a physical file-based state machine.

OpsV 是一套专业的、**规范驱动 (Spec-First)** 的视频制作管线。v0.6.0 引入了全新的 **Spooler Queue (物理排队论)** 架构，通过物理文件状态机实现了创意意图与 API 执行的彻底解耦，极大提升了工业级生产的鲁棒性。

---

## 🚀 Quick Start / 快速开始

```bash
# Install / 安装
npm install -g videospec

# Initialize Project / 项目初始化 (v0.6 自动创建运行时目录)
opsv init my-project

# 1. Compile Spec -> Intent Outline / 编译意图大纲
opsv generate        

# 2. Atomize Intent -> API Tasks / 原子化编译任务 (v0.6 新增)
opsv queue compile queue/jobs.json --provider seadream

# 3. Consume & Execute / 顺序执行任务 (v0.6 新增)
opsv queue run seadream

# 4. Web-based Review / 可视化审阅
opsv review          

# 5. Video Pipeline / 视频管线
opsv animate         
opsv queue compile queue/video_jobs.json --provider seedance
opsv queue run seedance
```

---

## 🏗️ Core Architecture: Spooler Queue (v0.6)

In v0.6.0, we replaced the in-memory **Dispatcher** with a robust **Physical State Machine**. All generation tasks now flow through the `.opsv-queue/` directory:

在 v0.6.0 中，我们用稳健的**物理状态机**取代了内存中的 **Dispatcher**。所有生成任务现在都流经 `.opsv-queue/` 目录：

1. **Pending**: Tasks waiting to be executed.
2. **Processing**: Atomic task being handled by a provider (Locked).
3. **Completed / Failed**: Final archival with full result traces or error logs.

This allows for **breakpoint recovery**, **single-threaded safety**, and **zero-collision execution**.

---

## 🛠️ Key Features / 核心特性

- **Intent-Execution Decoupling**: `generate` only cares about *what* you want; `queue run` only cares about *how* to call the API.
- **Physical State Machine**: No more lost tasks due to crashes. Everything is persisted on disk.
- **Unified Server Topology**: Standardized service layers (Global Daemon vs. Local Review) with port configuration via `.env`.
- **Dependency Graph Engine**: Automated task resolution. The framework understands that a video segment depends on a specific approved frame.
- **Pure Markdown Spec**: 100% human-readable shot definitions. No more complex YAML arrays.

---

## 📜 Documentation / 文档目录

| Topic / 主题                     | English                                    | 中文                                       |
| :------------------------------- | :----------------------------------------- | :----------------------------------------- |
| **Overview** / 项目全景          | [Link](./docs/en/01-OVERVIEW.md)           | [链接](./docs/cn/01-OVERVIEW.md)           |
| **Workflow** / 工作流程          | [Link](./docs/en/02-WORKFLOW.md)           | [链接](./docs/cn/02-WORKFLOW.md)           |
| **CLI Reference** / 命令参考     | [Link](./docs/en/03-CLI-REFERENCE.md)      | [链接](./docs/cn/03-CLI-REFERENCE.md)      |
| **Agents & Skills** / 角色与技能 | [Link](./docs/en/04-AGENTS-AND-SKILLS.md)  | [链接](./docs/cn/04-AGENTS-AND-SKILLS.md)  |
| **Spec Standards** / 规范标准    | [Link](./docs/en/05-DOCUMENT-STANDARDS.md) | [链接](./docs/cn/05-DOCUMENT-STANDARDS.md) |
| **Server Arch** / 服务架构       | [Link](./docs/Server-Architecture.md)      | [链接](./docs/Server-Architecture.md)      |

---

> *OpsV 0.6.0 | 2026-04-17*

---

## 🆕 Release Notes / 更新说明

## 🚀 架构革命：Spooler Queue 物理排队论 (v0.6.0)

### 1. Dispatcher 灭亡与意图解耦
- **三步式管线**: `generate` (编译意图) → `queue compile` (原子拆分) → `queue run` (消费执行)。
- **物理状态机**: 任务以 `.json` 文件形式在 `pending`, `processing`, `completed`, `failed` 目录流转，彻底解决崩溃丢任务的问题。
- **单线程安全**: 每个 Provider 顺序消费，杜绝 API 并发冲突，支持 Ctrl+C 断点恢复。

### 2. 服务管理标准化 (Server Topology)
- **.env 驱动**: 根目录 `.env` 加入 `OPSV_DAEMON_PORT` 与 `OPSV_REVIEW_PORT` 配置，全面解耦硬编码端口。
- **服务分层**: 明确 Global Daemon (跨项目连接器) 与 Local Review (项目 Review UI) 的职责边界。

### 3. 项目初始化自动化 (Zero-Config Init)
- **动态运行时创建**: `opsv init` 现在会自动创建 `.opsv/` 和 `.opsv-queue/` 目录。
- **内建 Git 策略**: 自动生成防御性 `.gitignore`，确保运行时状态文件不污染仓库。

### 4. 命令集精简与优化
- **删除废弃指令**: 移除 `gen-image` 与 `gen-video`，统一并入 `queue` 指令集。
- **鲁棒性增强**: `queue run` 命令的 Provider 名称支持大小写模糊匹配。
- **Generate 纯净化**: `generate` 指令回归“纯编译”本质，不再主动拉起网络服务。

---

## 🚀 历史更新 (v0.5.16)
- **SiliconFlow 图像接入**: 支持 Qwen 多模态文生图与指令式编辑。
- **混合驱动架构 (Hybrid Provider)**: 根据模型语义自动切换端点。
- **指令重绘工作流**: 智能图像注入 `frame_ref`。

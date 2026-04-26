# OpenSpec-Video (OpsV) 0.7.0 (Circle Queue Era)

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Narrative Markdown into industrial-grade video & image generation tasks via physical state machines.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional, **Spec-First** video production pipeline. v0.7.0 introduces the **Circle Queue** architecture with explicit provider/model aliasing and Seedance 2.0 multimodal API support.

OpsV 是一套专业的、**规范驱动 (Spec-First)** 的视频制作管线。v0.7.0 引入 **Circle Queue (环状队列)** 架构，支持 `--model` 别名系统，并完整适配火山引擎 Seedance 2.0 Content Generation API 的多模态输入能力。

---

## 🚀 Quick Start / 快速开始

```bash
# Install / 安装
npm install -g videospec

# Initialize Project / 项目初始化
opsv init my-project

# 1. Generate image assets / 图像资产生成
opsv imagen                          # 自动推断当前开放的 Circle
opsv queue compile opsv-queue/zerocircle_1/imagen_jobs.json --model volc.sd2
opsv queue run --model volc.sd2

# 2. Review & Approve / 审阅批准
opsv review
opsv circle status                   # Approve 后必须刷新状态

# 3. Generate video assets / 视频资产生成（上游 approved 后自动允许）
opsv animate                         # 自动推断末端 Circle
opsv queue compile opsv-queue/endcircle_1/video_jobs.json --model volc.seedance2
opsv queue run --model volc.seedance2
```

---

## 🏗️ Core Architecture: Circle Queue (v0.7.0)

In v0.7.0, tasks are organized into **Circles** (dependency layers) and compiled into provider-specific batches under `opsv-queue/<circle>/<provider>/queue_{N}/`:

在 v0.7.0 中，任务按 **Circle（依赖层次环）** 组织，编译后落在 `opsv-queue/<circle>/<provider>/queue_{N}/` 下：

1. **compile**: Reads `jobs.json` and generates atomic `{taskId}.json` payloads.
2. **run**: Scans `.json` task files, skips already completed results, executes sequentially.
3. **retry**: Re-runs failed tasks with `--retry` flag.

Each batch contains only task JSONs and a `compile.log` — no `queue.json` manifest, preventing accidental execution of metadata files.

---

## 🛠️ Key Features / 核心特性

- **Circle Queue**: Dependency-layered batch execution with automatic topological sorting.
- **pending_sync 状态**: Approve 回写后进入 pending_sync，Agent 对齐字段后方可 approved，阻断下游 Circle。
- **Approve 回写策略**: 只覆盖 `prompt_en` + 同步 Design References + review 指向 task JSON。
- **Model Aliasing**: Use `--model volc.sd2` instead of `--model volcengine.seedance-2.0` via `api_config.yaml` aliases.
- **Seedance 2.0 Ready**: Full support for multimodal content arrays (text + image + video + audio references).
- **Intent-Execution Decoupling**: `imagen`/`animate` generates intent; `queue compile/run` handles API execution.
- **Physical State Machine**: Task state is file existence — no in-memory Dispatcher, crash-safe.
- **Dependency Graph Engine**: Automated task resolution across Circles with `@FRAME` pointer support.

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
| **Code Review** / 审查报告       | —                                          | [链接](./docs/OPSV_v0.6.0_CODE_REVIEW_COMPLETION.md) |

---

> *OpsV 0.7.0 | 2026-04-26*

---

## 🆕 Release Notes / 更新说明

### v0.7.0 — Circle 多图管理 & Shot 文件系统

- **多图管理**: `DependencyGraph` 支持 `saveGraph`/`loadGraph`/`activateGraph`/`getActiveGraph`，可管理多个项目图（如 `episode_2_graph.json`）
- **`opsv circle create`**: 新增 `--dir <path>` 和 `--skip-middle-circle`，支持多剧集和简化圈层模式
- **`opsv circle` 合并**: status + manifest 合并，manifest 写入 `.opsv/videospec_manifest.json`
- **统一目录创建**: `ensureCircleDirectories()` — 文件列表变化才新建目录，imagen/animate/comfy 共享同一逻辑
- **圈层隔离检查**: imagen/animate 指定圈层时检查前置圈层 approved 状态 + 文件归属，不匹配则报错
- **目录路径重命名**: `zerocircle_1` → `videospec_zerocircle_1`，`.opsv/dependency-graph.json` → `.opsv/videospec_graph.json`，`opsv-queue/circle_manifest.json` → `.opsv/videospec_manifest.json`
- **Shot 文件**: `shot_*.md` 作为独立数据源，`opsv script` 聚合生成 Script.md（来源标注）
- **Shotlist.md 末环**: Shotlist.md 不进依赖图，独立处理
- **Comfy 类型**: `opsv comfy compile` 输出任务描述 JSON（inputs/outputs），Agent 从技能目录加载 workflow 后注入变量
- **`--skip-middle-circle`**: 所有非 shotlist 资产归入 zerocircle，shotlist 单独进 endcircle，中间层消失

### v0.6.1 — Spooler Queue 物理排队论

- **三步式管线**: `generate` → `queue compile` → `queue run`
- **物理状态机**: 任务以 `.json` 文件在目录间流转，崩溃不丢任务
- **原子提取**: `fs.rename` 保证多进程安全
- **服务管理标准化**: `.env` 驱动端口配置

---

## 🚀 历史更新 (v0.5.16)
- **SiliconFlow 全模型支持**: Qwen 文生图 (`qwenimg`)、图像编辑 (`qwenedit`)、Wan2.2 文生视频 (`want2v`)、Wan2.2 图生视频 (`wani2v`)。
- **混合驱动架构 (Hybrid Provider)**: 根据模型语义自动切换端点。
- **指令重绘工作流**: 智能图像注入 `frame_ref`。

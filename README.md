# OpenSpec-Video (OpsV) 0.6.4 (Circle Queue Era)

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Narrative Markdown into industrial-grade video & image generation tasks via physical state machines.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional, **Spec-First** video production pipeline. v0.6.4 introduces the **Circle Queue** architecture with explicit provider/model aliasing and Seedance 2.0 multimodal API support.

OpsV 是一套专业的、**规范驱动 (Spec-First)** 的视频制作管线。v0.6.4 引入 **Circle Queue (环状队列)** 架构，支持 `--model` 别名系统，并完整适配火山引擎 Seedance 2.0 Content Generation API 的多模态输入能力。

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

## 🏗️ Core Architecture: Circle Queue (v0.6.4)

In v0.6.4, tasks are organized into **Circles** (dependency layers) and compiled into provider-specific batches under `opsv-queue/<circle>/<provider>/queue_{N}/`:

在 v0.6.4 中，任务按 **Circle（依赖层次环）** 组织，编译后落在 `opsv-queue/<circle>/<provider>/queue_{N}/` 下：

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

> *OpsV 0.6.4 | 2026-04-23*

---

## 🆕 Release Notes / 更新说明

### v0.6.4 — Circle Queue & Seedance 2.0

- **Circle Queue 架构**: 任务按依赖层次分 Circle 存储，`opsv-queue/<circle>/<provider>/queue_{N}/`。
- **`opsv circle` 命令**: 正式注册 `opsv circle status`（状态探针）和 `opsv circle manifest`（快照固化）。
- **Circle 自动推断**: `imagen` / `animate` 未指定 `--circle` 时自动推断当前开放的 Circle（未全部 approved 的最上游 Circle）。
- **上游 Circle 检查**: `imagen` / `animate` 执行前自动检测上游 Circle 是否全部 approved，未 approved 时阻止执行（可 `--skip-circle-check` 强制跳过）。
- **`--skip-approved` 默认开启**: `imagen` 默认跳过已有 approved 参考图的资产，避免重复生成。需重新生成时用 `--no-skip-approved`。
- **Approved References ↔ status 一致性校验**: `opsv validate` 自动检查 `status: approved` 的文档是否包含有效的 `## Approved References`。
- **`--model` 选项**: 替换旧的 `--provider.model` 伪选项语法，支持 `provider.model` 和别名两种格式。
- **别名系统**: `api_config.yaml` 每个模型支持 `aliases: []`，如 `seedance2` → `volcengine.seedance-2.0`。
- **模型名含点号支持**: 完整支持 `wan2.2-i2v`、`qwen-image-edit-2509` 等带点号的模型名。
- **Seedance 2.0 适配**: 完整支持 Content Generation API 的 `content[]` 多模态数组（text/image/video/audio）。
- **SiliconFlow 增强**: 自动本地文件转 Base64 Data URI 上传；支持多种响应格式解析（`data.url` / `data.images[0].url` / `data.data[0].url`）。
- **Edit 模型字段保留**: `qwen-image-edit-2509` 等编辑模型的 `edit_image` / `mask_image` 字段在编译时正确保留。
- **本地文件 Base64 直传**: compile 保留相对路径，run 时 Provider 自动将本地图片/audio 转为 `data:image/png;base64,...` 发送给 API（视频不支持 Base64，仍为 URL）。
- **API 返回尾帧**: Seedance 2.0 创建任务时传 `return_last_frame: true`，轮询成功后自动下载视频 + 首帧(cover) + 尾帧到 batch 目录，替代 ffmpeg 提取。
- **@FRAME 引用解析**: shotlist.md 中 `first_frame: "@FRAME:shot_01_last"` 或 `@shot_01:last` 自动解析为同目录相对路径 `shot_01_last.png`。
- **移除 queue.json**: compile 不再生成 `queue.json`，避免 run 时误执行元数据文件。
- **资产 URL 全记录**: 所有 API 返回的视频/图片 URL 记入 JSONL log（`type: asset_url`），便于审计和二次引用。
- **`pending_sync` 状态**: 新增 `pending_sync` 枚举值，Approve 回写后 status 自动设为 `pending_sync`（仅覆盖 `prompt_en`），Agent 对齐 `visual_detailed`/`visual_brief`/`refs` 后手动改为 `approved`。`pending_sync` 资产阻断下游 Circle 执行。
- **Approve 回写策略**: Approve 时 4 个动作：(1) 覆盖 `prompt_en` 为实际 prompt；(2) 从 task JSON 同步 `## Design References`；(3) `reviews[]` 追加指向 task JSON 的条目；(4) `status → pending_sync`。无 task JSON 时 fallback 为 `approved`。
- **validate 新增规则**: `pending_sync` 字段缺失提醒 + `approved` 时 `prompt_en`↔`visual_detailed` 一致性检查。

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

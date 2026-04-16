# OpenSpec-Video (OpsV) 0.5.15 (Industrial-Class Evolution)
 
Professional, **Spec-First** video production pipeline.

# OpenSpec-Video (OpsV) 0.5.0

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Pure Markdown narratives into automated video & image generation tasks for AI models.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional, **Spec-First** video production pipeline. It allows creators to write stories and design shots using structured Markdown. The CLI tool uses a **Dependency Graph** to "compile" these specifications into executable job queues for models like **Vidu, Kling, Minimax, and SiliconFlow**.

OpsV 是一套专业的、**规范驱动 (Spec-First)** 的视频制作管线。它允许创作者使用纯粹的 Markdown 编写故事和设计分镜，CLI 工具通过**依赖图 (Dependency Graph)** 将这些规范“编译”为可执行的任务队列，驱动 **Vidu, Kling, Minimax, SiliconFlow** 等模型进行生成。

---

## 🚀 Quick Start / 快速开始

```bash
# Install
npm install -g videospec

# Initialize Project
opsv init my-project

# (Optional) Install Creative Addon Pack / 安装创作插件包
opsv addons install ./addons/comic-drama-v0.5.zip

# Standard Workflow
opsv generate        # Compile Spec -> Jobs (Markdown parsing)
opsv gen-image       # Render Images
opsv review          # Web-based Review & Feedback UI
opsv animate         # Compile Animation -> Video Jobs (@FRAME inheritance)
opsv gen-video       # Render Videos
```

---

## 🛠️ Key Features / 核心特性

- **Pure Markdown Spec**: 100% human-readable shot definitions. No more YAML arrays in `Script.md`.
- **Addon Ecosystem**: Decoupled creative skills. Swap between "Mini-Drama", "Music Video", or "Commercial" brain packs using `opsv addons`.
- **Dependency Graph Engine**: Automated task resolution. The framework understands that a video segment depends on a specific approved frame.
- **Web Review UI**: A modern Express-based interface for visual asset selection and one-click feedback.
- **Motion-Static Separation**: Decouples visual appearance from animation instructions for better concept stability.

---

## 📜 Documentation / 文档目录

| Topic / 主题                     | English                                    | 中文                                       |
| :------------------------------- | :----------------------------------------- | :----------------------------------------- |
| **Overview** / 项目全景          | [Link](./docs/en/01-OVERVIEW.md)           | [链接](./docs/cn/01-OVERVIEW.md)           |
| **Workflow** / 工作流程          | [Link](./docs/en/02-WORKFLOW.md)           | [链接](./docs/cn/02-WORKFLOW.md)           |
| **CLI Reference** / 命令参考     | [Link](./docs/en/03-CLI-REFERENCE.md)      | [链接](./docs/cn/03-CLI-REFERENCE.md)      |
| **Agents & Skills** / 角色与技能 | [Link](./docs/en/04-AGENTS-AND-SKILLS.md)  | [链接](./docs/cn/04-AGENTS-AND-SKILLS.md)  |
| **Spec Standards** / 规范标准    | [Link](./docs/en/05-DOCUMENT-STANDARDS.md) | [链接](./docs/cn/05-DOCUMENT-STANDARDS.md) |

---

> *OpsV 0.5.15 | 2026-04-16*

---

## 🆕 Release Notes / 更新说明

## 🚀 工业级分集管线与动态悟道 (v0.5.15)
### 1. 分集工业化 (Multi-Episode Support)
- **文件名探测**: 解除 `Script.md` 唯一限制，管线现支持探测 `/shots/` 目录下所有 `type: shot-design` 的 Markdown 剧本（如 `ep01.md`, `ep02.md`）。
- **智能跳过**: `opsv generate --skip-approved` 全面对齐分镜级状态机。已 `approved` 的剧本分镜将自动在编译阶段被过滤。
- **Shotlist 动态识别**: 支持 `*.shotlist.md` 命名，自动识别并跳过已生成的生产辅助文档。

### 2. 悟道本能 (Enlightenment Sync)
- **动态进化**: 引入 `opsv-enlightenment` 技能。Agent 具备实时拉取外部官方 Repo（如 MiniMax-AI/skills）并内化其指令（如 `mmx music`）的能力。
- **求知本能**: 打破静态 Addon 依赖，实现“按需检索-即时学习-实战内化”的闭环。

### 3. 火山引擎 API 深度重构
- **方舟 V3 全力支持**: SeaDream (CV-S) 升级至 5.0 Lite 端点；Seedance 1.5 修复响应穿透解析。
- **豆包视频 V2 首发**: 增加 `seedance-2.0-fast` 模型支持，默认使用 V2 Fast 引擎，支持多模态音视频引用。
- **鲁棒性防御**: 统一对齐 V3 协议返回体，修复了旧版本在解析嵌套 `data.data` 时的逻辑崩坏。

## 🚀 历史更新 (v0.5.14)

## 🚀 历史更新 (v0.5.13)

### 显式账本图纸 (Explicit Ledger Paradigm)
- **绝对透明**：视频管线摒弃黑盒运行时拼接，所有大模型依赖的视觉设定与运镜动作（`Video Prompt`）必须由 Agent 在撰写 `Shotlist.md` 时显式组合并写明。
- **状态驱动混写**：`Shotlist.md` 下每一镜引入局部 `YAML` 块进行状态驱动追踪（`pending | completed`），完美保留外部的 Markdown 文本供人类随性批注。
- **双轨审查环 (Dual Review)**：在原本的图像审查之外，正式升级基于 `Shotlist.md` 的视频审查，`opsv review` 能自动捕捉生成的关联视频并写回文档供导演验收。

## 🚀 历史更新 (v0.5.12)
- **Annotative Referencing**: Introduced support for `(@id)` bracketed syntax, allowing IDs to serve as semantic annotations without disrupting narrative flow.
- **Shot-Local References**: Enabled direct embedding of Markdown images within `Script.md` shots. These images are automatically归集 as reference images for the specific job, eliminating the need for global asset modeling for one-off visual cues.
- **Improved Parsing**: Enhanced `RefResolver` and `JobGenerator` to robustly handle both annotative and embedded reference types.

### 0.5.11 - Narrative Grammar Standardization (2026-04-13)
- **Natural Language Priority**: Updated `Story` and `Script` templates to enforce complete, human-readable grammar.
- **Semantic Reference Embedding**: Defined the `@id` usage as a semantic anchor embedded within natural sentences, rather than as a standalone bracketed tag.
- **Execution-Ready Literacy**: Ensured that the text remains logical and descriptive before and after automated reference replacement.

### 0.5.10 - Reference Logic Standardization (2026-04-13)
- **Unified @ Syntax**: Standardized the use of `@` prefix across both Markdown body and YAML `refs`.
- **Granular Referencing**: Added support for `@id:variant` syntax in `refs` to point to specific approved images while maintaining document-level safety.
- **Dependency Intelligence**: Enhanced the `DependencyGraph` to automatically resolve complex reference strings back to their core document dependencies.

### 0.5.9 - ID-Naming De-duplication (2026-04-13)
- **Unified ID Logic**: Removed the redundant `name` field from YAML headers. Asset IDs are now strictly mapped from file names (e.g., `@broken_sword.md` -> `broken_sword`).
- **Template Cleanup**: Streamlined all element and scene templates for a minimal, non-redundant metadata structure.
- **Architectural Purity**: Enforced a single source of truth for IDs to prevent metadata drift and naming conflicts.

### 0.5.8 - Architectural Robustness (2026-04-13)
- **Block-Style YAML**: Switched all long-text fields to Folded Block Style (`>`) to eliminate character escape issues (e.g., quotations in prompts).
- **Template Standardization**: Updated all element, scene, story, and project templates to ensure parsing stability.
- **Improved Docs**: Clarified YAML generation rules and block syntax usage.

### 0.5.7 - Visual Semantic Standardization (2026-04-13)
- **Visual-First Fields**: Renamed YAML fields to `visual_brief` and `visual_detailed` to strictly enforce visual-only metadata.
- **SSOT 2.0 Workflow**: Established a deterministic logic: Markdown Body Explanation -> YAML Generation -> Review Correction.
- **Schema Validation**: Updated `FrontmatterSchema` and `JobGenerator` to support new semantic labels.
- **Templates**: Standardized `element_template` and `example-element` with v0.5.7 specs.

### 0.5.3 - WebUI Distribution & Agent Workflow (2026-04-12)
- **WebUI**: Fixed a critical bug where Review UI assets were missing in the global npm package. Added automatic asset copying to build pipeline.
- **Server**: Enhanced `ReviewServer` with dynamic static resource path detection and robust error reporting.
- **Agent Roles**: Updated `AGENTS.md` with strict QA gatekeeping, mandatory `opsv parse` validation after writing, and flexible Markdown header support for creative freedom.
- **CLI**: Optimized `opsv review` startup reliability across different OS environments.

### 0.5.2 - Security & Provider Architecture Stability (2026-04-12)
- **Architecture**: Promoted `ImageProvider` interface. Unified all generation logic into a single `generateAndDownload` contract.
- **Security**: Fixed OS command injection vulnerabilities in CLI parameters.
- **Stability**: Fixed a critical async bug in `DependencyGraph` where task nodes were incorrectly marked as completed.
- **Refactoring**: Eliminated duplicate logic across `AssetManager` and `JobGenerator` using `FrontmatterParser`.

### 0.5.0 - Spec-First & Addons Evolution (2026-04-10)
- **Architecture**: Migrated to a **Dependency Graph** driven engine. Non-linear task resolution.
- **Pure Markdown**: Fully deprecated YAML shot lists. Use `## Shot NN` Markdown headers for shot definitions.
- **Addon System**: Introduced `opsv addons` command to install zip-based creative skill packs.
- **Review UI**: Replaced CLI review with a professional **Web Review UI** (Express + WebSocket).

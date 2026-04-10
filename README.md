# OpenSpec-Video (OpsV) 0.5.0

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Pure Markdown narratives into automated video & image generation tasks for AI models.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional, **Spec-First** video production pipeline. It allows creators to write stories and design shots using structured Markdown, entirely eliminating legacy YAML shot arrays. The CLI tool uses a **Dependency Graph** to "compile" these specifications into executable job queues for models like **Vidu, Kling, Minimax, and SiliconFlow**.

OpsV 是一套专业的、**规范驱动 (Spec-First)** 的视频制作管线。它允许创作者使用纯粹的 Markdown 编写故事和设计分镜，彻底废弃了繁琐的 YAML 数组。CLI 工具通过**依赖图 (Dependency Graph)** 将这些规范“编译”为可执行的任务队列，驱动 **Vidu, Kling, Minimax, SiliconFlow** 等模型进行生成。

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

| Topic / 主题 | English | 中文 |
| :--- | :--- | :--- |
| **Overview** / 项目全景 | [Link](./docs/en/01-OVERVIEW.md) | [链接](./docs/cn/01-OVERVIEW.md) |
| **Workflow** / 工作流程 | [Link](./docs/en/02-WORKFLOW.md) | [链接](./docs/cn/02-WORKFLOW.md) |
| **CLI Reference** / 命令参考 | [Link](./docs/en/03-CLI-REFERENCE.md) | [链接](./docs/cn/03-CLI-REFERENCE.md) |
| **Agents & Skills** / 角色与技能 | [Link](./docs/en/04-AGENTS-AND-SKILLS.md) | [链接](./docs/cn/04-AGENTS-AND-SKILLS.md) |
| **Spec Standards** / 规范标准 | [Link](./docs/en/05-DOCUMENT-STANDARDS.md) | [链接](./docs/cn/05-DOCUMENT-STANDARDS.md) |

---

> *OpsV 0.5.0 | 2026-04-10*

---

## 🆕 Release Notes / 更新说明 (v0.5.0)

### 0.5.0 - Spec-First & Addons Evolution (2026-04-10)
- **Architecture**: Migrated to a **Dependency Graph** driven engine. Non-linear task resolution.
- **Pure Markdown**: Fully deprecated YAML shot lists. Use `## Shot NN` Markdown headers for shot definitions.
- **Addons System**: Introduced `opsv addons` command to install zip-based creative skill packs.
- **Comic-Drama Pack**: Released the first official creative addon focusing on industrial mini-drama SOPs.
- **Review UI**: Replaced CLI review with a professional **Web Review UI** (Express + WebSocket).
- **Skill Decoupling**: Separated Normative skills (OpsV rules) from Creative skills (Drama/MV brains).
- **Agent Evolution**: Unified all Agent profiles (`Architect.md`, `AssetDesigner.md`, etc.) for 0.5 compliance.

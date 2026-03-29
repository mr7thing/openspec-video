# OpenSpec-Video (OpsV) 0.4.3

[English](./docs/en/01-OVERVIEW.md) | [中文说明](./docs/cn/01-OVERVIEW.md)

> **Spec-as-Code** framework that compiles Markdown/YAML narratives into automated video & image generation tasks for AI models.

---

## 🌍 Language / 语言
- **English**: [Documentation Index](./docs/en/01-OVERVIEW.md)
- **中文**: [文档入口](./docs/cn/01-OVERVIEW.md)

---

## 💡 What is OpsV? / 什么是 OpsV?

OpsV is a professional video production pipeline. It allows creators to write stories, define assets, and design shots using structured Markdown. The CLI tool "compiles" these specifications into executable job queues for models like **Seedance, SeaDream, Minimax, and SiliconFlow**.

OpsV 是一套专业的视频制作管线。它允许创作者使用结构化的 Markdown 编写故事、定义资产和设计分镜。CLI 工具将这些规范“编译”为可执行的任务队列，驱动 **Seedance, SeaDream, Minimax, SiliconFlow** 等模型进行生成。

---

## 🚀 Quick Start / 快速开始

```bash
# Install
npm install -g videospec

# Initialize Project
opsv init my-project

# Standard Workflow
opsv generate        # Compile Spec -> Jobs
opsv gen-image       # Render Images
opsv review          # Review & Feedback
opsv animate         # Compile Animation -> Video Jobs
opsv gen-video       # Render Videos
```

---

## 🛠️ Key Features / 核心特性

- **Parallel Universe Sandbox**: Supports `--model all` to run multiple models concurrently, results are isolated by engine name.
- **Asset-First Architecture**: Characters, scenes, and props are defined as independent entities with consistent references.
- **Motion-Static Separation**: Decouples visual appearance from animation instructions for better concept stability.
- **Agentic Workflow**: Designed to work seamlessly with AI Agents (Architect, Screenwriter, AssetDesigner, etc.).

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

> *"Code is for humans to read, and only incidentally for machines to execute."*
> *OpsV 0.4.3 | 2026-03-28*

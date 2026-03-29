# OpenSpec-Video (OpsV) 0.4.6

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

> *OpsV 0.4.6 | 2026-03-29*

---

## 🆕 Release Notes / 更新说明 (v0.4.6)

### 0.4.6 - Global Logic Simplification (2026-03-29)
- **Deprecation**: Officially removed `has_image` binary switch from v0.4.x assets (Characters/Scenes/Props).
- **Auto-Derivation**: Implemented `d-ref / a-ref` automated status detection in Markdown body.
- **Documentation Restoration**: Re-synchronized v0.4.6 documentation with clean v0.3.2 legacy schemas.
- **System Prompt Evolution**: Updated `GEMINI.md` and `AGENTS.md` to reflect the latest "Asset-First" logic.

### 0.4.5 - Digital Archaeology & Recovery (2026-03-29)
- **Document Restoration**: Restored corrupted Agent Skill reference files from Git history (v0.2/v0.3 reconciliation).
- **Encoding Integrity**: Enforced UTF-8 encoding across all template assets to prevent character corruption.
- **Skill Evolution**: Renamed `opsv-director` to `opsv-cli-agent` to emphasize non-interactive CLI automation.

### 0.4.4 - Agentic Automation (2026-03-29)
- **Non-Interactive Init**: Added `--gemini`, `--opencode`, and `--trae` flags to `opsv init` for silent deployment.
- **Internationalization (i18n)**: Achieved 1:1 parity between English and Chinese documentation across all agents and skills.
- **Director Role**: Introduced the `opsv-director` (now `opsv-cli-agent`) skill for full-pipeline orchestration.


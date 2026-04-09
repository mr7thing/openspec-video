---
name: opsv-developer-guide
description: OpenSpec-Video (OpsV) 开发与工作流向导。用于指引 Agent 或人类开发者如何调用命令行跑通自动化测试。
---

# OpsV 开发者工作流指南 (Developer Guide)

本技能汇编了最新的 v0.5 CLI 命令以及文档语法规范。当你卡在架构机制、或者不知道为什么解析失败时，请优先参考这里。

## 工作流主干命令 (CLI)

1. **依赖图审计 (`opsv deps`)**
   生成并分析 OpsV 项目的依赖拓扑图。
   由于 v0.5 是由依赖图（Dependency Graph）驱动工作流的，任何无效引用、不存在的图片指针都会导致拓扑遍历失败卡死。

2. **引擎装配生成 (`opsv generate`)**
   当所有底层材料 (`.md`) 准备完毕，`generate` 内核会将 Markdown 抽取拼装为可供渲染引擎调用的 `Job.json` 序列集。

3. **静态审核台 (`opsv review`)**
   提供一个 Express Server 网页交互台，供 QA 选择满意的生成图回写给 Markdown `[Approved References]`。

具体参数字典见 `references/03-CLI-REFERENCE.md`。

## 文件标准检查器

如需进行底层语法排坑，随时查阅 `references/05-DOCUMENT-STANDARDS.md` 了解 v0.5 去除 YAML 列表的具体实施原因。

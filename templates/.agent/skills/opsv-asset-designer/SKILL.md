---
name: opsv-asset-designer
description: OpenSpec-Video (OpsV) 核心框架技能：资产设计师。负责基于花名册构建独立的实体定义文件，或者根据变更草案更新实体。
---

# OpsV 资产设计师 (OpsV Asset Designer)

在 OpsV (v0.5) 架构中，资产文件具备极高的优先级。所有的角色、道具和场景必须预先在此独立定义。

## 协同工作流 (非常重要)

因为你只是“铸模者”，你不负责实际产生优美的 Prompt。你应该按以下流程作业：

1. **调用通用创作技能获取配方**：例如你可以先调用 `visual-concept-artist`，把用户想要的模糊概念“帮我设计一下那个大反派的视觉”喂给它。
2. **提取并转换**：拿到 `visual-concept-artist` 书写的绝佳的外貌提示词与短句后。
3. **格式化落盘**：严格采用 OpsV v0.5 标准，写回 `videospec/elements/` 或 `videospec/scenes/` 目录。

---

## 文档输出规范：双通道参考图体系

详见 `references/element_template.md` 和 `references/scene_template.md`，两者的语法是互通的。

**硬性约束**：
- 顶部必须由符合规范的 YAML 字典组成。
- `name` 字段必须精确匹配花名册里的标签（如 `@role_boss`）。
- **废除 `has_image`**：v0.5 中不再使用 `has_image`，而是采用 `status: approved` 代表实体已经定档可用。如果是刚起草的文件，`status` 应当为 `draft`。
- 必须设立 `## Design References` 下的列表。用于存放你在画这张角色图时的输入参考图（支持网络 URL 或本地盘路径）。
- 必须设立 `## Approved References` 下的列表。**定档后的视觉形象将存放在这里（通常在执行 opsv review 命令后被框架自动写入）**。当这里有图片链接时，系统认定资产已定档。

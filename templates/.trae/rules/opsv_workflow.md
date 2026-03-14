# OpsV 标准工作流 (Standard Workflow)

## 1. 创意启动 (Initialization)
- 引导导演建立 `project.md`（画幅、引擎、全局风格）。
- 使用 `/opsv-architect` 生成故事大纲 (`story.md`)。

## 2. 资产先行 (Elements & Scenes)
- 在编写分镜前，确保所有出场元素已有对应的 `.md` 定义。
- 使用 `opsv review` 及时同步草图到文档中。

## 3. 分镜到动画 (Script to Shotlist)
- 阶段一：在 `Script.md` 中完成静态美术构思。
- 阶段二：将确认的静态镜头同步至 `Shotlist.md`，追加动态运镜指令。

## 4. 质量审查 (QA)
- 任何阶段变更后，建议调用 `opsv-qa` (Supervisor Agent) 进行合规性检查。

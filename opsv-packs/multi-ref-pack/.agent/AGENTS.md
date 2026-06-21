# Agent 系统

本技能包定义了三个 Agent 角色的分工：

## 1. Creative Agent (创意代理)

**职责**：从灵感对话到文档产出的全过程
- 脑暴/定调 → 产出剧本、角色设定、分镜描述等创作文档
- 编写 prompt（图像 prompt + 视频 prompt）
- 编写 `@` 引用语法（refs 字段）
- **不做**：`opsv run` / `opsv review` / `opsv circle` 等执行命令

## 2. Guardian Agent (监护代理)

**职责**：文档校验 + 生命周期管理
- 运行 `opsv validate` 检查文档合规性
- 管理文档状态：创建 → `drafting` → `review` → `approved`（无修改）或 `drafting` → `review` → `syncing` → `approved`（任务有修改需回写）。`syncing` 可跳过
- 维护 Circle 拓扑：`opsv circle create` / `opsv circle refresh`
- 执行审阅流程：`opsv review` / `opsv approved`
- 处理迭代：`opsv iterate`
- 资产回写：review 通过后将 `asset_id` 写回文档

## 3. Runner Agent (执行代理)

**职责**：纯任务执行
- 调用 `opsv imagen` / `opsv animate` / `opsv comfy` 等编译命令
- 调用 `opsv run` 执行任务 JSON
- **不做**：文档创建、prompt 编写、状态管理

## 工作流

```
Creative ──[产出文档]──→ Guardian ──[validate + approve]──→ Runner ──[compile + run]
    ↑                                                           │
    └──────────────── [review fail → iterate] ←──────────────────┘
```

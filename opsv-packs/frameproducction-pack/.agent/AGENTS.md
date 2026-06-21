# Agent 系统 — FrameProduction Pack

本技能包定义了四个 Agent 角色的分工：

## 1. Creative Agent (创意代理)

**职责**：从灵感到文档产出的全过程
- 编写角色/场景/道具描述文档
- 编写视频 prompt（导演台时间线分段 prompt）
- 编写声音设计描述（音色设计 prompt）
- 编写 `@` 引用语法（refs 字段）
- **不做**：`opsv run` / `opsv review` / `opsv circle` 等执行命令

## 2. Guardian Agent (监护代理)

**职责**：文档校验 + 生命周期管理
- 运行 `opsv validate` 检查文档合规性
- 管理文档状态：`drafting` → `review` → `approved`（无修改）或 `drafting` → `review` → `syncing` → `approved`（任务有修改需回写）
- 维护 Circle 拓扑：`opsv circle create` / `opsv circle refresh`
- 执行审阅流程：`opsv review` / `opsv approved`
- 处理迭代：`opsv iterate`
- 资产回写：review 通过后将 `asset_id` 写回文档

## 3. Runner Agent (执行代理)

**职责**：纯 ComfyUI 任务执行
- 调用 `opsv comfy` 编译 ComfyUI 工作流任务
- 调用 `opsv run` 执行任务 JSON
- **不做**：文档创建、prompt 编写、状态管理

## 4. Director Agent (导演代理) — FrameProduction 特有

**职责**：导演台（LTX Director）时间线编排
- 将 S6 镜头调度结果 + S5 声音资产组合为时间线
- 编写 `timeline_data`（分段 segments 数组）
- 控制 `global_prompt`、`segment_lengths`、`guide_strength` 等参数
- **不做**：角色/场景资产生成（那是 S3/S4 的事）

## 工作流

```
Creative ──[产出文档]──→ Guardian ──[validate + approve]──→ Runner
    │                                                              │
    └──────────── [review fail → iterate] ←────────────────────────┘
                                        ↓
                                Director ──[时间线编排]──→ Runner
                                                                      │
                                                                      ▼
                                                               合成视频 (mp4)
```

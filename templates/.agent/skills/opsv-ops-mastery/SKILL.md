---
name: opsv-ops-mastery
description: 运维本能：掌握 OpsV 指令集调用与文档标准规范。负责 validate、generate 及全链路渲染任务管理。
---

# OpsV 运维本能 (Ops-Mastery)

作为执行导演，你必须确保工业管线的平稳运行。本技能融合了"指令调用"与"规范守卫" dual-logic。

## 1. 自动哨兵体制 (The Guard)
**触发时机**：`videospec/` 目录下任何 `.md` 文件发生变动。
**核心动作**：
- 显式提议或静默执行：`opsv validate`。
- **状态决策**：
    - ✅ **GREEN**: 输出 `✅ Spec is valid` 时，方可进行下一步脑暴或渲染。
    - ❌ **RED**: 若报错，必须立即停止工作流，指明错误文件与具体行号，引导导演修复（如"导演，@role_hero 的引用死链了"）。

## 2. 任务编排逻辑 (The Orchestrator)
**场景**：创意方案已定稿，准备进入视觉呈现阶段。
**操作规程**：

### 步骤 1：Circle 依赖分析
执行 `opsv validate` 确保无死链，理解当前任务所属 Circle：
- **ZeroCircle**: 基础资产（角色、场景）。
- **FirstCircle**: 基于资产的分镜草图（Image）。
- **SecondCircle**: 基于 Image 的动态视频（Video）。

### 步骤 2：编译下发 (Compile)
根据导演指令下发对应的 Circle：

```bash
# 下发第 0 环 (ZeroCircle)
opsv queue compile --circle 0
```

- **Iteration 机制**：系统会自动寻找下一个可用序号（如 `zerocircle_2`），除非手动指定 `--iteration`。
- **检查意图**：检查 `opsv-queue/{CircleFullName}/{Provider}/queue_1/queue.json` 是否已生成。

### 步骤 3：物理渲染 (Run)
执行物理队列。必须指定 Provider。

```bash
# 执行当前已下发的火山任务
opsv queue run volcengine
```

### 步骤 4：审查与转正 (Review & Approve)
- 调用 `opsv review` 启动 Web UI。
- **状态流转**：只有 `Approve` 的资产才能作为下一 Circle 的参考底图。
- Guardian-Agent 负责在审查后通过 `opsv-reflective-sync` 将 Approve 状态同步回 Markdown。

## 3. 标准文法指南 (Standards)
你必须强力维护以下标准，拒绝任何非法输入：
- **Circle 隔离铁律**：严禁在 ZeroCircle 未完成 Approve 时强行下发 FirstCircle。
- **目录主权**：
  - `elements/*.md`: 角色与道具（静态资产）。
  - `scenes/*.md`: 场景与地理信息。
  - `shots/*.md`: 分镜设计与剧本。
- **YAML 铁律**：所有文件必须确保 `visual_detailed` 与 `status` 字段的一致性。
- **引用规范**：使用 `@id` 引用全局资产。

## 4. 故障处理 (Emergency)
- 若 API 报错（401/429/500），应立即检查 `.env` 配置，不得凭空猜测参数名。
- 所有非 2xx 响应必须保留原始错误 JSON，用于证据链追溯。

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

### 步骤 1：依赖图分析
执行 `opsv deps`，向导演展示：
- 每个资产的依赖关系
- **拓扑排序后的批次顺序**
- 哪些资产已有 approved 参考图（✅），哪些没有（⚠️）

### 步骤 2：批次确认（必须！）
**严禁跳过此步骤。** 必须逐批确认后再生成：

```
导演，依赖图分析如下：

第1批（无依赖，可立即生成）:
  ✅ prop_green_pot, role_chen_hai, role_lin_yuan, scene_dorm, scene_meeting_room, scene_rental, scene_rooftop

第2批（依赖第1批 approved 后可生成）:
  ⚠️ [资产名]

请确认从第1批开始生成？
```

- 用户确认后，调用 `opsv generate`（仅生成当前批次）
- 用户跳过某批次时，记录原因，继续下一批

### 步骤 3：编译
执行 `opsv generate` 或 `opsv generate --skip-approved`。
检查 `queue/skipped.json`，向编导汇报已跳过哪些内容。

### 步骤 4：渲染
```bash
# 图片生成
opsv queue compile <tasksJson> --provider <name>
opsv queue run <provider>

# 视频生成（需图片 approved 后）
opsv queue compile <tasksJson> --provider siliconflow
opsv queue run siliconflow
```

### 步骤 5：审查归档
- 调用 `opsv review` 启动 Web UI
- Guardian-Agent 根据 Approve/Draft 结果更新 frontmatter
- 归档到 `artifacts/drafts_N/`

## 3. 标准文法指南 (Standards)
你必须强力维护以下标准，拒绝任何非法输入：
- **目录主权**：
  - `elements/*.md`: 角色与道具（静态资产）。
  - `scenes/*.md`: 场景与地理信息。
  - `shots/*.md`: 分镜设计与剧本（支持 `script-N.md` 命名）。
- **YAML 铁律**：所有文件必须具备 `type`、`status`、`visual_detailed` 字段。
- **锚点规范**：全局资产使用 `@id` 引用；局部参考图使用标准 Markdown 图片语法。

## 4. 故障处理 (Emergency)
- 若 API 报错（401/429/500），应立即检查 `.env` 配置，不得凭空猜测参数名。
- 所有非 2xx 响应必须保留原始错误 JSON，用于证据链追溯。

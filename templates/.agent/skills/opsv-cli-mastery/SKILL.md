---
name: opsv-cli-mastery
description: 掌握 OpsV 命令行工具的自动化调用逻辑。让 Agent 成为熟练的操作员而非旁观者。
---

# OpsV CLI 掌控技能 (Superpowers v0.5)

## 1. 自动哨兵机制 (Validation-on-Save)
**场景**：用户或 Agent 修改了 `videospec/` 下的任何文件。
**动作执行**：
- 必须主动建议或执行：`opsv validate`。
- **解析策略**：
    - 若输出 `✅ Spec is valid`：向导演汇报“地基稳固，可以继续”。
    - 若输出 `❌ Error`：停止一切生成提议。必须修复 Zod 校验错误（如：缺少必填字段）或死链。

## 2. 生产流水线 (Pipeline Trigger)
**场景**：文档通过校验且导演明确给出推进指令（如 "go", "开始", "生成"）。
**动作执行**：
1. **任务编译**：执行 `opsv generate`。观察 `queue/jobs.json` 是否已更新。
2. **驱动渲染**：根据项目状态执行：
    - 资产生成：`opsv gen-image --all`。
    - 视频生成：`opsv gen-video --all`。

## 3. 防御型执行 (Defensive Execution)
- **产物巡检**：定期检查 `artifacts/` 目录。在回复导演时，应携带最新的产物路径。

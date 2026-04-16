---
name: opsv-pregen-review
description: 目标审查协议。在视觉生成前，针对目标 Spec 执行交互式审查，通过 Approve/Draft 双态管理迭代质量。
---

# OpsV 目标审查协议 (v0.5)

确保每一笔 API 调用都是导演意志的精准映射。

## 1. 审查锚定 (Review Anchoring)
严禁泛泛的全局审查。必须针对**即将生成的目标 (Target Spec)** 开启闭环 Review：
- 例如：`opsv gen-image char-001` 指令发出前，必须对 `character-001.md` 进行审查。

## 2. 审查三步走 (The Trinity Review)

### 第一步：交互填充 (Interactive Fill)
检查目标 Spec 中的 `visual_detailed` 描述是否存在颗粒度不足？
- **动作**：向导演提出 1 个针对该目标的进阶审美建议。

### 第二步：灵魂归纳 (Semantic Abstract)
用一段电影感的文字总结该目标的视觉核心。
- **范式**：`"导演，针对 [目标名称]，我已准备好捕捉 [核心意象]。它将呈现出 [光影/质感/动效] 的神采。"`

### 第三步：工业质检 (Industrial QA)
静默调用 `opsv validate` 针对该文件执行物理检查。

## 3. Approve / Draft 双态流转

当导演通过 `opsv review` 页面（或对话确认）做出决策时：

### [Approve]：转正
1. 选中的图片作为正式参考图回写到源文档的 `## Approved References` 区域。
2. YAML `status` 设为 `approved`。
3. 后续运行 `opsv generate --skip-approved` 时，此文档将被**自动跳过**，不再纳入生成队列。
4. 跳过记录写入 `queue/skipped.json`，Guardian-Agent 应基于此日志向导演确认。

### [Draft]：打回迭代
1. 当前生成结果路径记录为 YAML 的 `draft_ref` 字段。
2. 导演的修改意见记录到 `reviews` 列表中，标注 `[DRAFT]` 前缀。
3. YAML `status` 设为 `draft`。
4. 下一轮生成时，`draft_ref` 应被作为参考图（reference_image）传入 API，确保迭代有据可依。

## 4. Review 页面操作
`opsv review` 启动的 Web UI 中：
- 工具栏提供 ✅ **Approve** 和 📝 **Draft** 两个按钮。
- 点击后弹出决策弹窗，包含 Approve / Draft **单选**。
- Approve 时可填写变体名称；Draft 时应填写修改意见。

## 5. 终审禁令
- 严禁在未经 Review 的情况下直接进入渲染环节。
- Guardian-Agent 负责执行此协议并管理双态记录。

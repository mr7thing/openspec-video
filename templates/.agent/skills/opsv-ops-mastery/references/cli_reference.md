# CLI 命令参考

> 当前版本：v0.5.8 (Incremental)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv generate` | 编译文档为图像生成任务 | 图像管线 |
| `opsv gen-image` | 执行图像生成（调用 API） | 图像管线 |
| `opsv review` | 启动 Web Review UI 页面服务 | 审阅 |
| `opsv deps` | 分析资产依赖关系与推荐顺序 | 分析 |
| `opsv animate` | 编译 Shotlist.md 为视频任务 | 视频管线 |
| `opsv gen-video` | 执行视频生成（调用 API） | 视频管线 |
| `opsv daemon` | 全局后台服务管理（守护进程） | 基础设施 |
| `opsv addons` | 创作扩展包管理 | 扩展 |

---

## 核心命令详解

### opsv generate
编译 Markdown 文档为图像生成任务 (`jobs_batch_N.json`)。

**v0.5+ 核心演进**:
- **Markdown 结构化解析**: 分镜直接从 `## Shot NN` 标题解析，废弃 YAML 数组。
- **YAML 强约束**: 强制读取 `visual_brief` 和 `visual_detailed` 字段。
- **编译校验**: 自动执行双引号清洗、必填字段检查、引用的有效性校验。

### opsv review
启动基于 Express 的本地 Web Review UI（默认端口 3456）。

**功能**:
- **视觉反馈**: 实时对比多模型生成结果。
- **Approve 闭环**: 点击 Approve 自动复制图片、更新源文档 `status`、回写 `## Approved References`、并执行 `git commit`。
- **增量更新**: Review 后的反馈需同步回写 YAML 以修正后续生成。

### opsv deps
分析项目资产间的拓扑依赖结构。

**逻辑**:
- ✅ **全绿**: 所有依赖已 approved，可生成。
- ⏸️ **阻塞**: 依赖的资产尚未通过 review。
- **分批指引**: 自动将任务划分为 `Batch 1`, `Batch 2` 等推荐执行顺序。

---

## 典型生产流 (Standard Workflow)

1. **`opsv init`**: 建立项目基础。
2. **创意阶段**: 在 `elements/`, `scenes/`, `shots/` 下编写 Markdown，聚焦 `## Vision`。
3. **YAML 固化**: Agent 基于正文提炼 YAML `visual_detailed` 并生成 `prompt_en`（使用折叠块语法 `>`）。
4. **`opsv deps`**: 确认依赖关系。
5. **`opsv generate`**: 获取任务批次。
6. **`opsv gen-image`**: 渲染候选图（建议先 `---dry-run`）。
7. **`opsv review`**: 通过 Web 界面进行审美决策。
8. **视频管线**: 基于通过审阅的 `@FRAME` 执行 `opsv animate` 与 `gen-video`。

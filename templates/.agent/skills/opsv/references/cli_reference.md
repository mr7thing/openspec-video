# CLI 命令参考

> 当前版本：v0.6.4 (Circle Architecture)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构（不再创建 `artifacts/`、`queue/` 等旧目录） | 项目启动 |
| `opsv validate` | 校验文档引用的死链与 YAML 完整性 | 文档校验 |
| `opsv imagen` | 编译文档为图像生成任务，产出 `opsv-queue/<circle>/imagen_jobs.json` | 图像管线 |
| `opsv animate` | 编译 Shotlist.md 为视频任务（默认 `--cycle auto` 推断末端 Circle） | 视频管线 |
| `opsv comfy` | ComfyUI 工作流编译入队 | 自定义管线 |
| `opsv queue compile` | 将 `jobs.json` 按 Provider 编译入队到 `opsv-queue/<circle>/<provider>/queue_{N}/` | 入队 |
| `opsv queue run` | 执行队列物理渲染（需指定 Provider） | 执行 |
| `opsv circle` | 状态与清单管理（`status`、`manifest`） | 状态 |
| `opsv deps` | 分析资产依赖关系与推荐顺序 | 分析 |
| `opsv review` | 启动 Web Review UI 页面服务 | 审阅 |
| `opsv daemon` | 全局后台服务管理（守护进程） | 基础设施 |

---

## 核心命令详解

### opsv imagen
编译 Markdown 文档为图像生成任务，保存为 `opsv-queue/<circle>/imagen_jobs.json`。

**v0.6.4 演进**:
- **Circle 隔离**：产出按 Circle 隔离（zerocircle_1, firstcircle_1, ...）。
- **生成 vs 入队分离**：`imagen` 只生成 JSON，不直接入队；后续需 `queue compile` 显式入队。
- **YAML 强约束**: 强制读取 `visual_detailed` 和 `visual_brief` 字段。

### opsv animate
编译 Shotlist.md 为视频任务，保存为 `opsv-queue/<circle>/video_jobs.json`。

**v0.6.4 演进**:
- **默认 `--cycle auto`**：自动推断依赖图末端 Circle。
- **EndCircle 语义**：视频任务自动落入拓扑排序最后一个 Circle（EndCircle）。

### opsv queue compile
将任务 JSON 编译入队，按 Provider 分配到 `opsv-queue/<circle>/<provider>/queue_{N}/`。

**行为**：
- 每次 `compile` 都会新建 batch（`queue_{max+1}`），不会追加到已有 batch。
- 产出 `queue.json` + `manifest.json`。

### opsv queue run
执行物理队列。必须指定 Provider。

```bash
opsv queue run volcengine
```

- 产出文件命名：`{taskId}_{seq}.{ext}`（全局唯一序号）。
- 资产直接落在 queue 目录下，无 `approved/` 中转。

### opsv circle
Circle 状态管理。

```bash
opsv circle status    # 扫描各 Circle 目录，统计任务/完成/失败/批准数
opsv circle manifest  # 生成 opsv-queue/circle_manifest.json
```

### opsv review
启动基于 Express 的本地 Web Review UI（默认端口 3456）。

**功能**:
- **视觉反馈**: 实时对比多模型生成结果。
- **Approve 闭环**: Approve 后直接引用原队列路径（`opsv-queue/...`），不再复制到 `approved/` 目录。
- **静态路由**: `/opsv-queue` 替代旧 `/artifacts`。

### opsv deps
分析项目资产间的拓扑依赖结构。

**逻辑**:
- ✅ **全绿**: 所有依赖已 approved，可生成。
- ⏸️ **阻塞**: 依赖的资产尚未通过 review。
- **Circle 指引**: 自动按 Circle（ZeroCircle → FirstCircle → ... → EndCircle）排序。

---

## 典型生产流 (Standard Workflow)

1. **`opsv init`**: 建立项目基础。
2. **创意阶段**: 在 `elements/`, `scenes/`, `shots/` 下编写 Markdown，聚焦 `## Vision`。
3. **`opsv validate`**: 校验文档与引用死链。
4. **`opsv deps`**: 确认依赖关系与 Circle 执行顺序。
5. **`opsv imagen`**: 生成图像任务列表（`opsv-queue/zerocircle_1/imagen_jobs.json`）。
6. **`opsv queue compile`**: 将任务按 Provider 编译入队。
7. **`opsv queue run <provider>`**: 执行渲染。
8. **`opsv review`**: 通过 Web 界面进行审美决策。
9. **下一 Circle**: 基于 approved 资产，继续 FirstCircle → ... → EndCircle。
10. **`opsv animate`**: 生成视频任务（自动推断 EndCircle）。
11. **`opsv queue compile` + `opsv queue run`**: 视频渲染。

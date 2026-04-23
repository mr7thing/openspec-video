# CLI 命令参考

> 当前版本：v0.6.4 (Circle Architecture)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv validate` | 校验文档引用的死链与 YAML 完整性 | 文档校验 |
| `opsv imagen` | 编译文档为图像生成任务，产出 `opsv-queue/<circle>/imagen_jobs.json` | 图像管线 |
| `opsv animate` | 编译 Shotlist.md 为视频任务（默认 `--cycle auto` 推断末端 Circle） | 视频管线 |
| `opsv comfy compile` | ComfyUI 工作流直接编译为可执行 `.json` | 自定义管线 |
| `opsv queue compile` | 将 `jobs.json` 按 Provider+Model 编译为可执行 `.json` | 执行层编译 |
| `opsv queue run` | 一次性顺序执行队列任务 | 执行 |
| `opsv circle` | 状态与清单管理（`status`、`manifest`） | 状态 |
| `opsv deps` | 分析资产依赖关系与推荐顺序 | 分析 |
| `opsv review` | 启动 Web Review UI 页面服务 | 审阅 |

---

## 核心命令详解

### opsv imagen
编译 Markdown 文档为图像生成任务，保存为 `opsv-queue/<circle>/imagen_jobs.json`。

**v0.6.4 演进**:
- **Circle 自动推断**：未指定 `--circle` 时自动推断当前开放的 Circle。
- **上游 Circle 检查**：执行前检测上游 Circle 是否全部 approved，未 approved 时阻止执行（可 `--skip-circle-check` 跳过）。
- **`--skip-approved` 默认开启**：已有 approved 参考图的资产自动跳过，避免重复生成。需强制生成时用 `--no-skip-approved`。
- **生成 vs 编译分离**：`imagen` 只生成 `imagen_jobs.json`，不直接生成 API 请求体；后续需 `queue compile` 显式编译。
- **YAML 强约束**: 强制读取 `visual_detailed` 和 `visual_brief` 字段。

### opsv animate
编译 Shotlist.md 为视频任务，保存为 `opsv-queue/<circle>/video_jobs.json`。

**v0.6.4 演进**:
- **Circle 自动推断**：未指定 `--circle` 时自动推断当前开放的 Circle。
- **上游 Circle 检查**：执行前检测上游 Circle 是否全部 approved，未 approved 时阻止执行（可 `--skip-circle-check` 跳过）。
- EndCircle 必须是 `shotlist.md`。

### opsv comfy compile
ComfyUI 工作流直接编译为可执行 `.json`，不走 `queue compile`。

```bash
opsv comfy compile workflow.json --provider comfyui_local --shot-id shot_01 --circle zerocircle_1
```

- 产出原始 ComfyUI workflow `.json`，可直接在 ComfyUI WebUI 中导入测试。
- 参数通过 Node Title 匹配注入（`--param key=value`）。

### opsv queue compile
将任务 JSON 编译为 Provider 特定的可直接执行的 `.json` 文件。

```bash
# 单 Provider
opsv queue compile imagen_jobs.json --model volcengine.seadream-5.0-lite --circle zerocircle_1

# 多 Provider（同一 jobs.json 编译到不同 Provider）
opsv queue compile jobs.json --model volcengine.seadream-5.0-lite --model siliconflow.qwen-image --circle zerocircle_1
```

**行为**：
- 每次 `compile` **必然创建新 batch**（`queue_{N+1}/`）。
- 从 `api_config.yaml` 读取模型配置、defaults、API URL。
- 生成 `{jobId}.json`（完整 API 请求体，可直接发送）。
- 生成 `queue.json` 只读索引 + `compile.log`。

### opsv queue run
一次性顺序执行队列任务，完成自动退出。

```bash
# 批量执行最新 batch
opsv queue run --model volcengine.seadream-5.0-lite --circle zerocircle_1

# 指定单个/多个文件
opsv queue run --model siliconflow.qwen-image --file shot_01.json shot_02.json --circle zerocircle_1

# 重试失败任务
opsv queue run --model minimax.minimax-image-01 --retry
```

**行为**：
- 默认执行该 Provider 最新 `queue_N/` 目录。
- 跳过已有 `_{seq}.png` 结果的任务。
- 跳过已有 `_error.log` 的任务（除非 `--retry`）。
- 顺序执行，写 JSONL 日志（`{jobId}.log`），失败写 `{jobId}_error.log`。
- 完成打印摘要，自动退出。

**Agent 直接操作**：
```bash
# 复制并修改任务
cp queue_1/shot_01.json queue_1/shot_01_v2.json
# 编辑 shot_01_v2.json 的 prompt 字段
opsv queue run --model volcengine.seadream-5.0-lite --file shot_01_v2.json
# → 生成 shot_01_v2_1.png
```

### opsv circle

Circle（环）依赖层次的状态管理与拓扑刷新。**每次文档变更后必须重新执行**，不可依赖缓存结果。

```bash
opsv circle status          # 实时扫描文档，重新计算拓扑排序与批准状态
opsv circle manifest        # 将当前拓扑快照写入 opsv-queue/circle_manifest.json
opsv circle --skip          # 只生成零环和终环（终环=shotlist.md）
```

**v0.6.4 修复**: `opsv circle` 命令现已正确注册，可直接使用。

**设计哲学**：Circle 不是静态配置，而是文档依赖关系的**动态投影**。`opsv circle status` 每次运行都会：
1. 重新扫描 `videospec/` 下所有 `.md` 文件
2. 从 frontmatter 的 `refs` 字段重建依赖图
3. 拓扑排序得到 Circle 分层（ZeroCircle → FirstCircle → ...）
4. 读取每个文档的 `## Approved References` 区域统计批准状态

**触发时机**（文档变更后必须刷新）：

| 事件 | 必须执行的命令 | 原因 |
|------|---------------|------|
| 新增/修改/删除 `.md` 文件 | `opsv circle status` | `refs` 依赖关系可能改变，资产可能重新分层 |
| Review Approve 后 | `opsv circle status` + `manifest` | 批准状态变更，可能解锁下一 Circle |
| Review Draft 后 | `opsv circle status` | 批准状态回退，必须阻断下游 Circle |
| 迭代重生成（修改 prompt 重跑） | `opsv circle status` | 迭代计数变化，旧结果不再有效 |
| 手动修改 `## Approved References` | `opsv circle status` | 验证引用路径有效性 |

**输出解读与 Agent 决策**：

```
  ✅ FirstCircle: 8 个资产 (8 已批准)
     └─ 已有 2 次迭代记录在 opsv-queue
  ⏳ SecondCircle: 5 个资产 (2 已批准)
  ⭕ ThirdCircle: 3 个资产 (0 已批准)
```

- **⭕ 未开始**：该 Circle 无任何 approved 资产 → **禁止启动下游**，优先执行本 Circle `imagen`/`animate`
- **⏳ 进行中**：部分 approved → **继续完成**未批准资产，仍禁止启动下游
- **✅ 已完成**：全部 approved → **允许晋升**下一 Circle，应执行 `manifest` 固化快照

**典型状态检查流**：

```bash
# 1. 文档变更后，先校验再刷新
opsv validate
opsv circle status

# 2. 确认全部 approved 后，固化并晋升
opsv circle manifest        # 生成 circle_manifest.json
opsv animate                # 基于 approved 资产生成下一 Circle 任务
```

### opsv review
启动基于 Express 的本地 Web Review UI（默认端口 3456）。

**功能**:
- **视觉反馈**: 实时对比多模型生成结果。
- **Approve 闭环**: Approve 后直接引用原队列路径（`opsv-queue/...`）。
- Review 后刷新 circle：有变化 → `circle_N+1`；全部 approve → 创建下一环。

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
6. **`opsv queue compile --<provider.model>`**: 编译为可执行 `.json`。
7. **`opsv queue run --<provider.model>`**: 执行渲染。
8. **`opsv review`**: 通过 Web 界面进行审美决策。
9. **下一 Circle**: 基于 approved 资产，继续 FirstCircle → ... → EndCircle。
10. **`opsv animate`**: 生成视频任务（自动推断 EndCircle）。
11. **`opsv queue compile --<provider.model>` + `opsv queue run --<provider.model>`**: 视频渲染。

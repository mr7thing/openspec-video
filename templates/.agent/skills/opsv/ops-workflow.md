# OpsV 运维管线 (Ops Workflow)

从文档校验到物理渲染的完整运维与审查协议。涵盖 Guardian-Agent 与 Runner-Agent 的全部操作规程。

---

## 1. 自动哨兵体制 (The Guard)

**触发时机**：`videospec/` 目录下任何 `.md` 文件发生变动。
**执行者**：Guardian-Agent

**核心动作**：
- 显式提议或静默执行：`opsv validate`。
- **状态决策**：
    - ✅ **GREEN**: 输出 `✅ Spec is valid` 时，方可进行下一步脑暴或渲染。
    - ❌ **RED**: 若报错，必须立即停止工作流，指明错误文件与具体行号，引导导演修复。

---

## 2. 生成前审查协议 (Pre-Gen Review)

**执行者**：Guardian-Agent
**目标**：确保每一笔 API 调用都是导演意志的精准映射。

### 审查锚定
严禁泛泛的全局审查。必须针对**即将生成的目标 (Target Spec)** 开启闭环 Review。

### 审查三步走

**第一步：交互填充**
检查目标 Spec 中的 `visual_detailed` 描述是否存在颗粒度不足？
- **动作**：向导演提出 1 个针对该目标的进阶审美建议。

**第二步：灵魂归纳**
用一段电影感的文字总结该目标的视觉核心。
- **范式**：`"导演，针对 [目标名称]，我已准备好捕捉 [核心意象]。它将呈现出 [光影/质感/动效] 的神采。"`

**第三步：工业质检**
静默调用 `opsv validate` 针对该文件执行物理检查。

### Approve / Draft 双态流转

**[Approve]：转正**
1. 选中的图片作为正式参考图回写到源文档的 `## Approved References` 区域（`![variant](path)` 格式）。
2. YAML `status` 设为 `approved`。
3. 后续 `opsv imagen` 时，此文档将被自动跳过（`--skip-approved` 默认开启），不再纳入生成队列。

**一致性约束**: `status: approved` 与 `## Approved References` 必须严格一致。`opsv validate` 会校验：
- `approved` 状态必须有至少一张 Approved References
- 有 Approved References 的文档状态必须为 `approved`

**[Draft]：打回迭代**
1. 当前生成结果路径记录为 YAML 的 `draft_ref` 字段。
2. 导演的修改意见记录到 `reviews` 列表中，标注 `[DRAFT]` 前缀。
3. YAML `status` 设为 `draft`。
4. 下一轮生成时，`draft_ref` 应被作为参考图传入 API，确保迭代有据可依。

### 终审禁令
- 严禁在未经 Review 的情况下直接进入渲染环节。
- Guardian-Agent 负责执行此协议并管理双态记录。

---

## 3. 任务编排逻辑 (The Orchestrator)

**执行者**：Runner-Agent
**场景**：创意方案已定稿，准备进入视觉呈现阶段。

### 步骤 1：Circle 依赖分析
执行 `opsv validate` 确保无死链，执行 `opsv circle status` 理解当前任务所属 Circle：
- **ZeroCircle**: 基础资产（角色、场景）。
- **FirstCircle**: 基于资产的分镜草图（Image）。
- **EndCircle**: 基于 Image 的动态视频（Video），由 `opsv animate` 自动推断（必须是 `shotlist.md`）。

### 步骤 2：生成任务列表
根据导演指令下发对应的媒介类型：

```bash
# 图像任务（自动推断当前开放的 Circle，默认跳过已 approved 资产）
opsv imagen [targets...]
# 产出: opsv-queue/<circle>/imagen_jobs.json

# 视频任务（自动推断末端 Circle）
opsv animate
# 产出: opsv-queue/<endcircle>/video_jobs.json

# ComfyUI 工作流（直接编译为可执行 .json）
opsv comfy compile workflow.json --provider <comfyui_local|runninghub> --circle <name>
```

### 步骤 3：编译入队 (Compile)
`opsv queue compile` 将意图层 jobs.json 编译为执行层可直接发送的 API 请求体 `.json`。

```bash
opsv queue compile opsv-queue/zerocircle_1/imagen_jobs.json --model volcengine.seadream-5.0-lite --circle zerocircle_1
```

- **每次 compile 必然创建新 batch**：`queue_{N+1}/`。
- 产出 `{jobId}.json`（完整 API 请求体，含 `_opsv` 元数据）。
- `queue.json` 为只读索引，`compile.log` 记录编译摘要。
- compile **仅读取 api_config**，将配置固化到 `.json` 中；run 时不再读取配置。

### 步骤 4：物理渲染 (Run)
一次性顺序执行队列任务。

```bash
opsv queue run --model volcengine.seadream-5.0-lite --circle zerocircle_1
opsv queue run --model siliconflow.qwen-image --circle zerocircle_1
```

- 默认执行最新 `queue_N/` 目录。
- 跳过已有 `_{seq}.png` 结果的任务。
- 跳过已有 `_error.log` 的任务（除非 `--retry`）。
- 产出文件命名：`{jobId}_{runSeq}.{ext}`（本地递增，无全局锁）。
- 资产平铺在 queue 目录下，无子目录。

**Agent 迭代操作**：
```bash
# 复制现有任务，修改参数后重新执行
cp queue_1/shot_01.json queue_1/shot_01_v2.json
# 编辑 shot_01_v2.json（修改 prompt、seed 等字段）
opsv queue run --model seedream --file shot_01_v2.json
# → 生成 shot_01_v2_1.png

# 强制重新生成已 approved 资产（覆盖默认跳过）
opsv imagen --no-skip-approved
```

### 步骤 5：审查与引用 (Review)
- 调用 `opsv review` 启动 Web UI（默认端口 3456）。
- **Approve 闭环**：Approve 后直接引用原队列路径（`opsv-queue/...`）。
- 只有 `Approve` 的资产才能作为下一 Circle 的参考底图。
- Review 后刷新 circle：有变化 → `circle_N+1`；全部 approve → 创建下一环。

### 步骤 6：下一 Circle
基于 approved 资产，继续 FirstCircle → ... → EndCircle。

---

## 4. 批次感知

Runner-Agent 必须理解依赖图的批次概念：
- 第 0 批（ZeroCircle）：无依赖的资产，可立即生成
- 第 N 批：依赖第 N-1 批 approved 资产的，必须等前一批完成 review
- 使用 `opsv circle status` 确认当前各 Circle 状态
- 使用 `opsv deps` 查看拓扑排序

---

## 5. Circle 状态刷新协议 (Circle Refresh Protocol)

**核心原则**：`opsv circle` 不是一次性命令，而是状态探针。任何影响资产依赖关系或批准状态的变更后，必须重新执行以获取最新拓扑视图。

### 5.1 触发时机 (When to Refresh)

以下任一事件发生后，**必须**执行 `opsv circle status`：

| 事件类型 | 具体场景 | 后续动作 |
|----------|----------|----------|
| **文档依赖变更** | 新增/删除/修改 `.md` 文件中的 `refs` 字段 | 重新分析 Circle 分层，确认资产归属是否漂移 |
| **Review Approve** | 某资产在 `opsv review` 中被标记为 Approve | 检查该 Circle 是否全部 approved，决定能否晋升下一 Circle |
| **Review Draft** | 某资产被打回 Draft 状态 | 确认该 Circle 退回未完成状态，阻止下游 Circle 启动 |
| **迭代重生成** | 对某资产执行迭代生成（修改 prompt 重新 render） | 确认迭代计数增加，旧版本不再计入 approved |
| **手动编辑 Approved References** | 人工修改 markdown 中的 `## Approved References` 区域 | 验证 approved 引用路径有效，状态统计准确 |
| **目录结构变更** | 新增/删除 `videospec/` 子目录或文件 | 重新扫描全部资产，重建依赖图 |

### 5.2 命令语义与决策矩阵

```bash
# 状态探针 — 实时扫描文档目录，重新计算拓扑排序和批准状态
opsv circle status

# 清单固化 — 将当前拓扑快照写入 opsv-queue/circle_manifest.json，供后续步骤消费
opsv circle manifest
```

**`opsv circle status` 输出解读**：

```
  ✅ FirstCircle: 8 个资产 (8 已批准)
     └─ 已有 2 次迭代记录在 opsv-queue
     └─ shot_01, shot_02, shot_03 ...等 5 个

  ⭕ SecondCircle: 5 个资产 (0 已批准)
     └─ shot_04, shot_05, shot_06 ...等 2 个
```

| 图标 | 含义 | Agent 决策 |
|------|------|------------|
| ⭕ | 该 Circle 无任何资产被批准 | **禁止**启动下游 Circle 生成；优先执行本 Circle 的 `imagen` / `animate` |
| ⏳ | 部分资产已批准（未全部完成） | 继续完成未批准资产的生成与 review；仍**禁止**启动下游 Circle |
| ✅ | 全部资产已批准 | **允许**启动下一 Circle 的生成管线；执行 `opsv circle manifest` 固化快照 |

### 5.3 状态流转工作流

**场景 A：依赖变更后的重新分层**

```bash
# 导演修改了 scenes/classroom.md，新增 refs: ["@blackboard"]
opsv validate              # 1. 先校验文档语法
opsv circle status         # 2. 刷新！确认 classroom 是否从 ZeroCircle 漂移到 FirstCircle
opsv deps                  # 3. 查看新的拓扑排序
# → 根据新分层决定是否需要重新编译任务列表
```

**场景 B：Review Approve 后的晋升检查**

```bash
# 导演在 opsv review 中 approve 了 shot_03
opsv circle status         # 1. 刷新！检查 FirstCircle 是否全部 approved
# → 若输出显示 "✅ FirstCircle: 8 个资产 (8 已批准)"
opsv circle manifest       # 2. 固化当前状态快照
opsv animate               # 3. 基于 approved 资产，生成视频任务（自动推断 SecondCircle）
opsv queue compile ...     # 4. 进入下一 Circle 的编译与执行
```

**场景 C：Draft 打回后的阻断**

```bash
# 导演将 shot_03 标记为 Draft，要求修改 prompt
opsv circle status         # 1. 刷新！确认 FirstCircle 退回 ⏳ 或 ⭕ 状态
# → 输出显示 "⏳ FirstCircle: 8 个资产 (7 已批准)"
# → Agent 必须阻止 SecondCircle 启动，直到 shot_03 重新 approved
```

### 5.4 铁律

- **禁止缓存 Circle 状态**：Agent 不得将之前 `opsv circle status` 的结果缓存用于后续决策。每次操作前必须重新执行。
- **禁止跨越未批准 Circle**：即使技术层面可以编译下游任务，只要 `opsv circle status` 显示上游 Circle 未全部 ✅，就不得启动 `queue compile` 或 `queue run`。
- **manifest 是承诺**：`opsv circle manifest` 生成的 `circle_manifest.json` 是当前状态的快照。在变更后如果未重新执行 `manifest`，该文件即为过期状态，不得作为决策依据。

---

## 6. 故障处理 (Emergency)

- 若 API 报错（401/429/500），应立即检查 `.env` 配置，不得凭空猜测参数名。
- 所有非 2xx 响应保留在 `{jobId}.log`（JSONL 格式）中，用于证据链追溯。
- Circle 隔离铁律：严禁在 ZeroCircle 未完成 Approve 时强行下发 FirstCircle。

---

## 6. 运维命令速查

| 命令 | 用途 |
|------|------|
| `opsv validate` | 校验文档引用的死链、YAML 完整性、Approved References ↔ status 一致性 |
| `opsv deps` | 分析资产依赖关系与推荐顺序 |
| `opsv circle status` | 扫描各 Circle 目录，统计任务/完成/失败/批准数 |
| `opsv circle manifest` | 生成 `opsv-queue/circle_manifest.json` |
| `opsv circle --skip` | 只生成零环和终环（终环=shotlist.md） |
| `opsv imagen` | 编译文档为图像任务列表（自动推断 Circle，默认跳过 approved） |
| `opsv animate` | 编译 Shotlist 为视频任务列表（自动推断末端 Circle） |
| `opsv comfy compile <workflow.json>` | ComfyUI 工作流直接编译为可执行 `.json` |
| `opsv queue compile <jobs.json> --model <alias>` | 将任务按 Provider+Model 编译为 `.json` |
| `opsv queue run --model <alias>` | 一次性顺序执行队列任务 |
| `opsv review` | 启动 Web Review UI |

完整 CLI 参考见 `references/cli_reference.md`。

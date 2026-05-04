# OpsV 运维管线 (Ops Workflow)

从文档校验到物理渲染的完整运维与审查协议。涵盖 Guardian-Agent 与 Runner-Agent 的全部操作规程。

> 当前版本：v0.8.17 (ComfyUI Unified Compilation + Per-Task Workflow)

---

## 1. 自动哨兵体制 (The Guard)

**触发时机**：`videospec/` 目录下任何 `.md` 文件发生变动。
**执行者**：Guardian-Agent

**核心动作**：
- 显式提议或静默执行：`opsv validate`。
- **状态决策**：
    - ✅ **GREEN**: 输出 `✅ Spec is valid` 时，方可进行下一步脑暴或渲染。
    - ❌ **RED**: 若报错，必须立即停止工作流，指明错误与具体行号，引导导演修复。

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

Review approve 根据**生成物文件名**自动判断状态：

1. **原始任务生成物**（`id_1.ext` 模式，如 `@hero_1.png`）：
   - CLI 直接设 `status: approved`
   - 追加 review 记录（时间戳 + approve 意见）
   - 后续 `opsv imagen` 时，此文档将被自动跳过（`--skip-approved` 默认开启）

2. **修改任务生成物**（`id_N_N.ext` 模式，如 `@hero_2_1.png`）：
   - CLI 设 `status: syncing`（不直接 approved）
   - 追加 review 记录（时间戳 + approve 意见 + `modified_task: <task JSON 路径>`）
   - Agent 必须检查 review 记录中的 `modified_task` 路径，将 `visual_detailed`、`visual_brief`、`prompt_en`、`refs` 与修改后 task JSON 对齐
   - 对齐完成后 Agent 设 `status: approved`

**CLI 非冲突原则**：Review approve 绝不修改 `prompt_en` 等内容字段，仅追加 review 记录 + 设置状态。

**一致性约束**: `status: approved` 与 `## Approved References` 必须严格一致。`opsv validate` 会校验：
- `approved` 状态必须有至少一张 Approved References
- 有 Approved References 的文档状态必须为 `approved`

**[Draft]：打回迭代**
1. 当前生成结果路径记录为 YAML 的 `draft_ref` 字段。
2. 导演的修改意见记录到 `reviews` 列表中，标注 `[DRAFT]` 前缀。
3. YAML `status` 设为 `drafting`。
4. 下一轮生成时，`draft_ref` 应被作为参考图传入 API，确保迭代有据可依。

### 终审禁令
- 严禁在未经 Review 的情况下直接进入渲染环节。
- Guardian-Agent 负责执行此协议并管理双态记录。

---

## 3. 任务编排逻辑 (The Orchestrator)

**执行者**：Runner-Agent
**场景**：创意方案已定稿，准备进入视觉呈现阶段。

### 步骤 1：Circle 依赖分析
执行 `opsv validate` 确保无死链，执行 `opsv circle refresh` 理解当前任务所属 Circle 与依赖状态：
- **ZeroCircle**: 基础资产（角色、场景）。
- **FirstCircle**: 基于资产的分镜草图（Image）。
- **EndCircle**: 基于 Image 的动态视频（Video），由 `opsv animate` 自动推断（必须是 `shotlist.md`）。

### 步骤 2：生成任务（直接编译）

v0.8 中 `opsv imagen` 和 `opsv animate` 带上 `--model` 参数后**直接编译**，产出可执行的 `.json` 文件，不再有 `jobs.json` 中间层。

**编译时参考图解析**（v0.8.3）：
- **外部引用**（`@assetId:variant`）→ `ApprovedRefReader` 读取被引用文档的 `## Approved References`，解析为 `Asset.approvedRefs`
- **内部引用**（本文档自带的参考图）→ `DesignRefReader` 读取自身文档的 `## Design References`，解析为 `Asset.designRefs`
- 第一个参考图块读取 `approvedRefs`（来自外部引用的 approved 图像）
- 第二个参考图块读取 `designRefs`（来自自身 `## Design References` 的设计参考图）

```bash
# 图像任务（自动推断当前开放的 Circle，默认跳过已 approved 资产）
opsv imagen --model volcengine.seadream-5.0-lite
# 产出: opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json 等

# 指定圈层
opsv imagen --model volcengine.seadream-5.0-lite --circle circle2

# 视频任务（自动推断末端 Circle）
opsv animate --model volcengine.seedance-2.0
# 产出: opsv-queue/videospec.circle2/volcengine.seedance_001/shot_01.json 等

# ComfyUI 工作流
opsv comfy --model comfylocal.klein9b     # 本地 ComfyUI
opsv comfy --model runninghub.default      # RunningHub 云端

# ComfyUI / RunningHub 工作流配置流程
# 1. 在 ComfyUI 中将需要外部控制的节点标题改为 opsv-xxx（如 opsv-prompt, opsv-image1）
# 2. 导出 API 格式 JSON（Save → API format）
# 3. 运行 comfy-node-mapping 生成 node_mapping
opsv comfy-node-mapping my_workflow.json -o mappings.json
# 4. 将 workflowId 和 node_mapping 填入 markdown frontmatter（见 references/workflow_template.md）
# 5. 编译并执行
opsv comfy --model runninghub.default --dry-run
opsv run opsv-queue/.../runninghub.default_001/

# WebApp 生成
opsv webapp --model <provider.model>

# 音频生成（规划中）
opsv audio --model <provider.model>
```

### 步骤 3：物理渲染 (Run)

v0.8 中 `opsv run` 按路径引用执行，取代原来的 `opsv queue run --model --circle`。

```bash
# 执行单个任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json

# 执行整个 Provider 目录下所有任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/

# 执行多个路径
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json opsv-queue/videospec.circle1/volcengine.seadream_001/shot_02.json

# 重试失败任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/ --retry
```

**行为**：
- 传入 `.json` 文件路径时，直接执行该任务。
- 传入目录路径时，扫描该目录下所有 `.json` 任务文件顺序执行。
- 跳过已有产出结果的任务（如 `shot_01_1.png` 已存在则跳过 `shot_01.json`）。
- 跳过已有 `_error.log` 的任务（除非 `--retry`）。
- 顺序执行，写 JSONL 日志（`{jobId}.log`），失败写 `{jobId}_error.log`。
- 产出文件命名约定：`id_1.ext`（原始任务），`id_N_1.ext`（修改任务，N≥2）。

**Agent 迭代操作（必须使用 `opsv iterate`）**：
```bash
# 克隆任务（序号递增，自动清除 compiledAt）
opsv iterate opsv-queue/videospec.circle1/volcengine.seadream_001/@hero.json
# → 生成 @hero_2.json（无论原任务是 @hero.json 还是 @hero_2.json，都基于原始 base 找下一个序号）
# 编辑 @hero_2.json（修改 prompt、seed 等字段）
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/@hero_2.json
# → 生成 @hero_2_1.png（修改任务的产出：id_N_1.ext 模式）
# → Review approve 后状态为 syncing（非 approved），Agent 需对齐文档描述字段

# 再次修改
opsv iterate opsv-queue/videospec.circle1/volcengine.seadream_001/@hero.json
# → 生成 @hero_3.json（自动基于原始 base 找下一个可用序号）
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/@hero_3.json
# → 生成 @hero_3_1.png

# 克隆整个目录进行批量迭代（目录内任务保持原始名称）
opsv iterate opsv-queue/videospec.circle1/volcengine.seadream_001/
# → 生成 volcengine.seadream_001_it_001/（原目录下所有 task JSON 被复制，名称不变）
# 编辑目录内任意 task JSON
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001_it_001/

# 强制重新生成已 approved 资产（覆盖默认跳过）
opsv imagen --model volcengine.seadream-5.0-lite --no-skip-approved
```

### 步骤 4：审查与引用 (Review)
- 调用 `opsv review` 启动 Web UI（默认端口 3456）。
- Review 服务启动时自动执行 `git add .` + `git commit -m "[review] {ts} — started"`（git commit checkpoint）。
- 审阅期间 approve/draft 的修改由 Review 服务缓存在内存，不做 git commit。
- Review 结束时（任意原因关闭、超时、idle 超时、Ctrl+C、manual）自动执行 `git add .` + `git commit -m "[review done] {ts} ({reason})"`（reason: idle-timeout / ttl-expired / sigint / manual）。
- **Approve 状态判断**（由生成物文件名自动决定）：
  - `id_1.ext` → 原始任务 → 直接 `approved`
  - `id_2_1.ext` → 修改任务 → `syncing`（Agent 需对齐后才可改为 `approved`）
- **CLI 非冲突原则**：Review approve 仅追加 review 记录 + 设置状态，绝不修改内容字段。
- 只有 `approved` 的资产才能作为下一 Circle 的参考底图。`syncing` 资产阻断下游。
- Review 后刷新 circle：`opsv circle refresh`；全部 approve → 可晋升下一环。
- **`## Approved References`**（输出侧）：审阅通过后自动追加，供其他文档通过 `@assetId:variant` 引用
- **`## Design References`**（输入侧）：文档自带的设计参考图，编译时作为 `reference_images` 传入生成 API

### 步骤 5：下一 Circle
基于 approved 资产，继续 FirstCircle → ... → EndCircle。

---

## 4. 批次感知

Runner-Agent 必须理解依赖图的批次概念：
- 第 0 批（ZeroCircle）：无依赖的资产，可立即生成
- 第 N 批：依赖第 N-1 批 approved 资产的，必须等前一批完成 review
- 使用 `opsv circle refresh` 确认当前各 Circle 状态与依赖关系

---

## 5. Circle 状态刷新协议 (Circle Refresh Protocol)

**核心原则**：`opsv circle refresh` 不是一次性命令，而是状态探针。任何影响资产依赖关系或批准状态的变更后，必须重新执行以获取最新拓扑视图。v0.8 中 `circle refresh` 合并了原 `circle status` 与 `deps` 的全部功能。

### 5.1 触发时机 (When to Refresh)

以下任一事件发生后，**必须**执行 `opsv circle refresh`：

| 事件类型 | 具体场景 | 后续动作 |
|----------|----------|----------|
| **文档依赖变更** | 新增/删除/修改 `.md` 文件中的 `refs` 字段 | 重新分析 Circle 分层，确认资产归属是否漂移 |
| **Review Approve** | 某资产在 `opsv review` 中被标记为 Approve | 检查该 Circle 是否全部 approved，决定能否晋升下一 Circle |
| **Review Draft** | 某资产被打回 Draft 状态 | 确认该 Circle 退回未完成状态，阻止下游 Circle 启动 |
| **迭代重生成** | 对某资产执行迭代生成（修改 prompt 重新 render） | 确认旧版本不再计入 approved |
| **手动编辑 Approved References** | 人工修改 markdown 中的 `## Approved References` 区域 | 验证 approved 引用路径有效，状态统计准确 |
| **目录结构变更** | 新增/删除 `videospec/` 子目录或文件 | 重新扫描全部资产，重建依赖图 |

### 5.2 命令语义与决策矩阵

```bash
# 状态探针 + 依赖分析 — 合并原 status 与 deps 功能
# 实时扫描文档目录，重新计算拓扑排序和批准状态
opsv circle refresh
```

**`opsv circle refresh` 输出解读**：

```
  ✅ FirstCircle: 8 个资产 (8 已批准)
     └─ shot_01, shot_02, shot_03 ...等 5 个

  ⭕ SecondCircle: 5 个资产 (0 已批准)
     └─ shot_04, shot_05, shot_06 ...等 2 个
```

| 图标 | 含义 | Agent 决策 |
|------|------|------------|
| ⭕ | 该 Circle 无任何资产被批准 | **禁止**启动下游 Circle 生成；优先执行本 Circle 的 `imagen` / `animate` |
| ⏳ | 部分资产已批准（未全部完成） | 继续完成未批准资产的生成与 review；仍**禁止**启动下游 Circle |
| ✅ | 全部资产已批准 | **允许**启动下一 Circle 的生成管线；_manifest.json 由 `opsv circle refresh` 自动写入 |

### 5.3 状态流转工作流

**场景 A：依赖变更后的重新分层**

```bash
# 导演修改了 scenes/classroom.md，新增 refs: ["@blackboard"]
opsv validate              # 1. 先校验文档语法
opsv circle refresh        # 2. 刷新！确认 classroom 是否从 ZeroCircle 漂移到 FirstCircle
# → 根据新分层决定是否需要重新编译任务列表
```

**场景 B：Review Approve 后的晋升检查**

```bash
# 导演在 opsv review 中 approve 了 shot_03
opsv circle refresh        # 1. 刷新！检查 FirstCircle 是否全部 approved
# → 若输出显示 "✅ FirstCircle: 8 个资产 (8 已批准)"
opsv animate --model volcengine.seedance-2.0  # 2. 基于 approved 资产生成视频任务
```

**场景 C：Draft 打回后的阻断**

```bash
# 导演将 shot_03 标记为 Draft，要求修改 prompt
opsv circle refresh        # 1. 刷新！确认 FirstCircle 退回 ⏳ 或 ⭕ 状态
# → 输出显示 "⏳ FirstCircle: 8 个资产 (7 已批准)"
# → Agent 必须阻止 SecondCircle 启动，直到 shot_03 重新 approved
```

### 5.4 铁律

- **禁止缓存 Circle 状态**：Agent 不得将之前 `opsv circle refresh` 的结果缓存用于后续决策。每次操作前必须重新执行。
- **禁止跨越未批准 Circle**：即使技术层面可以编译下游任务，只要 `opsv circle refresh` 显示上游 Circle 未全部 ✅，就不得启动 `imagen` / `animate` 或 `run`。
- **manifest 是承诺**：`opsv-queue/videospec.circleN/_manifest.json` 是当前 Circle 状态的快照，由 `opsv circle refresh` 自动写入。该文件反映最近一次状态扫描结果。

## 6. 故障处理 (Emergency)

- 若 API 报错（401/429/500），应立即检查 `.env` 配置，不得凭空猜测参数名。
- 所有非 2xx 响应保留在 `{jobId}.log`（JSONL 格式）中，用于证据链追溯。
- Circle 隔离铁律：严禁在 ZeroCircle 未完成 Approve 时强行下发 FirstCircle。

---

## 7. 运维命令速查

| 命令 | 用途 |
|------|------|
| `opsv validate` | 校验文档引用的死链、YAML 完整性、Approved References 与 status 一致性 |
| `opsv circle refresh` | 扫描文档目录，重新计算拓扑排序和批准状态，自动写入各 `.circleN/_manifest.json`（合并原 status + deps） |
| `opsv circle create --dir <path>` | 新建并激活依赖图（支持 `--name` 覆盖 basename、`--skip-middle-circle` 简化模式） |
| `opsv imagen --model <provider.model>` | 编译文档为可执行图像任务（直接产出 `.json`，无 jobs.json 中间层） |
| `opsv animate --model <provider.model>` | 编译 Shotlist 为可执行视频任务（直接产出 `.json`） |
| `opsv comfy --model <provider.model>` | ComfyUI 工作流编译与执行 |
| `opsv comfy-node-mapping <file>` | 从 workflow JSON 提取 node_mappings |
| `opsv webapp --model <provider.model>` | WebApp 浏览器自动化 |
| `opsv audio --model <provider.model>` | 音频生成（规划中） |
| `opsv run <paths...>` | 按路径引用执行渲染任务（支持文件路径、目录路径、多路径） |
| `opsv iterate <path>` | 克隆任务 JSON 或模型队列目录用于迭代 |
| `opsv review` | 启动 Web Review UI |
| `opsv script` | 从 shot_*.md 聚合生成 Script.md |

完整 CLI 参考见 `references/cli_reference.md`。

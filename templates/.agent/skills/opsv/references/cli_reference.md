# CLI 命令参考

> 当前版本：v0.8.14 (Manifest-First Architecture)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv validate` | 校验文档引用的死链与 YAML 完整性 | 文档校验 |
| `opsv circle create` | 新建并激活依赖图 | 状态 |
| `opsv circle refresh` | 刷新依赖状态 + 拓扑排序（合并原 status + deps） | 状态 |
| `opsv imagen --model` | 编译文档为图像任务，直接产出可执行 `.json` | 图像管线 |
| `opsv animate --model` | 编译 Shotlist 为视频任务，直接产出可执行 `.json` | 视频管线 |
| `opsv comfy --model` | ComfyUI 工作流编译与执行 | 自定义管线 |
| `opsv audio --model` | 音频生成（规划中） | 音频管线 |
| `opsv webapp --model` | WebApp 浏览器自动化 | 应用管线 |
| `opsv run <paths...>` | 按路径引用执行渲染任务 | 执行 |
| `opsv iterate <path>` | 克隆任务 JSON 或模型队列目录用于迭代 | 迭代 |
| `opsv review` | 启动 Web Review UI 页面服务 | 审阅 |
| `opsv script` | 从 shot_*.md 聚合生成 Script.md | 展示 |

---

## 核心命令详解

### opsv imagen
编译 Markdown 文档为图像生成任务，带 `--model` 参数时**直接编译**产出可执行 `.json`，不再生成 `imagen_jobs.json` 中间层。

**产出目录**：`opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json` 等

```bash
# 基本用法（必须指定 --model）
opsv imagen --model volcengine.seadream-5.0-lite

# 指定 manifest 路径
opsv imagen --model volcengine.seadream --manifest opsv-queue/videospec.circle1/_manifest.json

# 运行特定资产
opsv imagen --model volcengine.seadream --file hero

# 按 category 过滤
opsv imagen --model volcengine.seadream --category character

# 跳过特定状态（默认跳过 approved）
opsv imagen --model volcengine.seadream --status-skip approved,drafting

# 预览模式（不写文件）
opsv imagen --model volcengine.seadream --dry-run

# 不跳过任何状态
opsv imagen --model volcengine.seadream --status-skip none
```

**Manifest-First**：produce 命令只从 manifest 读取，不扫描目录

**Syncing Gate (v0.8.8)**：编译时验证所有 `@ref` 引用的资产状态。如果被引用资产是 `syncing`，跳过当前资产的编译并警告。`approved` 引用才能通过。

**参考图解析**（v0.8.3）：
- 编译时使用两种参考图来源：
  - `approvedRefs`：通过 `@assetId:variant` 引用其他文档时，`ApprovedRefReader` 读取被引用文档的 `## Approved References`
  - `designRefs`：自身文档的 `## Design References` 区域中的参考图，由 `DesignRefReader` 读取，作为 `reference_images` 传入生成 API
- 第一个参考图块 = `approvedRefs`（外部引用），第二个参考图块 = `designRefs`（内部参考）

### opsv animate
编译 shotlist.md 为视频任务，带 `--model` 参数时**直接编译**产出可执行 `.json`，不再生成 `video_jobs.json` 中间层。

**产出目录**：`opsv-queue/videospec.circleN/volcengine.seedance/shot_01.json` 等

```bash
# 基本用法（必须指定 --model）
opsv animate --model volcengine.seedance-2.0

# 指定 manifest 路径
opsv animate --model volcengine.seedance --manifest opsv-queue/videospec.circle1/_manifest.json

# 运行特定资产
opsv animate --model volcengine.seedance --file shot_01

# 按 category 过滤
opsv animate --model volcengine.seedance --category shot-production

# 预览模式
opsv animate --model volcengine.seedance --dry-run
```

**Manifest-First**：produce 命令只从 manifest 读取，不扫描目录。
**endcircle 条件**：`endcircle` 仅在最终层包含 `shotlist.md` 时使用。

### opsv comfy
ComfyUI 工作流编译为任务描述 JSON（inputs/outputs），带 `--model` 时直接产出可执行文件。

```bash
opsv comfy --model runninghub.flux-schnell
```

- 产出可执行任务 JSON，包含 inputs/outputs 声明
- Agent 从 `.agent/skills/` 找到对应 workflow，复制到 Provider 目录，注入变量
- ComfyUI Local 和 RunningHub 都是 `type: comfy`，只是 provider 不同

### opsv audio
音频生成（规划中）。

```bash
opsv audio --model <provider.model>
```

### opsv webapp
浏览器自动化（Chrome 扩展 HTTP API）。

```bash
opsv webapp --model webapp.gemini
opsv webapp --model webapp.jimeng --manifest opsv-queue/videospec.circle1/_manifest.json
opsv webapp --model webapp.wan --dry-run
```

**前提**：Chrome 扩展及其 Native Messaging Host 已启动，暴露 `http://127.0.0.1:9700`。
**编译后**：`opsv run <compiled-dir>` 执行。

### opsv run
按路径引用执行渲染任务，取代原 `opsv queue run`。

```bash
# 执行单个任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json

# 执行整个 Provider 目录下所有任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/

# 执行多个路径
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/shot_01.json \
       opsv-queue/videospec.circle1/volcengine.seadream_001/shot_02.json

# 重试失败任务
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/ --retry

# 设置并发数（覆盖 api_config 中的配置）
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/ --concurrency 3
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/ -c 3
```

**行为**：
- 传入 `.json` 文件路径时，直接执行该任务。
- 传入目录路径时，扫描该目录下所有 `.json` 任务文件顺序执行。
- 跳过已有产出结果的任务。
- 跳过已有 `_error.log` 的任务（除非 `--retry`）。
- 默认串行执行，写 JSONL 日志（`{jobId}.log`），失败写 `{jobId}_error.log`。
- 完成打印摘要，自动退出。

**并发控制（v0.8.14）**：
- 默认串行（`concurrency = 1`）。
- 可在 `api_config.yaml` 的 model 配置中设置 `concurrency: N` 来开启单 provider 内并发。
- CLI `--concurrency <number>` 或 `-c <number>` 可覆盖 api_config 中的配置。
- 并发优先级：`CLI flag > api_config > 默认 1`。
- 并发模式：provider 之间并行，provider 内部按并发数控制并行度。

```yaml
# api_config.yaml 示例
models:
  siliconflow.wani2v:
    provider: siliconflow
    concurrency: 3
```

**Agent 迭代操作（必须使用 `opsv iterate`）**：
```bash
# 克隆任务（序号递增）
opsv iterate opsv-queue/videospec.circle1/volcengine.seadream_001/@hero.json
# → 生成 @hero_2.json（自动删除 compiledAt，确保会被执行）
# 编辑 @hero_2.json（修改 prompt、seed 等字段）
opsv run opsv-queue/videospec.circle1/volcengine.seadream_001/@hero_2.json
# → 生成 @hero_2_1.png（id_N_1.ext 模式，Review 后为 syncing 状态）

# 克隆整个目录（目录内任务保持原始名称）
opsv iterate opsv-queue/videospec.circle1/volcengine.seadream_001/
# → 生成 volcengine.seadream_001_it_001/（目录下所有 task JSON 被复制）
```

### opsv circle

Circle（环）依赖层次的状态管理与拓扑刷新。**每次文档变更后必须重新执行**，不可依赖缓存结果。

```bash
opsv circle create --dir videospec           # 新建并激活依赖图
opsv circle create --dir episode_2            # 多剧集
opsv circle create --dir videospec --name custom  # 覆盖 basename
opsv circle create --dir videospec --skip-middle-circle  # 简化模式（合并中间层）

opsv circle refresh                           # 实时扫描 + 依赖分析，自动写入各 .circleN/_manifest.json
```

**设计哲学**：Circle 不是静态配置，而是文档依赖关系的**动态投影**。`opsv circle refresh` 每次运行都会：
1. 重新扫描 `--dir` 指定目录下所有 `.md` 文件
2. 从 frontmatter 的 `refs` 字段重建依赖图
3. 拓扑排序得到 Circle 分层（zerocircle → firstcircle → secondcircle → ...）
4. 读取每个文档的 `## Approved References` 区域统计批准状态
5. 自动写入各 `opsv-queue/{basename}.circleN/_manifest.json`

**参考图区域职责**（v0.8.3）：
- `## Approved References` — **输出侧**：审阅通过后的定档图像，供其他文档通过 `@assetId:variant` 引用
- `## Design References` — **输入侧**：文档自带的设计参考图，编译时作为 `reference_images` 传入生成 API

**触发时机**（文档变更后必须刷新）：

| 事件 | 必须执行的命令 | 原因 |
|------|---------------|------|
| 新增/修改/删除 `.md` 文件 | `opsv circle refresh` | `refs` 依赖关系可能改变，资产可能重新分层 |
| Review Approve 后 | `opsv circle refresh` | 批准状态变更，可能解锁下一 Circle |
| Review Draft 后 | `opsv circle refresh` | 批准状态回退，必须阻断下游 Circle |
| 迭代重生成（修改 prompt 重跑） | `opsv circle refresh` | 旧版本不再有效 |
| 手动修改 `## Approved References` | `opsv circle refresh` | 验证引用路径有效性 |

**输出解读与 Agent 决策**：

```
  ✅ firstcircle: 8 个资产 (8 已批准)
  ⏳ secondcircle: 5 个资产 (2 已批准)
  ⭕ endcircle: 3 个资产 (0 已批准)
```

- **⭕ 未开始**：该 Circle 无任何 approved 资产 → **禁止启动下游**，优先执行本 Circle `imagen` / `animate`
- **⏳ 进行中**：部分 approved → **继续完成**未批准资产，仍禁止启动下游
- **✅ 已完成**：全部 approved → **允许晋升**下一 Circle，_manifest.json 由 `opsv circle refresh` 自动写入

**典型状态检查流**：

```bash
# 1. 文档变更后，先校验再刷新
opsv validate
opsv circle refresh

# 2. 确认全部 approved 后，直接生成下游任务
opsv animate --model volcengine.seedance-2.0
```

### opsv review
启动基于 Express 的本地 Web Review UI（默认端口 3456）。

**参数**:
- `--circle [path]`：启用基于 manifest 的 Review 模式。
  - 无 path 时自动发现最新 manifest。
  - 可传入 Circle 目录或 manifest 文件路径。
  - 适用于从 `opsv circle create/refresh` 生成的 `_manifest.json` 进行审阅。

**功能**:
- **视觉反馈**: 实时对比多模型生成结果。
- **Approve 条件判断**（根据生成物文件名自动决定）：
  - `id_1.ext`（如 `@hero_1.png`）→ 原始任务 → 直接 `approved`
  - `id_2_1.ext`（如 `@hero_2_1.png`）→ 修改任务 → `syncing` + review 记录追加 `modified_task` 路径
- **CLI 非冲突原则**：Review approve 绝不修改 `prompt_en` 等内容字段，仅追加 review 记录 + 设置状态。
- `syncing` 资产需 Agent 检查 review 记录中的 `modified_task`，对齐文档描述字段后改为 `approved`。
- Review 后刷新 circle：`opsv circle refresh`；有变化 → 继续当前 Circle；全部 approve → 可晋升下一环。

---

## 目录结构参考 (v0.8)

```
opsv-queue/                                    # 渲染产物目录
├── videospec.circle1/                        # Circle 目录（basename.circleN 格式）
│   ├── _manifest.json                        # 该 Circle 资产清单 + 状态快照（含 assets 字段）
│   └── volcengine.seadream/                  # Provider.Model 扁平目录
│       ├── @hero.json                        # 初始编译的任务
│       ├── @hero_1.png                       # 初始编译的产出
│       ├── @hero_2.json                      # 修改后的任务（序号递增）
│       └── @hero_2_1.png                     # 修改任务的产出（id_N_1.ext 模式）
└── videospec.circle2/                        # 后续 Circle（批次号递增）
    ├── _manifest.json
    └── volcengine.seedance/
        ├── shot_01.json
        └── shot_01_1.mp4
```

---

## 典型生产流 (Standard Workflow)

1. **`opsv init`**: 建立项目基础。
2. **创意阶段**: 在 `elements/`, `scenes/`, `shots/` 下编写 Markdown，聚焦 `## Vision`。
3. **`opsv validate`**: 校验文档与引用死链。
4. **`opsv circle refresh`**: 确认依赖关系与 Circle 执行顺序。
5. **`opsv imagen --model <provider.model>`**: 生成图像任务并直接编译。
6. **`opsv run <paths...>`**: 执行渲染。
7. **`opsv review`**: 通过 Web 界面进行审美决策。
8. **下一 Circle**: 基于 approved 资产，继续 FirstCircle → ... → EndCircle。
9. **`opsv animate --model <provider.model>`**: 生成视频任务并直接编译。
10. **`opsv run <paths...>`**: 视频渲染。

# CLI 命令参考

> 当前版本：v0.8 (Layer-Based Execution)

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
| `opsv app --model` | WebApp 生成 | 应用管线 |
| `opsv run <paths...>` | 按路径引用执行渲染任务 | 执行 |
| `opsv review` | 启动 Web Review UI 页面服务 | 审阅 |
| `opsv script` | 从 shot_*.md 聚合生成 Script.md | 展示 |

---

## 核心命令详解

### opsv imagen
编译 Markdown 文档为图像生成任务，带 `--model` 参数时**直接编译**产出可执行 `.json`，不再生成 `imagen_jobs.json` 中间层。

**产出目录**：`opsv-queue/videospec/<circle>/volcengine.seadream/shot_01.json` 等

```bash
# 基本用法（必须指定 --model）
opsv imagen --model volcengine.seadream-5.0-lite

# 指定圈层
opsv imagen --model volcengine.seadream-5.0-lite --circle firstcircle

# 使用别名
opsv imagen --model volc.sd5lite

# 预览模式（不写文件）
opsv imagen --model volcengine.seadream-5.0-lite --preview

# 强制重新生成已 approved 资产
opsv imagen --model volcengine.seadream-5.0-lite --no-skip-approved

# 跳过依赖层级检查
opsv imagen --model volcengine.seadream-5.0-lite --skip-circle-check
```

**圈层隔离**：前置圈层未 approved → 报错；指定文件不属于目标圈层 → 报错

**`--skip-approved` 默认开启**：已有 approved 参考图的资产自动跳过，避免重复生成。需强制生成时用 `--no-skip-approved`

**`--skip-circle-check`**：跳过依赖层级检查

### opsv animate
编译 Shotlist.md 为视频任务，带 `--model` 参数时**直接编译**产出可执行 `.json`，不再生成 `video_jobs.json` 中间层。

**产出目录**：`opsv-queue/videospec/endcircle/volcengine.seedance/shot_01.json` 等

```bash
# 基本用法（必须指定 --model）
opsv animate --model volcengine.seedance-2.0

# 指定圈层
opsv animate --model volcengine.seedance-2.0 --circle endcircle

# 使用别名
opsv animate --model volc.sd2

# 跳过上游 Circle 检查
opsv animate --model volcengine.seedance-2.0 --skip-circle-check
```

**Circle 自动推断**：未指定 `--circle` 时自动推断当前开放的 Circle。
**上游 Circle 检查**：执行前检测上游 Circle 是否全部 approved，未 approved 时阻止执行（可 `--skip-circle-check` 跳过）。
**EndCircle 必须是 `shotlist.md`**。

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

### opsv app
WebApp 生成。

```bash
opsv app --model <provider.model>
```

### opsv run
按路径引用执行渲染任务，取代原 `opsv queue run`。

```bash
# 执行单个任务
opsv run opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01.json

# 执行整个 Provider 目录下所有任务
opsv run opsv-queue/videospec/zerocircle/volcengine.seadream/

# 执行多个路径
opsv run opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01.json \
       opsv-queue/videospec/zerocircle/volcengine.seadream/shot_02.json

# 重试失败任务
opsv run opsv-queue/videospec/zerocircle/volcengine.seadream/ --retry
```

**行为**：
- 传入 `.json` 文件路径时，直接执行该任务。
- 传入目录路径时，扫描该目录下所有 `.json` 任务文件顺序执行。
- 跳过已有产出结果的任务。
- 跳过已有 `_error.log` 的任务（除非 `--retry`）。
- 顺序执行，写 JSONL 日志（`{jobId}.log`），失败写 `{jobId}_error.log`。
- 完成打印摘要，自动退出。

**Agent 直接操作**：
```bash
# 复制并修改任务
cp opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01.json \
   opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01_v2.json
# 编辑 shot_01_v2.json 的 prompt 字段
opsv run opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01_v2.json
# → 生成 shot_01_v2.png
```

### opsv circle

Circle（环）依赖层次的状态管理与拓扑刷新。**每次文档变更后必须重新执行**，不可依赖缓存结果。

```bash
opsv circle create --dir videospec           # 新建并激活依赖图
opsv circle create --dir episode_2            # 多剧集
opsv circle create --dir videospec --skip-middle-circle  # 简化模式（所有非 shotlist 归 zerocircle）

opsv circle refresh                           # 实时扫描 + 依赖分析，自动写入 opsv-queue/videospec/_manifest.json
```

**设计哲学**：Circle 不是静态配置，而是文档依赖关系的**动态投影**。`opsv circle refresh` 每次运行都会：
1. 重新扫描 `videospec/` 下所有 `.md` 文件
2. 从 frontmatter 的 `refs` 字段重建依赖图
3. 拓扑排序得到 Circle 分层（ZeroCircle → FirstCircle → ...）
4. 读取每个文档的 `## Approved References` 区域统计批准状态
5. 自动写入 `opsv-queue/videospec/_manifest.json`

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
  ✅ FirstCircle: 8 个资产 (8 已批准)
  ⏳ SecondCircle: 5 个资产 (2 已批准)
  ⭕ ThirdCircle: 3 个资产 (0 已批准)
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

**功能**:
- **视觉反馈**: 实时对比多模型生成结果。
- **Approve 闭环**: Approve 后直接引用原队列路径（`opsv-queue/...`）。
- Review 后刷新 circle：`opsv circle refresh`；有变化 → 继续当前 Circle；全部 approve → 可晋升下一环。

---

## 目录结构参考 (v0.8)

```
opsv-queue/                         # 渲染产物目录
└── videospec/                     # 按 graphName 组织
    ├── _manifest.json              # 状态快照（opsv circle refresh 写入）
    ├── zerocircle/                # Circle 目录，无迭代后缀
    │   ├── _assets.json           # 该 Circle 资产清单
    │   └── volcengine.seadream/   # Provider.Model 扁平目录
    │       ├── shot_01.json       # 可执行 API 请求体
    │       └── shot_01.png        # 产出文件
    └── endcircle/
        ├── _assets.json
        └── volcengine.seedance/
            ├── shot_01.json
            └── shot_01.mp4
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

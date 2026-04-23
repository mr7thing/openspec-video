# CLI 命令参考 (v0.6.4)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv circle status` | 查看各 Circle 完成状态 | 状态检查 |
| `opsv circle manifest` | 生成 Circle 状态清单 | 状态检查 |
| `opsv deps` | 分析资产依赖关系 | 分析 |
| `opsv imagen` | 编译文档为图像意图列表 (jobs.json) | 意图编译 |
| `opsv animate` | 编译 Shotlist 为视频意图列表 | 视频管线 |
| `opsv comfy` | 编译 ComfyUI 工作流任务 | 工作流管线 |
| `opsv validate` | 验证 Markdown 文档的 YAML frontmatter | 质检 |
| `opsv queue compile` | 将意图编译为 API 原子任务并入队 | 任务投递 |
| `opsv queue run` | 启动 QueueWatcher 消费任务 | 任务执行 |
| `opsv review` | 启动 Review 页面服务 | 审阅 |
| `opsv addons` | 管理扩展插件与技能包 | 扩展 |

> **v0.6.4 重大变更**：`opsv generate` 已被废除，拆分为 `opsv imagen` / `opsv animate` / `opsv comfy`。所有执行通过 `opsv queue compile` + `opsv queue run` 统一管线完成。

---

## opsv init

初始化 OpsV 项目结构。

```bash
# 交互模式
opsv init

# 非交互模式（通过 flag 指定 AI 助手）
opsv init my-project --claude --codex
```

### 选项

| 选项 | 说明 |
|------|------|
| `-g, --gemini` | 初始化 Gemini 支持 |
| `-c, --claude` | 初始化 Claude Code 支持 |
| `-x, --codex` | 初始化 Codex/Cursor 支持 |
| `-o, --opencode` | 初始化 OpenCode 支持 |
| `-t, --trae` | 初始化 Trae 支持 |

### 创建的目录结构
```
project/
├── .agent/
├── .env/                   # API 配置模板
├── .opsv/                  # 运行时状态
├── opsv-queue/             # 统一任务队列与资产落盘
│   ├── circle_manifest.json
│   ├── zerocircle_1/
│   ├── firstcircle_1/
│   ├── secondcircle_1/
│   └── frames/
├── videospec/{stories,elements,scenes,shots}/
└── .gitignore              # 内建生成
```

---

## opsv circle status

查看各 Circle 完成状态。

```bash
opsv circle status
```

输出示例：
```
📊 Circle 状态

  zerocircle_1:   12/15 completed
  firstcircle_1:  0/8 pending (等待 zerocircle_1)
  secondcircle_1: 0/24 pending (等待 firstcircle_1)
```

---

## opsv circle manifest

生成 `opsv-queue/circle_manifest.json`，记录各环任务清单。

```bash
opsv circle manifest
```

---

## opsv deps

分析资产依赖关系，显示推荐生成顺序。

```bash
opsv deps
```

输出示例：
```
📊 依赖图分析

  ✅ elder_brother (无依赖)
  ⚠️ younger_brother (依赖 elder_brother)
  ✅ classroom (无依赖)

推荐生成顺序:
  第1层: elder_brother, classroom (无依赖，可立即生成)
  第2层: younger_brother

已保存 .opsv/dependency-graph.json
```

---

## opsv validate

验证 `videospec/` 目录中 Markdown 文档的 YAML frontmatter 是否符合 Zod schema。

```bash
# 验证当前目录
opsv validate

# 指定目录
opsv validate -d ./videospec

# 自动修复（预留）
opsv validate --fix
```

### 校验规则

| 字段 | 约束 |
|------|------|
| `type` | 必须是 `character`/`prop`/`costume`/`scene`/`shot-design`/`shot-production`/`project` |
| `status` | 必须是 `drafting` 或 `approved` |
| `visual_detailed` | 长文本字段必须使用折叠块语法 (`>`) |

### 产出
- 输出每个文件的校验结果，包含行号和修复建议
- 返回码：0（全部通过）/ 1（发现问题）

---

## opsv imagen

编译 Markdown 文档为图像生成意图列表。

```bash
# 编译全部图像资产
opsv imagen

# 编译指定目录或文件
opsv imagen videospec/elements

# 指定 Circle
opsv imagen --circle zerocircle_1
```

### 选项

| 选项 | 说明 |
|------|------|
| `--circle <name>` | 指定输出 Circle 目录 |

### 产出
- `opsv-queue/<circle>/imagen_jobs.json` — 纯业务意图，不含 API 特定参数

---

## opsv animate

编译 Shotlist.md 为视频生成意图列表。

```bash
# 编译全部视频资产
opsv animate

# 自动推断依赖图末端环
opsv animate --circle auto
```

### 选项

| 选项 | 说明 |
|------|------|
| `--circle auto` | 自动推断依赖图末端环 |

### 产出
- `opsv-queue/<endcircle>/video_jobs.json`

---

## opsv comfy

编译 ComfyUI 工作流任务。

```bash
opsv comfy compile <workflow.json> --provider <comfyui_local|runninghub> --circle <name>
```

### 选项

| 选项 | 说明 |
|------|------|
| `--provider <name>` | 指定 ComfyUI Provider（comfyui_local / runninghub） |
| `--circle <name>` | 指定输出 Circle 目录 |

### 产出
- `opsv-queue/<circle>/<provider>/queue_{N}/`

---

## opsv queue compile

将意图列表编译为特定 API Provider 的原子任务卡片并入队。

```bash
# 原生 API 投递（Volcengine / SiliconFlow / Minimax）
opsv queue compile <jobs.json> --provider volcengine [--circle <name>]

# ComfyUI 工作流投递
opsv queue compile <jobs.json> --provider runninghub
```

### 编译器路由

| Provider | 编译器 | 说明 |
|----------|--------|------|
| `comfyui_local` / `runninghub` | `ComfyUITaskCompiler` | 加载 Addon 中的 JSON 工作流模板 |
| 其他 (volcengine, siliconflow, minimax...) | `StandardAPICompiler` | 生成标准 HTTP API payload |

### 入队流程细节

1. `queue compile` 读取 `jobs.json`
2. 检查 `api_config.yaml` 中启用的 Provider
   - Provider 本身没有 `enable` 属性，继承自子模型
   - 只有子模型 `enable !== false` 且 `type` 匹配任务类型的 Provider 才会被选中
3. Provider 从 `.env/secrets.env` 读取 API Key
4. 在 `opsv-queue/<circle>/<provider>/` 下创建新 batch：`queue_{max+1}/`
   - 每次 `compile` 都新建 batch，不会追加到已有 batch
5. 任务写入 `queue.json` manifest，意图写入 `{taskId}.json`

---

## opsv queue run

启动 QueueWatcher，单线程消费指定 Provider 的待执行任务。

```bash
opsv queue run volcengine
opsv queue run siliconflow
opsv queue run minimax
opsv queue run comfyui_local
opsv queue run runninghub
```

### 执行机制

- **单线程消费**：QueueWatcher 逐一轮询 manifest，处理完一个再拉下一个
- **Manifest 状态流**：`queue.json` 中的任务状态在 `pending → processing → completed/failed` 间流转
- **断点恢复**：Ctrl+C 中断后，当前 `processing` 任务自动回写为 `pending`，下次启动继续消费
- **单进程安全**：同一批次只能有一个 QueueWatcher 实例消费，通过进程级隔离避免并发冲突
- **Provider 名称不区分大小写**：`Volcengine` 与 `volcengine` 均可

### 执行流程细节

1. `queue run <provider>` 启动 `QueueWatcher`，自动绑定最新的 `opsv-queue/<circle>/<provider>/queue_{N}/`
2. `QueueWatcher` 读取 `queue.json` manifest，取第一个 `status: pending` 任务
3. 更新 manifest：将该任务状态设为 `processing`，记录 `currentTaskId`
4. 读取同目录下的 `{taskId}.json` 获取完整任务意图（intention）
5. 调用对应 Provider 的 `processTask()`，传入意图与输出路径
6. Provider 调用远程 API，下载结果到同批次目录：`opsv-queue/<circle>/<provider>/queue_{N}/{jobId}_{seq}.png`
7. 更新 `queue.json` 状态为 `completed`（含结果路径）或 `failed`（含错误信息）

### 支持的 Provider

| Provider | 说明 |
|----------|------|
| `comfyui_local` | 本地 ComfyUI 实例 |
| `runninghub` | RunningHub 云端 ComfyUI |
| `volcengine` | 火山引擎（SeaDream 图像 + Seedance 视频） |
| `siliconflow` | SiliconFlow（Qwen 图像 + Wan 视频） |
| `minimax` | MiniMax（图像/视频） |

---

## opsv review

启动本地 Review 页面服务。

```bash
# 启动 Review 服务（默认端口 3456）
opsv review

# 指定端口
opsv review -p 8080

# 指定批次
opsv review -b 3
```

Review 页面功能：
- 📸 按 Job 分组展示候选图（支持多模型对比）
- ✅ 多选 Approve（支持自定义变体名，默认使用序号）
- 📝 Draft 打回（记录修改意见供下轮迭代参考）
- 📋 格式检查（检查 frontmatter 缺失字段）
- 🔄 自动 `git commit`

Approve 操作自动执行：
1. 向源 Markdown 文档的 `## Approved References` 区追加引用（图片保持在原队列目录中，通过相对路径引用）
2. 更新 `status: approved`
3. 追加 `reviews` 记录
4. 执行 `git add . && git commit`

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 服务端口 | `3456` |
| `-b, --batch <num>` | 指定批次号（默认最新） | 最新 |

---

## opsv addons

管理项目扩展插件与领域技能包。

```bash
# 安装插件包 (.zip)
opsv addons install <zip>
```

安装行为：
- 自动校验当前目录是否为有效的 OpsV 项目
- 将 Zip 包中的 `.agent/` 目录合并到当前项目
- 成功后自动列出新增的专家技能列表

---

## 典型工作流

```bash
# 1. 初始化
opsv init

# 2. 编写文档（elements/*.md, scenes/*.md, Script.md）

# 3. 分析依赖
opsv deps

# 4. 查看当前环状态
opsv circle status

# 5. 生成图像意图
opsv imagen

# 6. 编译入队
opsv queue compile opsv-queue/zerocircle_1/imagen_jobs.json --provider volcengine

# 7. 执行任务
opsv queue run volcengine

# 8. 审阅 & Approve
opsv review

# 9. 迭代（回到步骤 4，依赖图会自动更新）

# 10. 视频管线
opsv animate
opsv queue compile opsv-queue/secondcircle_1/video_jobs.json --provider seedance
opsv queue run seedance
```

---

> *"命令是意志的延伸，管线是纪律的化身。"*
> *OpsV 0.6.4 | 最后更新 2026-04-22*

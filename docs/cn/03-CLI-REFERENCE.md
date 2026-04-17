# CLI 命令参考 (v0.6.0)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv generate` | 编译文档为意图大纲 (jobs.json) | 意图编译 |
| `opsv queue compile` | 将意图编译为 API 原子任务 | 任务投递 |
| `opsv queue run` | 启动 QueueWatcher 消费任务 | 任务执行 |
| `opsv review` | 启动 Review 页面服务 | 审阅 |
| `opsv deps` | 分析资产依赖关系 | 分析 |
| `opsv animate` | 编译 Shotlist 为视频意图 | 视频管线 |
| `opsv addons` | 管理扩展插件与技能包 | 扩展 |
| `opsv daemon` | 全局后台服务管理 | 基础设施 |

> **v0.6.0 重大变更**：`opsv gen-image` 和 `opsv gen-video` 已被废除。所有执行通过 `opsv queue compile` + `opsv queue run` 统一管线完成。

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
├── videospec/{stories,elements,scenes,shots}/
├── .agent/{Creative,Guardian,Runner}-Agent.md + skills/
├── .env/                   # API 配置模板
├── .opsv/                  # 运行时状态 (v0.6 新增)
├── .opsv-queue/            # Spooler 信箱 (v0.6 新增)
├── artifacts/
├── queue/
└── .gitignore              # 内建生成 (v0.6 新增)
```

---

## opsv generate

编译 Markdown 文档为纯意图大纲。

```bash
# 编译全部规范目录
opsv generate

# 编译指定目录或文件
opsv generate videospec/elements

# 预览模式（仅生成第一个分镜）
opsv generate -p

# 指定分镜
opsv generate --shots 1,5,12
```

> **v0.6.0 变更**：Generate 回归本位，仅输出 `queue/jobs.json` 意图大纲。不再主动唤起任何执行管线或守护进程。

### 选项

| 选项 | 说明 |
|------|------|
| `-p, --preview` | 预览模式，仅生成第一个分镜 |
| `--shots <list>` | 逗号分隔的分镜 ID 列表 |

### 产出
- `queue/jobs.json` — 纯业务意图，不含 API 特定参数

---

## opsv queue compile

将意图大纲编译为特定 API Provider 的原子任务卡片。

```bash
# 原生 API 投递（SeaDream / Minimax / SiliconFlow）
opsv queue compile queue/jobs.json --provider seadream

# ComfyUI 工作流投递
opsv queue compile queue/jobs.json --provider runninghub
```

### 编译器路由

| Provider | 编译器 | 说明 |
|----------|--------|------|
| `comfyui_local` / `runninghub` | `ComfyUITaskCompiler` | 加载 Addon 中的 JSON 工作流模板 |
| 其他 (seadream, minimax...) | `StandardAPICompiler` | 生成标准 HTTP API payload |

### 产出
- 每个 Job 被切碎为独立的 `UUID.json` 文件
- 投递到 `.opsv-queue/pending/{provider}/` 目录

---

## opsv queue run

启动 QueueWatcher，单线程消费指定 Provider 的待执行任务。

```bash
opsv queue run seadream
opsv queue run minimax
opsv queue run siliconflow
opsv queue run comfyui_local
opsv queue run runninghub
```

### 执行机制
- **单线程安全**：逐一提取任务，处理完一个再拉下一个
- **物理状态流转**：`pending → processing → completed/failed`
- **断点恢复**：Ctrl+C 中断后，`processing` 中的任务不会丢失
- **Provider 名称不区分大小写**：`SeaDream` 和 `seadream` 均可

### 支持的 Provider

| Provider | 说明 |
|----------|------|
| `comfyui_local` | 本地 ComfyUI 实例 |
| `runninghub` | RunningHub 云端 ComfyUI |
| `seadream` | 火山引擎 SeaDream 图像 |
| `siliconflow` | SiliconFlow 图像/视频 |
| `minimax` | MiniMax 图像 |

---

## opsv review

启动本地 Review 页面服务。

```bash
# 启动 Review 服务（端口默认读取 OPSV_REVIEW_PORT 环境变量）
opsv review

# 指定端口
opsv review -p 8080

# 指定批次号
opsv review -b 3
```

Review 页面功能：
- 📸 按 Job 分组展示候选图（支持多模型对比）
- ✅ 多选 Approve（支持自定义变体名，默认使用序号）
- 📝 Draft 打回（记录修改意见供下轮迭代参考）
- 📋 格式检查（检测 frontmatter 缺失字段）
- 🔄 自动 `git commit`

Approve 操作自动执行：
1. 复制选中图片到 `artifacts/` 并重命名
2. 回写 `## Approved References` 到源文档
3. 更新 `status: approved`
4. 追加 `reviews` 记录
5. 执行 `git add . && git commit`

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 服务端口 | `OPSV_REVIEW_PORT` 或 `3456` |
| `-b, --batch <num>` | 指定批次号（默认最新） | 最新 |

---

## opsv deps

分析资产依赖关系，显示推荐生成顺序。

```bash
opsv deps
```

输出示例：
```
📊 依赖图分析:

  ✅ elder_brother (无依赖)
  ⚠️ younger_brother (依赖 elder_brother)
  ✅ classroom (无依赖)

推荐生成顺序:
  第1批: elder_brother, classroom (无依赖，可立即生成)
  第2批: younger_brother

已保存: .opsv/dependency-graph.json
```

---

## opsv animate

编译 Shotlist.md 为视频生成意图。

```bash
opsv animate
```

---

## opsv daemon

全局后台服务管理（支持 Chrome 浏览器扩展连接）。

```bash
opsv daemon start    # 启动（端口读取 OPSV_DAEMON_PORT 或默认 3061）
opsv daemon stop     # 停止
opsv daemon status   # 查看状态
```

---

## opsv addons

管理项目扩展插件与领域技能包。

```bash
# 安装插件包 (.zip)
opsv addons install ./addons/comic-drama-v0.6.zip
```

安装行为：
- 自动校验当前目录是否为有效的 OpsV 项目。
- 将 Zip 包中的 `.agent/` 目录合并到当前项目。
- 成功后自动列出新增的专家技能列表。

---

## 典型工作流

```bash
# 1. 初始化
opsv init

# 2. 编写文档（elements/*.md, scenes/*.md, Script.md）

# 3. 分析依赖
opsv deps

# 4. 编译意图
opsv generate

# 5. 投递到指定 API
opsv queue compile queue/jobs.json --provider seadream

# 6. 执行任务
opsv queue run seadream

# 7. 审阅 & Approve
opsv review

# 8. 迭代（回到步骤 4，依赖图会自动更新）

# 9. 视频管线
opsv animate
opsv queue compile queue/video_jobs.json --provider seedance
opsv queue run seedance
```

---

> *"命令是意志的延伸，管线是纪律的化身。"*
> *OpsV 0.6.0 | 最后更新: 2026-04-17*

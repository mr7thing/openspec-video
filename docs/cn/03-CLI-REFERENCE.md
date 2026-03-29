# OpsV CLI 命令参考手册 (CLI Reference)

> 覆盖全部 CLI 命令的语法、参数、选项和使用示例。

---

## 命令速查表

| 命令 | 职责 | 关键选项 |
|------|------|---------|
| `opsv init` | 初始化项目 | `[projectName]` |
| `opsv serve` | 启动后台服务 | — |
| `opsv start` | `serve` 别名 | — |
| `opsv stop` | 停止后台服务 | — |
| `opsv status` | 查看服务状态 | — |
| `opsv generate` | 编译图像任务 | `--preview`, `--shots` |
| `opsv gen-image` | 执行图像生成 | `--model`, `-c`, `--dry-run` |
| `opsv review` | 回写文档 | `--all`, `[path]` |
| `opsv animate` | 编译视频任务 | — |
| `opsv gen-video` | 执行视频生成 | `--model`, `--dry-run` |

---

## 1. `opsv init [projectName]`

初始化一个新的 OpsV 视频项目。

### 语法
```bash
opsv init              # 在当前目录初始化
opsv init my-mv        # 创建并初始化 my-mv 目录
```

### 交互流程
执行后会弹出交互式选择菜单：
```
? Select the AI assistants you want to support:
  ◉ Gemini (Legacy - GEMINI.md)
  ◯ OpenCode (AGENTS.md + .opencode)
  ◯ Trae (AGENTS.md + .trae)
```

### 执行动作
1. 创建目标目录（如不存在）
2. 复制基础模板：`.agent/`、`.antigravity/`、`.env/`
3. 按选择复制 `GEMINI.md`、`AGENTS.md`、`.opencode/`、`.trae/`
4. 创建规范目录结构：`videospec/stories|elements|scenes|shots`、`artifacts/`、`queue/`

### 注意事项
- 如果目标目录已存在，命令会报错终止
- 模板来源于 npm 包内的 `templates/` 目录

---

## 2. `opsv serve`

启动 OpsV 后台 WebSocket 守护进程，并将当前项目注册到全局服务。

### 语法
```bash
opsv serve
```

### 行为
1. 检查守护进程是否已运行（通过 `~/.opsv/daemon.pid` 文件）
2. 如未运行，以 `detached` 模式启动 `daemon.js`
3. 将当前项目注册到全局守护进程（WebSocket `ws://127.0.0.1:3061`）

### PID 文件
- 路径：`~/.opsv/daemon.pid`
- 守护进程监听：`ws://127.0.0.1:3061`

> **`opsv start`** 是 `serve` 的完全等价别名。

---

## 3. `opsv stop`

停止 OpsV 后台守护进程。

### 语法
```bash
opsv stop
```

### 行为
1. 读取 `~/.opsv/daemon.pid` 获取进程 ID
2. 发送 kill 信号终止进程
3. 删除 PID 文件

---

## 4. `opsv status`

查看 OpsV 后台守护进程的运行状态。

### 语法
```bash
opsv status
```

### 输出示例
```
✅ OpsV Server is RUNNING (PID: 12345)
   Listening on: ws://127.0.0.1:3061
```
或
```
🔴 OpsV Server is STOPPED
```

---

## 5. `opsv generate [targets...]`

将 Markdown 叙事规范"编译"为 JSON 任务队列。这是图像生成管线的核心入口。

### 语法
```bash
opsv generate                     # 编译全部规范目录
opsv generate videospec/elements  # 只编译资产目录
opsv generate Script.md           # 只编译特定文件
```

### 选项

| 选项 | 说明 |
|------|------|
| `-p, --preview` | 预览模式：仅生成关键镜头/单张角色设定图 |
| `--shots <list>` | 指定镜头 ID，逗号分隔（如 `--shots 1,5,12`） |

### 行为
1. 解析目标路径下的 `.md` 文件
2. 提取 YAML Frontmatter 中的镜头/资产定义
3. 解析 `@` 引用，将实体特征注入提示词
4. 注入 `project.md` 中 `global_style_postfix` 全局后缀
5. 输出 `queue/jobs.json`
6. 自动启动守护进程（如未运行）
7. 注册项目到全局服务

### 使用示例

```bash
# 编译全部，生成完整的 jobs.json
opsv generate

# 预览模式，快速试看关键镜头
opsv generate --preview

# 只编译第 1、3、7 号镜头
opsv generate --shots 1,3,7

# 只编译资产目录中的角色定义
opsv generate videospec/elements
```

### 产物
- `queue/jobs.json` — 包含所有待执行的图像生成任务

---

## 6. `opsv gen-image`

执行图像生成任务。读取 `queue/jobs.json` 中的图像任务，调用 AI 渲染引擎批量生成图像。

> **0.4.1 变更**：由 `execute-image` 重命名为 `gen-image`。旧命令仍可使用（隐藏别名）。

### 语法
```bash
opsv gen-image [options]
```

### 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-m, --model <model>` | `all` | 目标渲染模型名称（默认自动横向遍历所有 `enabled: true` 的图像模型） |
| `-c, --concurrency <num>` | `1` | 并发任务数 |
| `-s, --skip-failed` | `false` | 单任务失败时继续执行 |
| `--dry-run` | `false` | 仅校验任务结构，不实际执行 |

### 前置条件
- `queue/jobs.json` 必须存在（先执行 `opsv generate`）
- API 密钥必须已配置（`SEADREAM_API_KEY` 或 `VOLCENGINE_API_KEY`）

### 使用示例

```bash
# 使用所有已启用的模型并发生成图像（默认行为）
opsv gen-image

# 仅使用指定模型，2 并发
opsv gen-image -m minimax-image-01 -c 2

# 仅校验不执行（排查配置问题）
opsv gen-image --dry-run

# 容错模式：单个失败不中断整体
opsv gen-image --skip-failed -c 3
```

### 产物
- `artifacts/drafts_N/` — 第 N 批次的渲染图像

### 关联模型
查看 `api_config.yaml` 中 `gen_command: "gen-image"` 的模型。

---

## 7. `opsv review [path]`

将生成的图像/视频结果"反哺"回源 Markdown 文档，方便导演在 IDE 中直接审阅。

### 语法
```bash
opsv review              # 回写最新一批
opsv review --all         # 回写所有历史批次
opsv review Script.md     # 只处理特定文件
```

### 选项

| 选项 | 说明 |
|------|------|
| `--all` | 包含所有历史批次（不仅限于最新的） |
| `[path]` | 指定要处理的文档路径 |

### 审阅方式
回写完成后，在 IDE（如 VS Code、Cursor）中打开 `.md` 文件的预览模式，即可直接看到所有候选图像。

---

## 8. `opsv animate`

将 `Shotlist.md` 中的动态运镜指令编译为视频生成任务队列。

### 语法
```bash
opsv animate
```

### 行为
1. 读取 `videospec/shots/Shotlist.md` 的 YAML Frontmatter
2. 提取每个 Shot 的 `motion_prompt_en`、`reference_image`、`duration` 等字段
3. 将相对路径自动转换为绝对路径
4. 支持多参考图（首帧、尾帧、特征图）的数组式传递
5. 输出 `queue/video_jobs.json`
6. 自动启动守护进程并注册项目

### 产物
- `queue/video_jobs.json` — 包含所有待执行的视频生成任务

---

## 9. `opsv gen-video`

> **0.4.1 新增命令**。执行视频生成任务，调用 Seedance / SiliconFlow 等视频模型。

### 语法
```bash
opsv gen-video [options]
```

### 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-m, --model <model>` | `all` | 目标视频模型名称（默认自动横向遍历所有 `enabled: true` 的视频模型） |
| `-s, --skip-failed` | `false` | 失败时的提示（单个视频生成管线为串行，不可跳过） |
| `--dry-run` | `false` | 仅校验任务结构，不实际执行 |

### 前置条件
- `queue/video_jobs.json` 必须存在（先执行 `opsv animate`）
- 对应 API 密钥已配置：
  - Seedance: `VOLCENGINE_API_KEY` 或 `SEEDANCE_API_KEY`
  - SiliconFlow: `SILICONFLOW_API_KEY`

### 执行模式
**串行执行**（非并发）。原因：视频任务间可能存在 `@FRAME` 依赖链——后一镜头的首帧需要截取前一镜头的尾帧。`VideoModelDispatcher` 会自动处理：

```
shot_1 生成完毕 → 截取 shot_1_last.jpg → 注入 shot_2.first_image → shot_2 开始生成
```

### 使用示例

```bash
# 使用所有已启用的模型（如 Minimax、Seedance 等）生成视频
opsv gen-video

# 仅使用指定模型
opsv gen-video -m wan2.2-i2v

# 仅校验不执行
opsv gen-video --dry-run
```

### 产物
- `artifacts/videos/` — 生成的视频文件（.mp4）

### 关联模型
查看 `api_config.yaml` 中 `gen_command: "gen-video"` 的模型。

---

## 完整管线命令流

```bash
# 图像管线
opsv generate → opsv gen-image → opsv review

# 视频管线
opsv animate  → opsv gen-video
```

---

## 环境变量

CLI 启动时按以下优先级加载环境变量：

| 优先级 | 路径 | 说明 |
|--------|------|------|
| 1（最高） | `.env/secrets.env` | 推荐的密钥存放位置 |
| 2 | `.env`（文件） | 标准 dotenv 文件（非目录） |
| 3 | 系统环境变量 | `process.env` 兜底 |

### 关键环境变量

| 变量名 | 用途 | 关联命令 |
|--------|------|---------|
| `VOLCENGINE_API_KEY` | 火山引擎 API 密钥（SeaDream / Seedance 等火山系服务统一鉴权） | `gen-image` / `gen-video` |
| `MINIMAX_API_KEY` | 稀宇科技 Minimax 海螺模型密钥 | `gen-image` / `gen-video` |
| `SILICONFLOW_API_KEY` | SiliconFlow API 密钥 | `gen-video` |

---

> *OpsV 0.4.3 | 最后更新: 2026-03-28*


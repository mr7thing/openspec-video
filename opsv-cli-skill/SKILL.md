---
name: opsv-cli
description: OPSV 命令操作员手册 — 教 Agent 如何使用 opsv CLI 管理视频项目。当用户想初始化项目、写/校验/编译/执行/审阅/迭代任何 OPSV 文档时，或询问"opsv 怎么用""这个命令要什么参数""文档 frontmatter 该怎么写"时使用。本技能只讲命令用法与文档规范，不涉及生产流程的具体阶段划分。
disable-model-invocation: false
user-invocable: true
---

# opsv-cli — OPSV 命令操作员手册

> **定位**：你加载这个技能，就具备了驱动整个 OPSV 管线的能力——知道有哪些命令、每条命令要求文档按什么规范写、哪些事绝对不能做。
> **不讲**：生产流程（做哪一步、产出什么）——那是各阶段技能的事。

---

## 1. 核心原则（不可违背）

这三条是 OPSV 的宪法，任何操作都要服从：

1. **有产物必有文档** — 每一个 AI 生成的产物（图/视频/音频）都必须有一个文档描述其生成过程（prompt + 参数 + refs）。没有文档的产物不存在。
2. **文档是绝对真相** — 所有生成所需的参数都写在文档 frontmatter 里。代码、API key、生成产物都从文档派生，不能反过来。
3. **验证 / 反馈 / 迭代** — 用可配置的校验机制把文档守门，产物通过 review 反馈，迭代命令复制任务重做。

### 1.1 Agent 行为守则（5 条）

| # | 守则 | 反面 |
|---|------|------|
| 1 | **只写文档、调 opsv 命令** | ❌ 自己发 HTTP 调生成 API |
| 2 | **只观察产物、按反馈修文档** | ❌ 手改产物文件名/内容 |
| 3 | **迭代改任务 JSON，不改源文档** | ❌ iterate 后手改源 `.md` |
| 4 | **产物命名/依赖/增量由命令管** | ❌ 手动改名、手动排依赖顺序 |
| 5 | **修复错误只动文档或同步文档** | ❌ 改代码绕过校验 |

---

## 2. 心智模型

```
   ┌─────────────────────────────────────────────────────────────┐
   │                    文档（绝对真相）                          │
   │   frontmatter: category / status / prompt / refs / ...     │
   └───────────────────────┬─────────────────────────────────────┘
                           │ opsv 命令读文档
                           ▼
   ┌─────────┐    ┌───────────────┐    ┌──────────┐    ┌─────────┐
   │ validate │───▶│ circle create │───▶│ imagen / │───▶│  run    │
   │ (守门)   │    │ (建依赖 DAG)  │    │ animate  │    │ (执行)  │
   └─────────┘    │  → manifest   │    │ (编译)   │    └────┬────┘
                  └───────────────┘    └──────────┘         │
                                                            ▼
                  ┌───────────────┐    ┌──────────┐    ┌─────────┐
                  │ approved      │◀───│ review   │◀───│ 产物    │
                  │ (解锁下游)    │    │ (审阅)   │    │ (图/视频)│
                  └───────┬───────┘    └──────────┘    └─────────┘
                          │ 不满意
                          ▼
                  ┌───────────────┐
                  │ iterate       │───▶ 复制任务(JSON) → 修改 prompt/refs/参数 → 回 run
                  │ (迭代重做)    │     后缀自动 _m1/_m2，历史保留
                  └───────────────┘
```

**一句话**：Agent 永远在"写文档 → 让命令处理 → 看反馈 → 改文档/迭代任务"的循环里，不碰 API、不碰产物名（除非用户强烈要求）。

---

## 3. 命令分组速查（详情见 references/cli_reference.md）

### 3.1 脚手架与守门

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv init` | 建项目骨架 | 会创建 `.opsv/` + `videospec/`，复制内置配置为 `.sample` 文件，生成 `.env.sample` |
| `opsv validate` | 读文档做格式守门 | 文档 `category` 必须在 `_category_validate.yaml` 注册过；不评判质量，只查格式 |

### 3.2 任务环

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv circle create` | 从 `refs` 依赖建 DAG、分层、写 manifest | **只在依赖关系变化时**用；不是每步都跑 |
| `opsv circle refresh` | 检查文档状态，刷新任务环文档状态统计、不动文件 | 日常迭代用；检测到拓扑变化会报错让你用 create |

### 3.3 编译

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv imagen` | 编译图像任务 → task.json | `--model` 必填；只编译不执行 |
| `opsv animate` | 编译视频任务 → task.json | `--model` 必填；同上 |
| `opsv comfy` | 编译 ComfyUI 工作流任务 | 需要 workflow 文件 |
| `opsv webapp` | 编译浏览器自动化任务 | 多站点 runner （目前仅支持Gemini） |

> 编译命令**只产出 task.json**，真正的 API 调用在 `run` 里。

### 3.4 执行与迭代

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv run` | 执行 task.json（提交/轮询/下载） | 按模型 concurrency 控制；不直接调 API 是它调；`--force` 强制重跑已成功任务（输出增量保存） |
| `opsv iterate` | 克隆任务做迭代 | 后缀**自动**加 `_m1`/`_m2`；**禁止手改名** |

### 3.5 审阅与审批

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv review` | 启审阅 UI（本地/云） | `--cloud` 暂未开放 |
| `opsv approved` | Agent 批量审批 | action 只有 3 个：`approve`/`design_feedback`/`revise_prompt` |

### 3.6 引用与辅助

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv refs check` | 查 prompt ↔ refs 一致性 | 用了 `@id` 但 refs 没声明 → 报错 |
| `opsv refs fill` | 自动补齐缺失 refs key + 填充路径 | --write 写回；--dry-run 预览 |
| `opsv image-stitch` | 拼接图片 | 横拼 `--right` / 纵拼 `--down` |
| `opsv comfy-node-mapping` | 分析 ComfyUI 工作流 | 产出节点映射 |

### 3.7 API 配置

| 命令 | 干什么 | Agent 必须知道 |
|------|--------|---------------|
| `opsv api-setup` | 配置 API key 和 Provider | 交互引导补 key；`--list` JSON 输出；`--set-key` 设 key；`--add-model` 追加 comfylocal/runninghub；`--sync-env` 补齐占位 |

---

## 4. ComfyUI Node Mapping 与工作流模板

> ComfyUI 是 OPSV 最灵活的扩展方式。用户可以通过 `node_mappings` 将 OPSV 的 prompt/参数注入到任意 ComfyUI 工作流的任意节点。

### 4.1 什么是 node_mappings

ComfyUI 工作流是一个 JSON 节点图，每个节点有 `nodeId` 和若干字段。`node_mappings` 告诉 OPSV：**把哪个参数注入到哪个节点的哪个字段**。

```yaml
# .opsv/api_config.yaml 中的配置
models:
  comfylocal.myworkflow:
    provider: comfylocal
    workflow: "comfyui_workflow_templates/txt2img.json"   # 工作流 JSON 文件路径
    node_mappings:
      prompt:                                              # OPSV 参数名
        nodeId: "6"                                        # ComfyUI 节点 ID
        fieldName: "text"                                  # 节点上的字段名
      negative_prompt:
        nodeId: "7"
        fieldName: "text"
      seed:
        nodeId: "25"
        fieldName: "noise_seed"
      image1:
        nodeId: "10"
        fieldName: "image"
```

OPSV 会从文档中提取 `prompt`、`negative_prompt`、`seed` 等值，按 `node_mappings` 注入到工作流节点中。

### 4.2 如何生成 node_mappings

```bash
# 用 comfy-node-mapping 命令自动分析工作流 JSON，输出映射
opsv comfy-node-mapping comfyui_workflow_templates/txt2img.json

# 保存到文件
opsv comfy-node-mapping comfyui_workflow_templates/txt2img.json -o node_mapping.yaml
```

该命令会扫描工作流中所有节点，找出 `CLIPTextEncode`、`KSampler`、`LoadImage` 等常见节点并建议映射。输出后复制到 `api_config.yaml` 或文档 frontmatter 的 `node_mapping` 字段。

### 4.3 工作流文件路径

在 `api_config.yaml` 中通过 `workflow` 字段指定工作流 JSON 文件路径（相对 `projectRoot` 或绝对路径）：

```yaml
models:
  comfylocal.myworkflow:
    workflow: "comfyui_workflow_templates/txt2img.json"   # 单个 .json 文件
```

也支持 CLI 临时覆盖：

```bash
opsv comfy --model comfylocal.myworkflow --manifest ... --workflow /path/to/other.json
```

### 4.4 两种 ComfyUI 模式对比

| 维度 | `comfylocal` | `runninghub` |
|------|-------------|-------------|
| 场景 | 本地部署的 ComfyUI | RunningHub 云端 ComfyUI |
| API Key | 不需要 | 需要 `RUNNINGHUB_API_KEY` |
| 工作流来源 | 本地 `workflow` 路径指向的 `.json` 文件 | RunningHub 服务端的 `workflowId` |
| node_mappings | 必填 | 必填 |
| 添加方式 | `api-setup --add-model` | `api-setup --add-model` |

### 4.5 用 api-setup 添加新工作流

```bash
# 添加本地 ComfyUI 工作流（workflow 指向 .json 文件）
opsv api-setup --add-model '{
  "modelKey": "comfylocal.txt2img",
  "config": {
    "provider": "comfylocal",
    "workflow": "comfyui_workflow_templates/txt2img.json",
    "node_mappings": {
      "prompt": {"nodeId":"6","fieldName":"text"},
      "seed": {"nodeId":"25","fieldName":"noise_seed"}
    }
  }
}'

# 添加 RunningHub 云端工作流
opsv api-setup --add-model '{
  "modelKey": "runninghub.myvideo",
  "config": {
    "provider": "runninghub",
    "workflowId": "wf_abc123",
    "api_url": "https://www.runninghub.cn/task/openapi/create",
    "api_status_url": "https://www.runninghub.cn/task/openapi/status",
    "node_mappings": {
      "prompt": {"nodeId":"6","fieldName":"text"},
      "image1": {"nodeId":"10","fieldName":"image"}
    }
  }
}'
```

添加后即可用 `opsv comfy --model comfylocal.txt2img` 编译。

---

## 5. Agent 必须遵守的文档规范

### 5.1 frontmatter 基础字段（`BaseFrontmatterSchema`）

每个文档必须有这两个，其余按需：

```yaml
---
category: <类别名>          # 必填，必须在 _category_validate.yaml 注册
status: drafting            # 必填，三选一：drafting / syncing / approved
# 其余见 references/lifecycle_and_status.md
---
```

### 5.2 refs 字段（字典结构，不是数组）

**正典是双层字典 + 路径数组**（v0.10.0 起，`RefsByTypeSchema`）：

```yaml
refs:
  image:                    # 外层 key = input_type（image/video/audio/bvh/mask，见 input_types.yaml）
    "@LuRan":               # 内层 key = @ 引用语法
      - path/to/LuRan.png   # 值 = 非空路径数组
    "@LuRan:portrait":
      - path/to/LuRan-portrait.png
  video:
    "@shot-S01-Shot01":
      - path/to/clip.mp4
```

- 外层 key 必须是已注册的 input_type，否则编译报 `unknown input_type`
- 内层 key 必须以 `@` 开头，三种合法形态：`@id` / `@id:variant` / `@:key`
- 值必须是非空数组（空数组报错）
- **数组形式 `- "@LuRan"` 是过时写法，编译器会拒绝**（报 `must be an object mapping`）

> 完整语法见 references/refs_syntax.md。

### 5.3 prompt 与 refs 必须双向对应

prompt 里写了 `@LuRan` → `refs` 里必须声明 `@LuRan`。反过来声明了没用也会警告。用 `opsv refs check <file>` 一键查。

### 5.4 产物命名交给命令，禁止手改

| 场景 | 文件名规则 | 谁来做 |
|------|-----------|--------|
| 首次编译执行 | `{任务json名}_1.png` | opsv run |
| 同参数重跑 | `{任务json名}_2.png` | opsv run |
| 迭代后执行 | `{任务json名}_m1_1.png` | opsv iterate + run |

`shot_id`（如 `S01-Shot01`）本身**不附加版本号**，版本后缀全部由命令自动管。

> 命名规则与 lifecycle 见 references/lifecycle_and_status.md、references/validate_and_iterate.md。

---

## 6. 反模式清单（绝对禁止）

| # | 反模式 | 正确做法 |
|---|--------|---------|
| 1 | 手改产物文件名（加后缀、改编号） | 文件名由 `run`/`iterate` 自动管 |
| 2 | 自己发 HTTP 调生成 API | 一律走 `run` 执行编译好的 task.json |
| 3 | iterate 后手改源 `.md` 同步 | 改的是任务 JSON；源文档同步由 syncing 回写机制处理 |
| 4 | prompt 用 `@LuRan` 但 refs 没写 | 先 `opsv refs check`，按报错补 |
| 5 | 用 `_category_validate.yaml` 里没有的 category | 只能用注册过的类别 |
| 6 | refs 写成数组 `- "@id"` | 写成字典 `{ "@id": [path] }` |
| 7 | 文件名/目录名带 `@` 前缀 | `@` 只在 prompt/refs 里用 |
| 8 | 手写 Circle 层级（ZeroCircle/FirstCircle） | Circle 由 `circle create` 按 refs DAG 自动分层 |
| 9 | 每完成一步就 `circle create` | 只在依赖关系变化时 create；日常用 refresh |
| 10 | 用 `@id.md` 或 `@Character:id` 这种写法 | 直接 `@id`，不带 `.md` 不带类别前缀 |

---

## 7. 典型工作流（一个镜头的完整生命周期）

```bash
# 0. 初始化（一次性）
opsv init
# 写好文档 frontmatter（category/status/prompt/refs）

# 1. 守门
opsv validate --dir videospec
opsv refs check videospec/shots/S01-Shot01.md

# 2. 建依赖（依赖变化时才跑）
opsv circle create --dir videospec

# 3. 编译 + 执行
opsv imagen --model volcengine.seadream --manifest opsv-queue/videospec_circle1/_manifest.json --file S01-Shot01
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/*.json

# 4. 审阅
opsv review --circle

# 5a. 满意 → 审批解锁下游
opsv approved --file "@S01-Shot01" --action approve

# 5b. 不满意 → 迭代（复制任务、改 prompt、重跑）
opsv iterate opsv-queue/videospec_circle1/volcengine.seadream_001/S01-Shot01_m1.json
# 改 m1 任务的 prompt/refs →
opsv run opsv-queue/.../S01-Shot01_m1.json
```

---

## 8. 触发条件

- 用户说"初始化项目""opsv init" → §3.1
- 用户说"校验""validate 报错了" → §3.1 + references/validate_and_iterate.md
- 用户说"怎么编译/跑这个文档" → §3.3 + §3.4
- 用户说"结果不好，要改/重做" → §3.4 iterate
- 用户说"审批/审阅/review" → §3.5
- 用户说"API key/配置/添加模型" → §3.7 + §4
- 用户说"ComfyUI 工作流/node mapping" → §4
- 用户问"refs 怎么写""@ 语法""这个错什么意思" → references/refs_syntax.md
- 用户问"状态是什么意思/syncing/approved" → references/lifecycle_and_status.md
- 用户问某个命令的参数 → references/cli_reference.md

---

## 9. references/

- `references/cli_reference.md` — 全部命令全表（语法/必填/可选/源码位置），含 `api-setup`
- `references/lifecycle_and_status.md` — 三状态、syncing 回写、产物命名规则
- `references/refs_syntax.md` — `@` 引用语法、refs 字典结构、refs check/sync
- `references/validate_and_iterate.md` — validate 加载顺序、类别机制、iterate 迭代命名

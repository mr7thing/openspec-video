# OpenSpec-Video v0.6.4 架构与规范文档

> **注意**：本文档基于 v0.6.4 实际代码撰写，取代所有过时文档。如有与旧文档冲突之处，以本文档为准。

---

## 1. 核心概念：Circle（环）

OpenSpec-Video 采用 **DND 五环施法** 的概念来管理资产生成的依赖层次：

| Circle | 名称 | 典型资产 |
|--------|------|---------|
| 0 | **ZeroCircle** | 无依赖的基础资产（角色、道具、场景设计图） |
| 1 | **FirstCircle** | 依赖 ZeroCircle 的次级资产（带角色引用的场景、组合资产） |
| 2 | **SecondCircle** | 依赖 FirstCircle 的三级资产（分镜视频、动画，依赖已批准的 shot 图片） |
| 3+ | ThirdCircle / ... | 依此类推（复杂组合、后处理） |

**关键规则**：
- 每个 Circle 内的资产互相无依赖，可并行生成
- 高 Circle 的资产必须等待其所有依赖在低 Circle 中完成并 **Approve** 后才能生成
- Circle 序号由 `DependencyGraph` 的拓扑排序自动计算
- 目录命名：`opsv-queue/<circle>_<iteration>/`（如 `zerocircle_1`, `secondcircle_1`）

---

## 2. 项目目录结构

所有运行时数据统一在 `opsv-queue/` 下。

```
<project-root>/
├── videospec/              # 规范文档
│   ├── elements/           # 角色、道具、服装
│   ├── scenes/             # 场景
│   └── shots/
│       ├── Script.md       # 分镜设计文档（## Shot NN 解析）
│       └── Shotlist.md     # 分镜生产状态表（YAML 状态块）
├── opsv-queue/             # 任务队列与资产落盘目录
│   ├── circle_manifest.json    # Circle 状态清单
│   ├── zerocircle_1/
│   │   ├── imagen_jobs.json    # 图像任务列表（opsv imagen）
│   │   ├── video_jobs.json     # 视频任务列表（opsv animate）
│   │   ├── comfy_jobs.json     # ComfyUI 任务列表（opsv comfy）
│   │   ├── volcengine/
│   │   │   └── queue_1/        # Provider 批次队列
│   │   │       ├── queue.json
│   │   │       ├── shot_01_1.png
│   │   │       └── shot_02_1.png
│   │   └── siliconflow/
│   │       └── queue_1/
│   └── frames/             # 帧提取（@FRAME 引用解析落盘）
├── .opsv/                  # 内部元数据（dependency-graph.json）
└── .env/                   # API 配置与密钥
    ├── api_config.yaml
    └── secrets.env
```

**资产命名规则**：
- 全局唯一序号：`{jobId}_{seq}.{ext}`（如 `shot_01_1.png`, `hero_3.png`）
- `SequenceCounter` 递归扫描整个 `opsv-queue/` 树来确定下一个序号

---

## 3. 文档规范（四层规范体系）

### 3.1 规范架构

```
Layer 1: @ 引用语法        — 文档间链接的标准化表达
Layer 2: Frontmatter Schema — YAML 元数据的类型约束
Layer 3: Markdown Body      — 人类可读的正文区域规范
Layer 4: Execution Rules    — 编译期 + 执行期的语义校验
```

### 3.2 Frontmatter Schema

所有 `.md` 文件必须以 YAML frontmatter 开头（`---` 包裹）。

#### 元素文档（`elements/*.md`）

```yaml
---
type: character | prop | costume
status: drafting | approved
visual_brief: >
  视觉描述简述
visual_detailed: >
  视觉详细特征描述
prompt_en: >
  Core MJ/SD Prompt. Derived from visual_detailed.
refs:
  - elder_brother
reviews:
  - "2025-03-15: approved"
---
```

#### 场景文档（`scenes/*.md`）

与元素文档结构相同，`type: scene`。

#### 分镜设计文档（`shots/Script.md`）

```yaml
---
type: shot-design
status: drafting | approved
total_shots: 48
refs:
  - elder_brother
  - younger_brother
  - classroom
---
```

#### 动态分镜表（`shots/Shotlist.md`）

```yaml
---
type: shot-production
status: drafting | approved
---
```

正文每个 Shot 包含 YAML 状态块：

```markdown
## Shot 01 (5s)

```yaml
id: shot_01
status: pending
first_frame: "@FRAME:shot_01_first"
last_frame: "@FRAME:shot_01_last"
duration: 5s
```

Prompt: @elder_brother 走进教室...
```

#### 项目配置（`videospec/project.md`）

```yaml
---
type: project
aspect_ratio: "16:9"
resolution: "1920x1080"
global_style_postfix: "cinematic lighting, film grain"
vision: "一个关于兄弟情的短片"
---
```

### 3.3 @ 引用语法

**基本格式**：

```
@asset_id           — 引用资产的默认变体
@asset_id:variant   — 引用资产的指定变体
```

**示例**：

```markdown
## Shot 01 - 教室重逢
@elder_brother 走进教室，看见 @younger_brother 坐在窗边。
背景是 @classroom:morning 的晨光氛围。
```

**解析规则**：

| 引用 | 解析目标 |
|------|---------|
| `@elder_brother` | `elements/elder_brother.md` → `## Approved References` → `default` 变体 |
| `@elder_brother:childhood` | 同上，`childhood` 变体 |
| `@FRAME:shot_01_last` | `opsv-queue/frames/shot_01_last.png`（视频尾帧） |

**约束**：
- 引用目标必须存在于 `elements/` 或 `scenes/` 目录
- 引用的变体必须在 `## Approved References` 区域中已 approve
- 未 approve 的依赖会被 DependencyGraph 阻塞，任务暂缓执行

### 3.4 Markdown Body 规范

**必须保留的标题骨架**：

- `## Vision`: 记录导演的艺术直觉
- `## Design References`: 设计参考与附件（`![name](path)`）
- `## Approved References`: 审批回写区域（由 Review UI 自动维护）

**Script.md 正文结构**：

分镜信息由正文 `## Shot NN` 标题解析，**不使用 frontmatter `shots[]` 数组**。

```markdown
## Shot 01 - 教室重逢
@elder_brother 推开教室门，晨光洒入走廊。
Camera: 中景跟拍，缓慢推进。

## Shot 02 - 窗边对视
@younger_brother 回头看向门口，微笑。
Camera: 特写，浅景深。
```

**Approved References 区域格式**：

当资产被 `opsv review` 审批通过后，自动在正文末尾追加：

```markdown
## Approved References

![default](../../opsv-queue/approved/elder_brother_default.png)
![childhood](../../opsv-queue/approved/elder_brother_childhood.png)
```

---

## 4. 命令体系

### 4.1 状态层

```bash
opsv circle status          # 查看各 Circle 完成状态
opsv circle manifest        # 生成 opsv-queue/circle_manifest.json
opsv deps                   # 依赖图分析（文本输出）
```

### 4.2 任务生成层（按媒介类型）

每个命令生成对应媒介类型的 **任务列表（jobs.json）**，**不入队**：

```bash
# 图像资产（通常在 ZeroCircle / FirstCircle）
opsv imagen [targets...]
# 产出: opsv-queue/<circle>/imagen_jobs.json

# 视频资产（默认自动推断依赖图末端环）
opsv animate [--cycle auto]
# 产出: opsv-queue/<endcircle>/video_jobs.json

# ComfyUI 工作流（可处于任意 Circle）
opsv comfy compile <workflow.json> --provider <comfyui_local|runninghub> --cycle <name>
# 产出: opsv-queue/<circle>/<provider>/queue_{N}/
```

### 4.3 编译入队层

```bash
# 将任务列表编译为 Provider 特定的队列批次
opsv queue compile <jobs.json> --provider <name> [--cycle <name>]

# 启动队列监听器，消费 pending 任务
opsv queue run <providers...> [--cycle <name>]
```

### 4.4 审阅层

```bash
opsv review                 # 启动 Review UI（Express 服务，默认端口 3456）
```

### 4.5 项目管理

```bash
opsv init [projectName]     # 初始化项目结构
opsv validate               # 校验 Markdown frontmatter
opsv addons install <zip>   # 安装扩展包
```

---

## 5. 数据流

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Markdown 规范   │────→│  opsv circle    │────→│ circle_manifest │
│  (videospec/)   │     │  (依赖图分析)    │     │  (各环任务清单)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  opsv imagen    │────→│ imagen_jobs.json│────→│ opsv queue      │
│  opsv animate   │────→│ video_jobs.json │────→│  compile        │
│  opsv comfy     │────→│ comfy_jobs.json │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
         ┌──────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     opsv-queue/<circle>/<provider>/              │
│                    queue_{N}/  (批次，每次 compile +1)            │
│                    queue.json  (manifest)                        │
│                    {jobId}_{seq}.png  (全局序号产出)              │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  opsv queue run │────→│   Provider API  │────→│  opsv-queue/    │
│  (消费队列)      │     │  (Volcengine等) │     │  approved/      │
└─────────────────┘     └─────────────────┘     │  (Review 后)    │
                                                └─────────────────┘
```

### 5.1 入队流程细节

1. `queue compile` 读取 `jobs.json`
2. 检查 `api_config.yaml` 中启用的 Provider
   - Provider 本身没有 `enable` 属性，继承自子模型
   - 只有子模型 `enable !== false` 且 `type` 匹配任务类型的 Provider 才会被选中
3. Provider 从 `.env/secrets.env` 读取 API Key
4. 在 `opsv-queue/<circle>/<provider>/` 下创建新 batch：`queue_{max+1}/`
   - 每次 `compile` 都新建 batch，不会追加到已有 batch
5. 任务写入 `queue.json` manifest，意图写入 `{taskId}.json`

### 5.2 执行流程细节

1. `queue run <provider>` 启动 `QueueWatcher`
2. `QueueWatcher` 轮询 `queue.json`，取第一个 `pending` 任务
3. 原子移动：inbox → working（文件系统 rename）
4. 调用对应 Provider 的 `processTask()`
5. Provider 调用远程 API，下载结果到 `opsv-queue/<circle>/<provider>/queue_{N}/{jobId}_{seq}.png`
6. 更新 `queue.json` 状态为 `completed` 或 `failed`

---

## 6. 配置体系

### 6.1 api_config.yaml

位于项目 `.env/api_config.yaml`，由 `opsv init` 从模板复制。

**Schema**：

```yaml
providers:
  <providerName>:
    required_env:
      - ENV_VAR_NAME
    models:
      <modelKey>:
        enable: true|false
        type: image_generation | video_generation
        model: "model-name"
        api_url: "..."
        api_status_url: "..."
        defaults:
          quality: "1024x1024"
          aspect_ratio: "16:9"
```

**当前支持的 Provider**：

| Provider | 类型 | 环境变量 |
|----------|------|----------|
| `volcengine` | 图像/视频 | `VOLCENGINE_API_KEY` |
| `siliconflow` | 图像/视频 | `SILICONFLOW_API_KEY` |
| `minimax` | 图像/视频 | `MINIMAX_API_KEY` |
| `runninghub` | ComfyUI 工作流 | `RUNNINGHUB_API_KEY` |
| `comfyui_local` | 本地 ComfyUI | 无 |

### 6.2 ComfyUI 特殊处理

ComfyUI **不通过** `api_config.yaml` 指定模型，模型由工作流 JSON 本身定义。

- 使用 `opsv comfy compile <workflow.json>` 独立命令
- 参数通过 Node Title 匹配注入（如 `input-prompt`, `input-image1`）
- RunningHub 模式下会自动拦截本地文件路径并上传为 URL

---

## 7. 编译与校验规则

### 7.1 编译期通用校验（JobValidator）

- 双引号清洗（YAML → JSON 边界问题）
- 必填字段检查（id, prompt）
- 残留引号检测

### 7.2 Provider 参数防御（StandardAPICompiler）

| Provider | 防御逻辑 |
|----------|----------|
| `siliconflow` | 强制尺寸对齐到推荐列表，清理冗余字段 |
| `volcengine` | `2K` → `1920x1080`，默认 `1280x720` |
| `minimax` | 默认启用 `prompt_optimizer: true` |

### 7.3 frame_ref（视频任务）

视频生成任务使用 `frame_ref` 结构引用首帧/尾帧：

```json
{
  "frame_ref": {
    "first": "/path/to/first_frame.png",
    "last": "/path/to/last_frame.png"
  }
}
```

- 首帧/尾帧可以是文件路径，也可以是 `@FRAME:shot_id_last` 指针
- `@FRAME` 指针由 `RefResolver` 解析为 `opsv-queue/frames/` 下的文件

---

## 8. 审阅流程（Review）

1. 执行 `opsv review` 启动本地 Express 服务（默认端口 3456）
2. Review UI 扫描 `opsv-queue/` 下的所有 batch 目录，展示候选图
3. 用户可多选 → **Approve** 或 **Draft**
4. **Approve**：
   - 直接向源 Markdown 文档的 `## Approved References` 区追加引用（图片保持在原队列目录中，通过相对路径引用）
   - 更新 frontmatter `status: approved`
   - 自动 `git commit`
5. **Draft**：
   - 更新 frontmatter `status: drafting`
   - 记录 `draft_ref` 和导演意见到 `reviews[]`
   - 自动 `git commit`

---

## 9. 工作流程（三角色协作）

```
Creative-Agent ──→ Guardian-Agent ──→ Runner-Agent ──→ Review
     ↑                                              │
     └────────────── 不满意回滚 ──────────────────────┘
```

### 阶段一：项目初始化
`opsv init` 创建目录骨架、复制 Agent 模板、生成 `.gitignore`。

### 阶段二：脑暴与文档锚定
- **Creative-Agent** 负责脑暴、世界观锚定、资产建模、分镜编导
- 所有创意必须落地为 `videospec/` 下的 Markdown 文档
- **Guardian-Agent** 执行反射同步：正文修改后同步更新 YAML `visual_detailed`

### 阶段三：资产建模
- 先读 `project.md` 了解全局风格
- `## Design References`：生成本实体时需要的输入参考图
- `## Approved References`：定档后的正式参考图
- 两节均为空时 → 纯文生图，使用 `visual_detailed`
- 任一节非空时 → 使用 `visual_brief` + 参考图

### 阶段四：编译与执行
1. `opsv circle status` 查看当前该做哪一环
2. `opsv imagen / animate / comfy` 生成任务列表
3. `opsv queue compile <jobs.json> --provider <name>` 编译入队
4. `opsv queue run <provider>` 执行生成
5. `opsv review` 审阅产出

### 阶段五：迭代
- Approve 的资产进入下一环的依赖池
- Draft 的资产回滚到 Creative-Agent 重新迭代

---

## 10. 与旧版本的重大差异

| 旧版本 (v0.5.x) | v0.6.4 |
|-----------------|--------|
| `artifacts/` 目录 | **全部迁移到** `opsv-queue/` |
| `imagen` 直接入队 | `imagen` 只生成 `imagen_jobs.json`，由 `queue compile` 入队 |
| `animate` 扁平输出 | `animate` 按 Circle 输出到 `opsv-queue/<circle>/video_jobs.json` |
| `draft_X` 批次命名 | `queue_{N}` 批次命名，每次 compile **+1** |
| 本地 `queue/` 目录 | 统一并入 `opsv-queue/` |
| ComfyUI 走 `queue compile` | ComfyUI 有独立命令 `opsv comfy compile` |
| 资产覆盖式命名 | **全局唯一序号** `{jobId}_{seq}.{ext}` |
| `opsv generate` | 拆分为 `opsv imagen / animate / comfy` |
| `.opsv-queue/` Spooler | 废弃，统一使用 `BatchManifestManager` |

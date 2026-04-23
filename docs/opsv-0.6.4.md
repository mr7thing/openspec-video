# OpenSpec-Video v0.6.4 架构与规范文档

> **注意**：本文档基于 v0.6.4 实际代码撰写，取代所有过时文档。如有与旧文档冲突之处，以本文档为准。

---

## 1. 核心概念：Circle（环）

OpenSpec-Video 借鉴 **DND 五环施法** 的概念来管理资产生成的依赖层次：

| Circle | 名称 | 典型资产 |
|--------|------|---------|
| 0 | **ZeroCircle** | 无依赖的基础资产（角色、道具、场景设计图） |
| 1 | **FirstCircle** | 依赖 ZeroCircle 的次级资产（带角色引用的场景、组合资产） |
| 2 | **SecondCircle** | 依赖 FirstCircle 的三级资产（分镜视频、动画，依赖已批准的 shot 图片） |
| 3+| ThirdCircle / ... | 依此类推（复杂组合、后处理） |
|end| EndCircle / ... | 终环，基于shotlist.md 进行视频生成, opsv animate 命令默认使用shotlist.md 生成视频，也也支持使用参数指定到具体分镜 例如 shotlist:shot03 重新生成shot03的提示词以及其他参数，再编译为具体任务。但 opsv animate  也支持指定使用其他文档来生成视频。|


**关键规则**：
- 每个 Circle 内的资产互相无依赖，可并行生成
- 高 Circle 的资产生成队列必须等待其所有依赖在低 Circle 中完成并 **Approve** 后才能生成
- End Circle 检查shotlist.md 所有外部依赖 ，@Frame 属于shotlist.md内部依赖。
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
│   │   │       ├── shot_01.json     # 可直接发送的 API 请求体（完整 payload）
│   │   │       ├── shot_01_1.mp4    # 视频结果（序号递增）
│   │   │       ├── shot_01_first.png  # API 返回的首帧/封面图
│   │   │       ├── shot_01_last.png   # API 返回的尾帧（Seedance 2.0 return_last_frame）
│   │   │       ├── shot_01.log      # API 请求/响应/下载 JSONL 日志
│   │   │       └── shot_02.json
│   │   └── siliconflow/
│   │       └── queue_1/
│   └── frames/             # 历史帧目录（v0.6.4+ 帧直接生成在 batch 目录下）
├── .opsv/                  # 内部元数据（dependency-graph.json）
└── .env/                   # API 配置与密钥
    ├── api_config.yaml
    └── secrets.env
```

**资产命名规则**：
- 本地递增序号：`{jobId}_{runSeq}.{ext}`（如 `shot_01_1.png`, `shot_01_2.png`）
- 每个 `queue_N/` 目录独立维护序号，无全局竞争，无锁
- Agent 可直接复制 `shot_01.json` 为 `shot_01_v2.json`，执行后生成 `shot_01_v2_1.png`

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
# 将任务列表编译为 Provider 特定的可直接执行的 .json 文件
opsv queue compile <jobs.json> --model <provider.model|alias> [--circle <name>]
# 例: opsv queue compile imagen_jobs.json --model volcengine.seadream-5.0-lite --circle zerocircle_1
# 例: opsv queue compile jobs.json --model volc.sd2 --model siliconflow.qwen-image --circle zerocircle_1

# 一次性顺序执行最新 batch 下的任务
opsv queue run --model <provider.model|alias> [--file <json>...] [--circle <name>] [--retry]
# 例: opsv queue run --model volcengine.seadream-5.0-lite --file shot_01.json --circle zerocircle_1
# 例: opsv queue run --model volc.sd2 --retry
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
│  opsv comfy     │────→│ workflow.json   │     │  (读取 api_config)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
         ┌──────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     opsv-queue/<circle>/<provider>/              │
│                    queue_{N}/                                     │
│                    ├── shot_01.json    (完整 API 请求体)          │
│                    ├── shot_01_1.png   (执行结果)                 │
│                    ├── shot_01.log     (API 请求/返回/下载 JSONL) │
│                    └── shot_02.json                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  opsv queue run │────→│   Provider API  │────→│  opsv-queue/    │
│  (一次性执行)    │     │  (不再读配置)    │     │  approved/      │
└─────────────────┘     └─────────────────┘     │  (Review 后)    │
                                                └─────────────────┘
```

### 5.1 编译流程细节

1. `queue compile <jobs.json> --model <provider.model|alias> --circle <name>`
2. 读取 `api_config.yaml` 获取指定 model 的 api_url、defaults、参数防御规则
3. 检查 jobs.json 中各 job 的 type 是否与 model.type 匹配，不匹配则跳过
4. 构建完整的 API 请求体（含 model、prompt、defaults、reference 映射、frame_ref 映射）
5. **compile 必然创建新 batch**：`queue_{N+1}/`
   - `queue_N` 语义 = "第 N 次 compile 的结果"
   - run 默认执行最新 batch
6. 每个 job 写入 `{jobId}.json`（可直接发送的 API 请求体）
7. 生成 `compile.log`（编译摘要，JSONL 格式）

### 5.2 执行流程细节

1. `queue run --model <provider.model|alias> [--file <json>...] [--retry]`
2. 定位最新 `queue_N/` 目录
3. 扫描 `.json` 任务文件，过滤规则：
   - 已有 `_{runSeq}.{ext}` 结果文件 → **跳过**（已成功）
   - 已有 `_error.log` 且未加 `--retry` → **跳过**（上次失败）
4. **顺序执行**每个 pending 任务：
   - 读取 `.json` 获取 `_opsv` 元数据（api_url、api_status_url）和请求体
   - 从环境变量读取 API Key
   - 发送请求 → 下载结果 → 写 `{basename}.log`（JSONL 格式）
   - 失败 → 写 `{basename}_error.log`
5. 打印执行摘要 → **自动退出**

**Agent 直接操作**：
- 复制 `shot_01.json` → `shot_01_v2.json`
- 修改 `prompt` 字段
- 运行 `opsv queue run --model volcengine.seedance-2.0 --file shot_01_v2.json`
- 生成 `shot_01_v2_1.png`

---

## 6. 配置体系

### 6.1 api_config.yaml

位于项目 `.env/api_config.yaml`，由 `opsv init` 从模板复制。

**设计原则**：
- `defaults` 即 API 请求体的参数模板，字段名 = API 真实字段名
- **仅 compile 时读取**，run 时 Provider 不再读取 api_config
- compile 时将所有配置信息（api_url、defaults、reference 映射）固化到 `.json` 中
- Agent 拿到 `.json` 即可看到完整请求细节，甚至可在无 api_config 的机器上执行

**Schema**：

```yaml
providers:
  <providerName>:
    required_env:
      - ENV_VAR_NAME
    models:
      <modelKey>:
        enable: true | false
        type: image_generation | video_generation
        model: "model-name"
        api_url: "..."
        api_status_url: "..."      # 仅视频生成需要
        max_reference_images: N     # 参考图数量上限
        defaults:
          # 以下为 API 真实参数字段，直接透传
          <api_param>: <value>
```

**当前支持的 Provider 与模型**（完整配置见 `templates/.env/api_config.yaml`）：

| Provider | 模型 | 类型 | 环境变量 | 备注 |
|----------|------|------|----------|------|
| `siliconflow` | `qwen-image` | 图像 | `SILICONFLOW_API_KEY` | 推荐尺寸: 1328x1328, 1664x928, 928x1664, 1472x1140, 1140x1472, 1584x1056, 1056x1584 |
| `siliconflow` | `qwen-image-edit-2509` | 图像 | `SILICONFLOW_API_KEY` | 不支持 `image_size` |
| `siliconflow` | `wan2.2-t2v` | 视频 | `SILICONFLOW_API_KEY` | 文生视频，尺寸: 1280x720, 720x1280, 960x960 |
| `siliconflow` | `wan2.2-i2v` | 视频 | `SILICONFLOW_API_KEY` | 图生视频 |
| `volcengine` | `seadream-5.0-lite` | 图像 | `VOLCENGINE_API_KEY` | 支持 `2K`→1920x1080, `2K-Square`→1440x1440 |
| `volcengine` | `seedance-1.5-pro` | 视频 | `VOLCENGINE_API_KEY` | 旧版 API，仅支持单张参考图 |
| `volcengine` | `seedance-2.0` | 视频 | `VOLCENGINE_API_KEY` | **新版 Content Generation API**，支持多模态（图/视频/音频参考，最多9张图）；本地图片自动 Base64 直传；API 自动返回尾帧 |
| `volcengine` | `seedance-2.0-fast` | 视频 | `VOLCENGINE_API_KEY` | Seedance 2.0 快速版，同 API 结构，成本更低速度更快 |
| `minimax` | `minimax-image-01` | 图像 | `MINIMAX_API_KEY` | response_format: base64 |
| `minimax` | `minimax-video-01` | 视频 | `MINIMAX_API_KEY` | resolution: 1080P |
| `runninghub` | ComfyUI 工作流 | 图像/视频 | `RUNNINGHUB_API_KEY` | 参数通过 Node Title 匹配注入 |
| `comfyui_local` | 本地 ComfyUI | 图像/视频 | 无 | 参数通过 Node Title 匹配注入 |

### 6.2 ComfyUI 特殊处理

ComfyUI **不通过** `api_config.yaml` 指定模型，模型由工作流 JSON 本身定义。

- 使用 `opsv comfy compile <workflow.json>` 独立命令
- 参数通过 Node Title 匹配注入（如 `input-prompt`, `input-image1`）
- **RunningHub 本地文件上传**：当前尚未实现真实上传逻辑，若参数值为本地文件路径且非 http URL，将抛出 `NotImplementedError`。请直接提供公网可访问的 URL，或在 Provider 中实现 upload API。

---

## 7. 编译与校验规则

### 7.1 编译期通用校验（JobValidator）

- 双引号清洗（YAML → JSON 边界问题）
- 必填字段检查（id, prompt）
- 残留引号检测

### 7.2 Provider 参数防御（TaskCompiler）

参数防御在 **compile 阶段**完成，结果固化到 `.json` 中。run 时 Provider 直接发送，不做二次处理。

| Provider | 防御逻辑 |
|----------|----------|
| `siliconflow` | 强制 `image_size` 对齐到 Qwen-Image 推荐列表，非推荐值 fallback 到 1024x1024；清理冗余字段 `size`/`resolution` |
| `volcengine` | `2K` → `1920x1080`，`2K-Square` → `1440x1440`，默认 `1280x720`；Seedance 2.0 自动构建 `content` 数组；本地图片/audio 自动 Base64 编码；视频不支持 Base64（API 限制） |
| `minimax` | `negative_prompt` 拼接进 prompt 文本后从请求体删除；默认启用 `prompt_optimizer: true` |
| `reference 映射` | 通用 `references` 数组根据 Provider 映射到正确字段：`image` (SiliconFlow/Volcengine image)、`subject_reference` (Minimax)、`image_url` (Volcengine video 旧版)、`content` 数组 (Volcengine Seedance 2.0) |
| `frame_ref` | 视频任务的首帧/尾帧根据 Provider 映射到 `first_frame`/`last_frame` (旧版) 或 `content` 数组中的 `image_url` + `role: reference_image` (Seedance 2.0)；`@FRAME:shot_01_last` / `@shot_01:last` 语法解析为相对路径 |

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
3. `opsv queue compile <jobs.json> --model <provider.model|alias> --circle <name>` 编译为可直接执行的 `.json`
4. `opsv queue run --model <provider.model|alias> --circle <name>` 一次性顺序执行
5. `opsv review` 审阅产出
6. **Agent 迭代**：复制 `.json` → 修改参数 → `opsv queue run --model <provider.model|alias> --file <json>` 重新执行

### 阶段五：迭代
- Approve 的资产进入下一环的依赖池
- Draft 的资产回滚到 Creative-Agent 重新迭代

---

## 10. 与旧版本的重大差异

| 旧版本 (v0.5.x) | v0.6.4 |
|-----------------|--------|
| `artifacts/` 目录 | **全部迁移到** `opsv-queue/` |
| `imagen` 直接入队 | `imagen` 只生成 `imagen_jobs.json`，由 `queue compile` 编译为 `.json` |
| `animate` 扁平输出 | `animate` 按 Circle 输出到 `opsv-queue/<circle>/video_jobs.json` |
| `draft_X` 批次命名 | `queue_{N}` 批次命名，每次 compile **必然 +1** |
| 本地 `queue/` 目录 | 统一并入 `opsv-queue/` |
| ComfyUI 走 `queue compile` | ComfyUI 有独立命令 `opsv comfy compile` |
| 资产覆盖式命名 | **本地递增序号** `{jobId}_{runSeq}.{ext}`，Agent 可直接复制修改 |
| `opsv generate` | 拆分为 `opsv imagen / animate / comfy` |
| `.opsv-queue/` Spooler | 废弃 |
| **v0.6.4 新增** | `.json` = 可直接发送的 API 请求体，run 时不再读 api_config |
| **v0.6.4 新增** | `--model <provider.model|alias>` CLI 选项，支持别名（如 `volc.sd2`） |
| **v0.6.4 新增** | `queue run` 一次性顺序执行，非守护进程 |
| **v0.6.4 新增** | 文件系统即状态：`.json` 存在 = 待执行，`_{seq}.png` 存在 = 已完成，`_error.log` = 失败 |
| **v0.6.4 新增** | JSONL 执行日志，Agent 可精确读取 API 返回 |

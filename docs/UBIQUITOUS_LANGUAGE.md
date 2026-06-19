# OPSV 领域语言 / Ubiquitous Language

> 基于 v0.8 代码库分析 · 待对齐

---

## 文档与资产

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Asset（资产/文档）** | `videospec/` 目录下的 `.md` 文件，含 YAML frontmatter，是流水线的输入单元。**Asset = Document，是同一个东西。** | doc、document（Asset 更常用，Document 是技术实现描述） |
| **Frontmatter（前matter）** | Asset 顶部 YAML 块，定义 `status`、`refs`、`prompt` 等元字段 | metadata、header、yaml 头 |
| **Media Reference（媒体引用）** | Asset 正文中引用的图片/视频等媒体文件路径，可用相对路径或绝对路径，指向硬盘任意位置 | asset reference、linked file、external file |
| **Project（项目）** | `videospec/` 目录，代表一个完整视频/品牌片项目 | workspace、repo |
| **Target（目标目录）** | `opsv circle create --dir` 指定的上游文档目录（默认为 `videospec/`） | source、input-dir |

**注意：Asset ≠ Asset 引用的媒体文件**

Asset 本身是 `.md` 文档。文档里通过路径引用了图片/视频，这些媒体文件是 Asset 的**外部依赖**，不是 Asset 的一部分。

---

## 依赖与拓扑

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Ref（引用）** | frontmatter 中 `refs: [@assetId]` 字段，声明当前 Asset 对其他 Asset 的依赖 | reference、dependency、dep |
| **Variant（变体）** | Ref 的后半段 `@assetId:variant`，如 `@hero:dark_1`，用于选择同一 Asset 的特定 Approved 输出 | style、version |
| **Circle（环）** | 拓扑排序的一个批次；同批 Asset 之间无依赖，可并行执行；写入 `{name}.circle_1/` 目录。**index** 字段（0-based）标识批次序号，**name** 字段是语义名称 | layer（已废除，用 Circle + index 替代）、batch（batch 暗示无序，Circle 保留拓扑语义） |
| **index（批次序号）** | 拓扑排序的批次号，0-based。`for (const [index, batch] of batches.entries())` 直接得出。与目录编号 `circle_1` 差一（index=0 → circle_1） | layer number、Circle ID |
| **环名称（name）** | 环的语义名称：`zerocircle` / `firstcircle` / `secondcircle` ... / `end_circle`。ordinals 覆盖 index 0-9；超过 9 层时 fallback 为 `circle.{index}` |  |
| **end_circle（终点环）** | shotdeck.md 所在的环，生成最终视频。**注意：终点环不一定在拓扑最末尾**，中间环也可以放置其他文档和确认目录做各种类型的生成 | lastcircle |
| **Toposort（拓扑排序）** | 根据 refs 依赖关系将 Asset 划分为环的算法 | sorting、ordering |
| **Cycle（循环依赖）** | Asset A → B → C → A 的闭环；系统拒绝处理 | circular dependency、loop |

**环命名规则（name）**

- `zerocircle` — 固定，零依赖，直接 prompt 生成（index=0）
- `firstcircle` / `secondcircle` ... — 中间环，ordinals 覆盖 index 0-9（index 1-9）
- `end_circle` — shotdeck.md 所在的环，生成最终视频（固定语义标记，优先于 ordinals）
- `circle.{index}` — 超过 9 层时的 fallback（dot notation，与目录名 `{basename}.circle_1` 风格一致）

> ⚠️ 代码中 `ninethcircle` 拼写正确（ninth + circle，连写），ordinals 数组下标 index 直接对应 ordinals[index]。

---

## 状态与审核

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Status（状态）** | frontmatter 的 `status` 字段，值域为 `drafting` \| `待同步` \| `approved` | state、phase |
| **Drafting（草稿）** | 默认状态，Asset 尚未经过审核确认 | pending、new |
| **待同步（Syncing）** | 审阅结果已被确认，但文档内容与生成该结果的任务文件不匹配——需要将任务参数回写到文档 | modifying、editing（这是中间态，不是终态） |
| **Approved（已审核）** | 审阅结果已被确认，且文档与任务已对齐 | accepted、confirmed |
| **Iterate（迭代）** | 复制一个任务文件进行直接修改（提示词、图片引用等），生成新的 syncing 状态子任务 | modify、change、edit |
| **Sync（同步）** | 将确认后的任务参数回写到文档的操作；由 Review 确认后触发，状态从"待同步"变为 "approved" | 回写、回填 |
| **Review（审核）** | 人工查看生成结果并决定 approve/syncing 的流程；也是 `opsv review` 命令名 | approval（Review 是动作，approval 是结果）、QA |
| **Syncing Gate（同步检查点）** | 概念性门槛——检查文档内容与生成结果的任务文件是否对齐，未对齐则标记"待同步" |  |

**迭代与同步的完整流程**

```
原始文档（drafting）
    │
    │ opsv iterate（复制任务文件，直接修改 prompt/引用）
    ▼
子任务文件（修改后的副本）
    │
    │ opsv produce → 执行 → 结果
    ▼
Review 确认结果
    │
    ├── 文档内容 = 任务内容 ──→ 状态 = approved
    │
    └── 文档内容 ≠ 任务内容 ──→ 状态 = 待同步
                                    │
                               opsv sync（回写任务到文档）
                                    │
                                    ▼
                               状态 = approved
```

**关于"待同步"状态**

"待同步"是一个**检查标记**，不是独立的 status 值。当 Review 确认了一个结果，但文档与任务不匹配时，系统给出提示，提醒 agent 读取任务文件和生成产物，进行内容对齐。同步完成后状态才能变为 `approved`。

---

## 编译与执行

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Job（任务）** | 编译输入对象——包含 `id`、`type`、`prompt`、`refs`、`workflow_id` 等，描述"要生成什么" | task（Job 是编译输入，TaskJson 是执行输入，避免混用） |
| **TaskJson** | 编译输出文件——Provider 特定的 JSON，含 `_opsv` 元数据块和 `api_url` | task file、compiled task、output |
| **Compile（编译）** | 将 Job 转换为 TaskJson 的过程；读取 frontmatter + refs + 模型配置，生成 Provider 可执行的 JSON | build、generate |
| **Execute（执行）** | 将 TaskJson 发送给 Provider API 并轮询结果 | run（run 更口语化，execute 更精确）、submit |
| **Queue（队列）** | ① `opsv-queue/` 目录（编译产物存放处）② `QueueRunner`（执行器组件） | 需根据上下文区分 |
| **Provider（供应商）** | 实际调用 AI API 的后端：minimax / volcengine / runninghub / siliconflow / comfyui / webapp | backend、service、API provider |
| **Polling（轮询）** | 执行后以梯度间隔查询 Provider API 状态（10s → 30s → 60s → 300s） | polling、status check、wait |
| **Gradient Polling（梯度轮询）** | 根据等待时长动态调整轮询间隔的策略 | exponential backoff（不同：梯度是固定档位，不是指数退避） |
| **Checkpoint（检查点）** | `.log` JSONL 文件，记录任务提交和状态变迁，用于断点续跑 | log、resume file |
| **Resume（续跑）** | 从 checkpoint 读取 `task_id` 继续轮询，无需重新提交 | retry（retry 是重新提交，resume 是续轮询） |

---

## Manifest 与元数据

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Manifest（清单）** | `{name}.circle{N}/_manifest.json`，Circle 的元数据文件，记录 version、target、circles、assets | manifest.json、circle manifest |
| **CircleManifest** | Manifest 中的 `circles[]` 数组块，对应 `ManifestCircleEntry[]` | circles data、circle list |
| **CircleAssetEntry** | Manifest 中 `assets{}` 字典的单个条目，含 `status`、`index`、`category` | asset entry、asset record |
| **ReviewEntry** | Document 底部的 `## Approved References` 块，记录 approve 历史 | review log、approval history |
| **Variant（图片变体）** | Approved Reference 中的 `![variantName](path)` 条目，同一 Asset 的多个审核通过版本 | style、approved output |

---

## 迭代与修改

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **Iterate（迭代）** | 修改已 approved Asset 的 frontmatter，产生新的 syncing 任务 | modify、change、edit |
| **Refresh（刷新）** | `opsv circle refresh`——增量更新 manifest diff（新增/移除 asset），不改变 status | rebuild、re-sync |
| **Circle Create** | `opsv circle create`——从零构建依赖图，创建新的 `.circle{N}/` 目录 | init、bootstrap |
| **Circle Refresh** | `opsv circle refresh`——在已有 `.circle{N}/` 基础上 diff 更新 manifest | update、sync |
| **命名约定（文件）** | 初始文件 `{id}.ext`，修改后 `{id}_1.ext`、`{id}_2.ext`... | version suffix |

---

## 云端与 Tunnel

| 术语 | 定义 | 应避免的别名 |
|------|------|-------------|
| **OpsV Cloud（云端服务）** | 闭源 SaaS 服务，托管在 `review.opsv.cloud` / `api.review.opsv.cloud`，提供账户管理、计费和 Tunnel 转发服务 | 云端空间、云服务器 |
| **CloudClient（云端 REST 客户端）** | CLI 内部模块，通过 REST API 调用 opsv-cloud 的 session 管理接口（创建/刷新/关闭 session），**不是交互界面** | 云端界面（不是 UI，是 API 客户端） |
| **TunnelClient（隧道客户端）** | CLI 内部的 WebSocket 客户端，与 opsv-cloud 建立长连接，将云端请求转发到本地 localhost:3100 Express 服务器 | tunnel service、Tunnel 连接 |
| **Tunnel Server（隧道服务端）** | opsv-cloud 端的 WebSocket Server，接收审阅者请求并通过 TunnelClient 转发到创作者本地 | WS server、proxy server |
| **Session Token** | TunnelClient 用来认证 WS 连接的身份令牌 | tunnel token、ws token |
| **Review JWT** | 审阅者访问 `reviewUrl` 的 30 分钟有效令牌 | access token、review token |
| **API Key (`opk_xxx`)** | 创作者在 opsv-cloud 的永久身份凭证，用于调用 REST API（通过 CloudClient） | creator token、auth key |

**OpsV Cloud 的组成**

```
opsv-cloud（闭源 SaaS）
├── Account + Billing（账户/计费，前台界面）
├── Cloud Gateway（JWT 验证 + 路由）
├── Tunnel Server（WS 长连接，转发 HTTP 请求）
└── Session Broker（session 状态管理）
```

**Cloud Mode 连接流程**

```
审阅者浏览器
    │ GET /s/{sid}?t={jwt}
    ▼
opsv-cloud（Cloud Gateway 验证 JWT）
    │
    │ Binary WS Frame（HTTP_REQ）
    ▼
Tunnel Server ──→ TunnelClient（CLI）
                        │
                        ▼ localhost:3100
                   Express Review UI
```

---

## 命令对照表

| 命令 | 输入 | 输出 | 核心操作 |
|------|------|------|---------|
| `opsv init` | — | 项目骨架 | 创建 `.opsv/` 配置 |
| `opsv validate` | Document | 校验结果 | 检查 frontmatter schema |
| `opsv circle create` | `videospec/*.md` | `opsv-queue/{name}.circle_1/` | Toposort → 写 manifest |
| `opsv circle refresh` | 已有 circle | manifest diff | 检测增删 asset |
| `opsv produce <model>` | manifest | `task.json` + 执行 | Compile + Execute + Poll |
| `opsv comfy` | manifest | `task.json` | 仅 Compile（ComfyUI 专用） |
| `opsv run <paths>` | `task.json` | 输出文件 | 仅 Execute + Poll |
| `opsv iterate` | approved asset | 新 syncing 任务 | 复制 + 改 status |
| `opsv review` | 输出文件 | Express UI | 人工审核界面 |
| `opsv review --cloud` | — | Cloud Tunnel | WS 隧道 + 分享链接 |
| `opsv script` | — | — | 执行自定义脚本 |
| `opsv webapp` | — | — | Webapp provider 专用 |

---

## 歧义标记

- **"asset" vs "document"**：代码中大量混用。约定：代码变量名用 `asset`（因为取自 manifest assets map），文档和对话中用"文档"或"asset 文件"。
- **"queue"**：既指 `opsv-queue/` 目录，又指 `QueueRunner` 组件。约定：目录说"queue 目录"，组件说"QueueRunner"。
- **"task"**：Job（编译输入）vs TaskJson（编译输出）都叫 task。约定：说 Job 时用完整词，说 TaskJson 时用文件名 `task.json`。
- **"syncing"**：既是状态名，又是"synchronizing"的动词形式。约定：状态时大写 `Syncing`，动词时用 "refresh manifest"。
- **"circle" vs "layer"**：Layer 概念已废除，统一用 Circle + index（0-based 批次序号）。环名称（name）是语义名称：zerocircle / firstcircle / end_circle / circle.{index}。
- **目录名 vs 环名**：目录名是 `{basename}.circle_1`（下划线分隔），环名是 `zerocircle`（英文连写）。两者通过 index 关联但格式不同。

---

## 示例对话

> **Dev：** "一个 `hero_shot` 引用了 `@bg_1`，但 `bg_1` 的 status 还是 `drafting`，这时候 `hero_shot` 能被编译吗？"

> **领域专家：** "不能。编译时 `validateRefStatuses` 会检查所有 refs 的 status，必须是 `approved` 才能过。`hero_shot` 会报 `bg_1 is drafting, must be approved`。"

> **Dev：** "那我把 `bg_1` approve 之后，`hero_shot` 需要重新 `circle create` 吗？"

> **领域专家：** "不需要。`circle create` 是建拓扑图，写 manifest。你改了 frontmatter status，只要 `opsv circle refresh` 更新 manifest 里 `bg_1` 的 status 就行。"

> **Dev：** "`syncing` 状态是什么场景用的？"

> **领域专家：** "比如你 approve 了一个 shot，然后手工改了它的 prompt 文件——这时 status 自动变 `syncing`，表示这个 approved 结果已经过期，agent 需要重新对齐字段。审阅者看到 `syncing` 就知道这不是最终版本。"

> **Dev：** "Cloud Mode 下，审阅者拿到的链接是什么形式？"

> **领域专家：** "`https://review.opsv.cloud/s/{sessionId}?t={jwt}`，JWT 30 分钟过期，过期了要创作者执行 `opsv review --cloud --refresh` 生成新链接。"

# Trellis Spec 强约束与 OPSV Pack 设计分析

> 状态：架构分析与共享设计结论，不是实现说明。
>
> 分析对象：
>
> - Trellis：`/home/uncle7/code/Trellis`
> - OPSV Core：当前项目 `openspec-video`
> - OPSV Packs：项目现有 `packs/` 及外部 `opsv-packs`
>
> 本文的中心不是为 OPSV 增加更多抽象，而是回答一个问题：**如何借鉴 Trellis，让 Agent 在不同 Pack 定义的生产流程中，稳定地以 Asset Document 为核心执行工作，同时不把 OPSV 变成 Agent Framework。**

---

## 1. 先确定 OPSV 的第一性原理

### 1.1 OPSV 的核心对象是 Asset Document

OPSV 不是一个通用的 Agent 调度框架，也不是一个模型工具市场。它的核心职责是维护下面这条闭环：

```text
Pack 定义生产流程和文档要求
  → Agent 获得该流程所需上下文
  → Agent 创建或修改 Asset Document
  → 文档经过验证并进入 approved
  → opsv produce 将文档编译为任务队列
  → opsv run 产生 Artifact
  → 用户 review / approve
  → 必要时 syncing / sync 回写 Asset Document
  → approved 文档继续作为后续生产输入
```

因此 OPSV 的真正问题不是“如何让 Agent 变得更聪明”，而是：

1. Agent 是否拿到了当前 Pack 和当前阶段所需的上下文；
2. Agent 是否按照 Pack 定义的 Workflow 推进；
3. Asset Document 是否满足格式、依赖和生命周期约束；
4. `produce` 是否能从文档稳定提取任务输入；
5. 用户确认的结果是否能通过现有 Review/Syncing 机制回写；
6. 中断、重试和长期修改是否可追溯。

### 1.2 文档和产物是两层事实

OPSV 有两层：

```text
第一层：Asset Document
  类似 Trellis 中的代码/spec
  描述意图、依赖、Prompt、输入和一致性要求

第二层：Artifact
  类似代码执行后的效果
  是图片、视频、音频、3D 文件、参考图等具体产物
```

第一层通过文档格式、引用、Prompt 语法、Pack Contract 和 `produce` 约束。

第二层不能完全依赖静态文档判断，主要通过：

```text
Artifact
  → review
  → approve / revise
  → syncing（必要时）
  → sync
```

这和 Trellis 有本质差别：Trellis 主要验证代码实现是否符合规范；OPSV 还要承接用户对具体媒体产物的确认。但两者都需要一个共同机制：**把规范放进执行路径，而不是只放在说明文件里。**

### 1.3 硬约束和软约束必须分开

OPSV 应当强约束影响一致性的事实，不应强约束创作实现方式。

| 类型 | OPSV 应否强制 | 示例 |
|---|---:|---|
| 文档格式 | 是 | frontmatter、必需章节、字段类型 |
| Prompt 依赖语法 | 是 | 引用解析、依赖是否 approved |
| Workflow 顺序和前置条件 | 是 | 未完成前置步骤不能进入下游 |
| 输入输出 Contract | 是 | 当前步骤需要什么、产生什么 |
| `approved` / `syncing` 生命周期 | 是 | `syncing` 资产不能被下游消费 |
| `produce` 任务编译 | 是 | 文档无法提供 API 输入时阻塞 |
| 质量标准 | 由 Pack 提供指导、由用户确认 | 画面风格、构图取舍、参考程度 |
| 使用哪个工具 | 默认不强制 | ComfyUI、Blender、第三方 Agent、人工制作 |
| Agent Framework 内部拓扑 | 不强制 | 创建多少 Subagent、如何 handoff |
| 具体模型或 Provider | 由项目运行配置决定 | 不在 Bootstrap 中绑定机器和版本 |

一句话：

> **OPSV 强制“应该交付什么、当前是否可以继续”，尽量不强制“必须由哪个工具、哪个 Agent、哪种方法完成”。**

---

## 2. Trellis 最值得借鉴的设计思想

### 2.1 规范有明确的本地事实源

Trellis 把项目运行知识分成几个职责清晰的目录：

```text
.trellis/workflow.md
  工作阶段、状态、执行纪律

.trellis/spec/
  项目和层级的具体规范

.trellis/tasks/
  任务、PRD、设计、实现计划、研究和上下文选择

.trellis/workspace/
  会话记录和跨会话知识

平台目录（.codex / .claude / .cursor ...）
  Hook、Skill、Agent、平台适配
```

关键不是目录名字，而是所有权：

- Workflow 文件拥有“现在应当处于什么阶段”；
- Spec 拥有“代码应该遵循什么规则”；
- Task 拥有“本次工作选择哪些上下文以及交付什么”；
- 平台文件只负责注入和翻译，不拥有业务规则。

OPSV 应保持同样的所有权原则：

- Asset Document 拥有资产意图和当前批准内容；
- Pack 拥有某类生产领域的 Workflow 和文档规范；
- Core 拥有通用生命周期、依赖和阻断规则；
- Framework Adapter 拥有平台映射；
- Agent Framework 拥有内部 Agent/Subagent 创建和调度。

### 2.2 Spec 不是“让 Agent 记住”，而是每次执行时注入

Trellis 的重要洞察是：即使 Spec 在仓库里，Agent 也可能没有在当前轮次读取它。真正有效的是：

```text
当前任务和阶段
  → 选择相关 Spec
  → 通过 Hook / Skill 注入
  → Agent 执行
```

Trellis 的 `implement.jsonl` 和 `check.jsonl` 不是简单的文件列表，而是不同角色在不同阶段所需上下文的选择器。OPSV 应把这个思想映射为：

```text
Workflow Stage + Role + Asset
  → Context Manifest
  → Framework Adapter 注入
  → Agent / Subagent 执行
```

因此不能只在一个通用 Prompt 中说：

```text
“请阅读 Pack 并完成工作。”
```

应该在当前动作的上下文中明确提供：

```text
Document Contract
Prompt Contract
当前 Asset Document
相关 Approved References
阶段输入
阶段预期输出
允许的下一步
完成条件
Pack 的执行指导
```

### 2.3 状态提示不是一次性说明，而是持续的流程提醒

Trellis 通过 workflow state 在每轮会话中注入当前阶段提示，解决：

- 上下文压缩导致 Agent 忘记流程；
- 用户说“继续”后 Agent 跳过必要步骤；
- 主 Agent 与检查 Agent 对当前任务状态理解不同。

OPSV 的对应机制不应是复制 Trellis 的文本状态，而应由 Core 根据现有资产状态和 Pack Workflow 生成结构化下一步：

```text
Asset Document / Review / Circle / Pack Workflow
  → 当前执行状态
  → NextAction
```

平台 Adapter 可以把 NextAction 渲染成 Prompt 或原生框架输入，但不能自行重新解释业务状态。

### 2.4 不同角色应看到不同上下文

Trellis 把实现、检查、研究等职责拆成不同的 Agent/Skill，并为它们注入不同上下文。这降低了单个上下文窗口的负担，也减少了“一个 Agent 既写又审、最后自我批准”的风险。

OPSV Core 保留四个原子化标准角色：

```text
document-author
contract-checker
production-dispatcher
asset-quality-reviewer
```

它们不是 Pack 可以任意重定义的角色，而是 Core 的责任边界：

- `document-author`：创建和修改文档；不能自我批准；
- `contract-checker`：验证文档、依赖和结构；只读检查；
- `production-dispatcher`：推进已有 `produce / run` 和外部生产能力；不替代 `produce`；
- `asset-quality-reviewer`：根据 Pack 提供的默认质量标准进行检查和建议；不代替用户最终决定。

Pack 只需要声明当前阶段中这些角色是：

```text
required / optional / not_applicable
```

如果需要 Blender Agent、代码动画 Agent 或其他第三方专业 Agent，那是 Agent Framework 的能力或 Pack 推荐的外部能力，不必把每一种专业能力都升级成 OPSV Core 角色。

### 2.5 平台 Hook 和 Subagent 机制是 Adapter

Trellis 的设计并没有要求业务层理解每个 Agent 平台的内部协议。平台差异由 Adapter 消化：

```text
OPSV Context Manifest
  → Framework Adapter
  → 原生 Hook / SubagentStart / Skill / MCP / Graph Node
  → 宿主 Agent Framework
```

OPSV 不负责实现 Agent Framework，也不应发明一个新的通用 A2A 协议。OPSV 只提供：

```text
当前执行身份
Context Manifest
Workflow 约束
输入输出 Contract
完成条件
结果引用
```

宿主框架负责：

```text
创建 Agent / Subagent
原生 handoff
会话和并发调度
框架内部的工具发现
```

推荐采用：

```text
Push-first
  优先通过框架原生机制注入上下文

Pull-fallback
  不支持推送时，Agent 显式读取 Context Manifest

Required context 无法验证
  阻断当前动作
```

### 2.6 Trellis 的事件存储思想可以借鉴，但不能照搬整个 Channel

Trellis 的核心持久化模式是：

```text
typed mutation
  → append-only events.jsonl
  → lock + monotonic seq + idempotencyKey
  → pure reducer
  → WorkerState projection
```

OPSV 可以借鉴这个机制，用于记录执行计划、步骤、角色、尝试、Gate、Review、Sync 和下一步。

但不要把 Trellis 的这些 Channel 领域对象复制进 OPSV：

```text
worker inbox
thread / forum
chat message
conversation management
worker process scheduler
```

OPSV 的事件只记录自己的执行事实，并引用现有领域事实：

```text
Asset Document
Task JSON
Artifact
Review / Approve
Sync
Git commit
```

---

## 3. Trellis 如何形成 Spec 强约束闭环

Trellis 的约束不是单一 Prompt，而是多层合力：

```text
本地规范文件
  → 任务选择相关规范
  → 状态驱动当前阶段
  → Hook / Skill 注入上下文
  → Agent 执行
  → check 验证
  → finish / update-spec 回写知识
```

可以把约束分成四层：

| 层 | 作用 | OPSV 对应物 |
|---|---|---|
| 认知层 | 解释规则和方法 | Pack `SKILL.md`、guides、references |
| 上下文层 | 将相关规则送入当前 Agent | Bootstrap、Context Manifest、Framework Adapter |
| 程序层 | 决定当前阶段和可做动作 | Execution Record、NextAction、Policy |
| 机器层 | 拒绝非法状态 | Core Validator、Pack Checker、Gate、produce 输入检查 |

其中前两层保证 Agent “知道应该怎样做”，后两层保证系统“不能随意继续”。

这是 OPSV 应该学习的根本结构：

> **不把所有约束塞进 Prompt，也不期待所有规则都由代码表达；把说明、上下文、状态和机器验证放在正确的层。**

---

## 4. OPSV 的正确职责边界

### 4.1 OPSV Core

```text
Asset Document 生命周期
文档和引用验证
Pack/Project 配置解析
Workflow 状态和下一步
Gate 及阻断语义
produce / run 的现有生产链路
review / approve / syncing / sync
Execution Record 和追踪
Framework Adapter 的输入输出边界
```

### 4.2 Pack

```text
MV、微课、短剧、3D Previs 等领域 Workflow
不同阶段需要哪些文档输入
文档的格式和 Prompt 写作要求
依赖语法和输入映射要求
每个阶段预期输出什么 Artifact
默认质量检查标准
推荐的工具、Skill、Subagent 或模型 API
Pack 专属的验证条件
```

Pack 负责定义“这个领域怎样生产”，但不应取代 Core 的通用生命周期。

### 4.3 Framework Adapter

```text
将 Context Manifest 注入宿主 Agent Framework
将 NextAction 映射为框架原生调用
使用原生 SubagentStart / Handoff / Skill / MCP
收集执行结果并返回 OPSV 可理解的 Receipt
```

### 4.4 Host Agent Framework

```text
Agent 创建
Subagent 创建
内部 handoff
工具发现
会话管理
并发管理
```

OPSV 不要求所有框架采用相同的 Subagent 协议，只要求 Adapter 能把 OPSV 的执行上下文和结果接回来。

---

## 5. Pack 的正确抽象：Workflow Contract，而不是工具清单

### 5.1 Pack 定义 Workflow 的目标，不锁死实现

一个 Stage 应主要定义：

```yaml
stage: scene-previs
purpose: 为后续镜头提供场景空间参考
inputs:
  - scene_document
  - approved_character_refs
outputs:
  - contract: scene-layout-reference-v1
completion:
  - output_exists
  - output_contract_valid
  - document_status_approved
quality_guidance:
  - references/scene-previs-quality.md
recommended_capabilities:
  - scene_3d_builder
  - multi_view_renderer
```

这里的核心是：

```text
需要输入什么
希望得到什么
什么状态才算可以继续
```

而不是：

```text
必须创建某个 Subagent
必须调用某个工具
必须使用某个 Provider
```

### 5.2 工具和能力是推荐实现

Pack 可以注册或推荐：

```text
ComfyUI Model API
Blender Agent
MCP Server
脚本
外部生产服务
用户手工操作
```

但推荐项默认是软约束：

```text
Agent 可以发现其他工具
用户可以接管当前步骤
第三方工具可以产生结果
```

只要最终结果满足 Workflow Contract 并进入正常 Review/Approve 生命周期，就可以继续下游。

### 5.3 ComfyUI 的定位

当前 ComfyUI 属于 OPSV 已有的模型 API / Provider 生产路径：

```text
Asset Document
  → opsv produce
  → ComfyUICompiler / RunningHub Compiler
  → api_config.yaml + inputs + node_mappings
  → Task JSON
  → opsv run
  → Artifact
```

OPSV 不需要知道 ComfyUI 内部如何搭建工作流，只需要保证：

```text
文档能提供需要的输入
Task JSON 映射正确
输出能进入 Artifact / Review 流程
```

Pack 可以声明某阶段需要：

```text
positive_prompt
negative_prompt
reference_images
camera_parameters
first_frame
last_frame
```

项目的 `api_config.yaml`、Provider Compiler 和现有 `node_mappings` 继续负责把这些输入绑定到具体模型 API。

如果用户用其他方法生成了符合 Contract 的 Artifact，也不应被要求伪装成 ComfyUI Task。

### 5.4 工具注册的最小作用

注册工具可以提供：

```text
名称
说明
可接受的输入 Contract
可以产生的输出 Contract
推荐的调用方式
```

不应默认形成：

```text
工具白名单
强制调用顺序
新的工具调度系统
```

工具选择是软约束；Workflow 输出和 Gate 才是硬约束。

---

## 6. Bootstrap：把 Pack 规范注入项目执行上下文

### 6.1 Bootstrap 的职责

```text
Pack Stack + Project Config
  → opsv bootstrap
  → .opsv/bootstrap/
```

Bootstrap 生成项目级的执行上下文，例如：

```text
Pack Stack 锁定结果
Workflow Graph
Role Context 模板
Stage / Step Context 规则
Document Contract
Prompt Contract
Input / Output Contract
Gate 和 Policy
推荐能力
Framework Adapter 所需信息
```

Bootstrap 不是：

```text
opsv produce
模型任务队列
Provider 版本解析
机器路径绑定
Agent 启动器
```

现有职责保持不变：

```text
opsv produce
  = Asset Document → Provider/model-specific Task Queue
```

### 6.2 Bootstrap 的过期规则

Execution 启动前需要确认 Bootstrap 与当前项目规范一致：

```text
Pack
Project Config
Workflow Graph
Document Contract
Prompt Contract
```

任一内容改变而 Bootstrap 未更新时：

```text
bootstrap_stale
execution_blocked
```

运行时 Provider、工具版本和机器环境不纳入 Bootstrap 的绑定范围，由现有运行配置和 Adapter 在执行时解析，并写入执行记录。

### 6.3 Context Manifest

Bootstrap 提供规则模板，Execution 再根据当前：

```text
project_id
asset_id
stage_id
step_id
role
attempt
```

生成当前动作所需的 Context Manifest。它应包含最小必要上下文：

```text
Asset Document
文档格式要求
Prompt 依赖语法
当前阶段输入
相关 Approved References
预期输出
完成条件
Pack 的 Workflow 指导
推荐能力和工具信息
```

上下文采用：

```text
Push-first：优先使用宿主框架原生注入
Pull-fallback：不支持推送时显式读取 Manifest
```

必需上下文无法获得时，当前动作不能继续。大媒体文件使用引用，不能把媒体本身塞入 Prompt；上下文过长时应减少非必需指导，不得静默丢失必需 Contract。

---

## 7. 四个标准 Subagent Role 与外部能力

OPSV Core 保留四个原子化标准角色：

```text
document-author
contract-checker
production-dispatcher
asset-quality-reviewer
```

Pack 对每个 Stage 指定这些角色的适用性：

```text
required / optional / not_applicable
```

### 7.1 标准角色职责

```text
document-author
  创建或修改 Asset Document

contract-checker
  检查文档格式、依赖、Prompt 语法和 Pack Contract

production-dispatcher
  推进现有 produce/run，或协调外部生产能力

asset-quality-reviewer
  按 Pack 提供的默认标准辅助检查和反馈
```

质量 Reviewer 不是最终质量裁判。质量接受仍由用户通过既有 Review/Approve 决定。OPSV Core 只强制结构、一致性和生命周期规则。

### 7.2 外部专业 Agent 不扩张 Core Role

复杂任务可能需要：

```text
Blender 3D 构建
多角度渲染
代码动画 Previs
空间布局分析
第三方媒体生产能力
```

这些不需要都变成第五、第六个 OPSV Core Role。它们可以由宿主 Agent Framework 自行发现和调用：

```text
原生 SubagentStart
Skill
MCP
Agents-as-Tools
Graph Node
第三方 Agent Framework
```

Pack 只声明：

```text
所需输入
预期输出
完成证据
推荐能力
```

OPSV 关心结果是否满足 Contract，不关心内部创建了几个 Subagent。

### 7.3 Framework Adapter 的最小边界

OPSV 无法百分之百观察任意 Agent Framework 的内部拓扑。因此 Adapter 的责任是把以下信息接回 OPSV：

```text
当前 ExecutionContext
使用的 Context Manifest
请求的 Role / Capability
结果文件和引用
执行状态
```

Agent 的自然语言不能替代结构化结果；但 OPSV 也不应因此设计一套新的 Subagent 框架。它只需要为宿主框架提供清晰的输入和输出接缝。

---

## 8. Execution Record：借鉴 Trellis，但保持足够小

用户已经确认 OPSV 需要项目级执行记录层，用于：

```text
制定计划
分步执行
验证
记录
恢复
追溯下一步
```

### 8.1 计划生命周期

```text
createExecution
  → planning
  → 从 graph.yaml、Pack Policy、Bootstrap 和 Asset Scope 派生计划
  → validate
  → 根据 Policy 获得必要授权
  → startExecution
  → running
```

Execution Record 不取代 Pack `graph.yaml`，也不取代 Circle、Task Queue、Review 或 Syncing。它记录的是项目级执行过程及其引用。

### 8.2 两种修改机制必须分开

#### 短程：`iterate + review + syncing`

用于用户对具体任务或 Artifact 的局部指导：

```text
修改任务 JSON
  → opsv iterate
  → run
  → review
  → approve modified task
  → syncing
  → Agent 回写 Asset Document
  → opsv sync
```

这是正常的短程生产循环，不修改长期执行计划。

#### 长程：Plan Revision

用于对执行历史进行追溯性修改：

```text
plan-v1
  → 已有执行历史
  → 发现长期目标、阶段依赖或范围需要改变
  → 影响分析
  → plan-v2
  → 重新打开受影响阶段
```

Plan Revision 记录长期执行意图和影响范围，不直接绕过 Asset Document 生命周期。具体变化仍然通过文档工作流或 `iterate + review + syncing` 落地。

### 8.3 最小事件记录

建议参照 Trellis 的核心事件存储模式：

```text
typed mutation
  → append-only events.jsonl
  → reducer
  → current state projection
  → NextAction
```

OPSV 只需要自己的事件类型：

```text
execution
plan
stage / step
role
context
produce / run
artifact
gate
review
syncing
next_action
plan_revision
```

不需要复制 Trellis 的 Channel、消息、Worker Inbox 等领域。

建议目录：

```text
.opsv/execution/
  项目级、可审阅、可 Git 追踪的执行记录

.opsv/runtime/
  宿主框架的临时会话、心跳、原始日志和进程信息
```

`events.jsonl` 是执行历史来源；当前状态可以由 Reducer 重建。现有 Asset Document、Task JSON、Review Frontmatter 和 Git 历史仍然各自拥有自己的领域事实。

### 8.4 NextAction 和并行

OPSV Core 根据当前状态计算合法动作：

```text
当前状态
  → NextAction / ReadyActionSet
```

Framework Adapter 执行动作，但不能从整份 Pack Prompt 中自行猜测下一步，也不能跳过未满足的前置条件。

项目级执行可以有多个互不依赖的 Ready Action；OPSV 不负责管理具体 Agent 进程和 GPU 队列，只负责声明哪些动作当前合法。

失败重试保留新的 Attempt，不覆盖历史；中断状态需要恢复或人工确认。这个机制借鉴 Trellis 的事件和状态投影思想即可，不需要构建完整的分布式调度系统。

---

## 9. Review、Syncing 与外部产物

OPSV 现有的生产闭环必须保持为唯一资产确认路径：

```text
Artifact
  → review
  → approve
  → approved
```

若用户或 Agent 修改了任务并批准修改结果：

```text
Artifact
  → approve modified task
  → syncing
  → sync
  → approved
```

用户也可以通过外部工具创建符合当前 Workflow Output Contract 的 Artifact。接入时不必伪造 ComfyUI 或其他 Provider 的 Task JSON；可以记录最小的 Artifact 来源和输入关联，然后进入同一 Review/Approve 过程。

工具是否注册、由哪个 Agent 创建、是否由用户手工完成，都不是最终接受条件。最终接受条件是：

```text
产物能被当前步骤识别
输入关联明确
基础格式和一致性 Contract 通过
用户完成 Review/Approve
```

主观质量由用户决定。Pack 可以提供默认的质量检查指导，Quality Reviewer 可以提供建议，但不代替用户批准。

---

## 10. Pack 应该如何设计

### 10.1 Pack 声明领域 Workflow

不同视频类型可以有不同流程：

```text
MV
  音乐分析 → 风格/角色/场景 → Previs → 镜头 → 剪辑参考

微课
  知识结构 → 分镜 → 讲解画面 → 字幕/音频 → 课程审核

短剧
  剧本 → Shotlist → Clip → Shot → Continuity → 剪辑

3D Previs
  场景描述 → 简化空间 → 多角度参考 → 摄像机运动 → 视频参考
```

Pack 不要试图把所有类型统一为同一个固定流程。应当定义：

```text
Stage
Step
输入
输出
前置条件
文档要求
Prompt 要求
推荐能力
完成条件
```

### 10.2 Pack 负责注入，而不是让 Agent 自己寻找规则

当前问题不是 Pack 没有内容，而是内容没有完整进入 Agent 的当前上下文。每个 Stage + Role 应该得到对应的 Context Manifest：

```text
document-author
  → 文档模板、章节要求、Prompt 语法、示例

contract-checker
  → 验证 Schema、依赖规则、输入输出 Contract

production-dispatcher
  → 当前 Stage 的生产输入、输出、produce/run 规则、推荐 Provider/API

asset-quality-reviewer
  → Pack 默认质量检查说明、用户可见的 Review 目标
```

Agent 不必加载整个 Pack；Core/Bootstrap/Adapter 负责选择当前动作所需的最小上下文。

### 10.3 Pack 工具和模型 API的声明

Pack 可以声明推荐的工具、Skill、模型 API 或外部能力，但默认不形成白名单。

应明确区分：

```text
Production Model API
  通过现有 produce/run 产生任务和 Artifact

Agent Tool / Skill
  供 Agent 在撰写、检查、辅助操作时使用

External Capability
  由 Agent Framework 自行发现并通过原生机制调用
```

ComfyUI 当前属于 Production Model API。Pack 可以要求某阶段需要 ComfyUI 类型的输入映射，但不应把 ComfyUI 当成 Agent Tool；同样，也不应禁止用户用其他方式得到合格结果。

### 10.4 质量标准保持轻量

Pack 可以提供默认标准：

```text
质量检查清单
参考图使用要求
连续性提示
镜头/空间/角色的注意事项
```

这些内容主要作为：

```text
Agent 上下文
Reviewer 指导
用户 Review 参考
```

不要为了它们新增复杂的通用量化模型。只有已经明确、可稳定验证的结构和依赖，才进入 Core 或 Pack Validator 的硬 Gate。

---

## 11. 推荐的项目级执行结构

### 11.1 Bootstrap

```text
Pack Stack + Project Config
  → opsv bootstrap
  → .opsv/bootstrap/
```

Bootstrap 保存：

```text
Pack 锁定信息
Workflow 规则
Role Context 模板
文档和 Prompt Contract
输入输出定义
Gate / Policy
推荐工具和能力
```

它不负责：

```text
Asset Document → Task Queue
Provider 版本解析
运行机器绑定
Agent Framework 内部调度
```

### 11.2 Execution

```text
.opsv/execution/<execution-id>/
  plan.json
  events.jsonl
  state.json
  contexts/
  receipts/
```

### 11.3 Runtime

```text
.opsv/runtime/
  宿主框架会话
  心跳
  原始日志
  进程信息
```

Runtime 丢失不应让项目丢失计划和执行历史；恢复由事件、现有 Task、Artifact、Review 和 Git 记录完成。

---

## 12. 实施优先级：先解决当前真实问题

### Phase 1：Bootstrap 和 Context Injection

目标：先解决 Agent 没有理解 Pack、没有拿到格式和命令要求的问题。

```text
Pack + Project Config
  → opsv bootstrap
  → Stage + Role Context Manifest
  → Framework Adapter 注入
```

优先支持明确有 `SubagentStart` 的 Agent Framework。其他框架通过 Pull-fallback 读取 Manifest。

这一阶段不改变 `produce`、模型 API、Task Queue 或 Review/Syncing。

### Phase 2：Workflow 驱动的 Execution Record

目标：解决 Agent 没有完整执行 Pack Workflow 的问题。

```text
create
  → planning
  → validate
  → start
  → running
  → review / syncing
  → completed / blocked
```

Core 产生 `NextAction`；Framework Adapter 执行；事件和 Receipt 记录过程。

### Phase 3：四个标准 Role 的原生交接

目标：解决没有调用 Subagent、上下文窗口过大的问题。

```text
document-author
contract-checker
production-dispatcher
asset-quality-reviewer
```

Core 固定角色边界，Adapter 使用宿主框架自己的 Subagent/Handoff 机制。Pack 提供领域上下文和流程要求，不定义 Core 角色拓扑。

### Phase 4：Pack 迁移和 Conformance

目标：让现有 MV、微课、短剧、3D Previs Pack 都能以同一执行接口工作。

检查：

```text
每个 Stage 的输入能否从文档获得
每个 Stage 的输出是否有明确 Contract
当前 Role 是否获得完整 Context
用户是否可以在结果 Review 后继续 iterate/sync
推荐工具是否没有被误当成硬白名单
```

---

## 13. 明确不做的事情

为了保持 OPSV 的核心边界，当前不做：

1. 不把 OPSV 做成 Agent Framework；
2. 不实现统一的 Subagent 调度协议；
3. 不复制 Trellis 的 Channel、聊天和 Worker 管理；
4. 不重新设计 `opsv produce` 及现有 Provider Task Queue；
5. 不把 ComfyUI 从 Model API 改造成 Agent Tool；
6. 不建立工具强制白名单；
7. 不要求所有外部生产必须伪装成 OPSV Task；
8. 不建立独立、复杂的主观质量量化系统；
9. 不以 Agent 的自然语言回复作为完成证明；
10. 不让 Plan Revision 替代短程 `iterate + syncing`；
11. 不让平台 Hook 复制 Pack 业务规则；
12. 不把整份 Pack 无差别塞进每个 Agent 的上下文。

---

## 14. 最终架构结论

Trellis 对 OPSV 最重要的启发可以压缩成四句话：

### 第一，规范必须进入执行路径

Pack 文件存在于仓库中还不够。Bootstrap 和 Context Manifest 必须把当前 Stage + Role 所需的规范送入 Agent。

### 第二，流程必须由持久化状态推进

不要只依赖长 Prompt 和 Agent 记忆。Core 应计算当前合法动作，并保留执行记录，使流程可以恢复和追溯。

### 第三，规范和平台必须分离

OPSV 定义执行边界；Framework Adapter 使用宿主框架的原生 Agent/Subagent/Handoff；OPSV 不变成另一个 Agent Framework。

### 第四，文档是生产闭环的中心

```text
Pack Workflow
  → Context Injection
  → Asset Document
  → approved
  → opsv produce
  → Task Queue
  → Artifact
  → review
  → syncing / sync
  → Asset Document
```

最终原则是：

> **OPSV 不负责替 Agent 选择所有工具，也不负责替用户决定所有质量。OPSV 负责让 Agent 在正确的 Pack 上下文中，按照可追踪的 Workflow 生成和维护 Asset Document，并保证已经确认的文档能够稳定地编译、执行、评审和回写。**

---

## 15. 参考文件

### Trellis

- `/home/uncle7/code/Trellis/.trellis/workflow.md`
- `/home/uncle7/code/Trellis/.trellis/config.yaml`
- `/home/uncle7/code/Trellis/.codex/hooks/inject-subagent-context.py`
- `/home/uncle7/code/Trellis/.codex/agents/trellis-implement.toml`
- `/home/uncle7/code/Trellis/.codex/agents/trellis-check.toml`
- `/home/uncle7/code/Trellis/.codex/agents/trellis-research.toml`
- `/home/uncle7/code/Trellis/packages/core/src/channel/internal/store/events.ts`
- `/home/uncle7/code/Trellis/packages/core/src/channel/internal/store/worker-state.ts`
- `/home/uncle7/code/Trellis/packages/core/src/channel/api/spawn.ts`

### OPSV

- `.trellis/spec/architecture.md`
- `docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md`
- `cli/src/core/NextAction.ts`
- `cli/src/core/WorkPacket.ts`
- `cli/src/core/PackChecker.ts`
- `cli/src/core/ReviewService.ts`
- `cli/src/core/SyncService.ts`
- `cli/src/core/ApproveService.ts`
- `cli/src/core/compiler/providers/ComfyUICompiler.ts`
- `opsv-cli-skill/references/agent-contract.md`
- `packs/mv-3d-previs/pack.yaml`
- `packs/mv-3d-ref/pack.yaml`
- `packs/short-drama/pack.yaml`

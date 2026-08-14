# OPSV 彻底重构开发计划 —— 内核下沉为 Asset State Runtime + Production Graph + Review Runtime

> 日期：2026-08-14
> 分支：`refactor/chatgpt-analysis-overhaul`（计划）→ `refactor/canonical-runtime-exec`（执行，12 commit）
> 上游分析：ChatGPT 对 opsv 项目的分析（`~/文档/clawbay/20_Projects/opsv/chagpt 对opsv 项目的分析.md`，2026-08-13）
> 权威计划：`.trellis/tasks/08-14-chatgpt-analysis-overhaul/`（prd.md / design.md / implement.md）
> 继承：`docs/OPSV_IMPROVEMENT_PLAN_FROM_TRELLIS_ANALYSIS_2026-08-09.md`（A/B/C/D 已交付，v0.18.0）、`docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md`
> **实施状态：P0–P6 全部完成**（2026-08-14，786 测试绿）。见 §4 各阶段验收。

---

## TL;DR

OPSV 正在越做越重——为了约束 Agent，连续叠加了 Hook 注入、Context Manifest、Execution Record、角色模板。ChatGPT 分析给出一个方向性的刹车：

> **OPSV 不控制工作如何完成，只控制什么能够成为正式资产。**
> **Don't constrain the agent. Constrain the state transition.**

本计划把 OPSV 收敛为：**Asset State Runtime + Production Graph + Review Runtime**。核心动作是**内核下沉 + Agent 层变薄**——补上当前缺的 Canonical Model（中间表示）、Formal Parser、Asset State Machine、Commit Boundary、Capability Registry、Review Protocol；同时把已经建好的 Hook 层从「工作流强制」重定位为「可选发现」。

一句话：**把「约定」变成「语言」，把「语言」编译成「状态机」**。

---

## 1. 为什么重构

### 1.1 ChatGPT 分析的核心论点

| # | 论点 | 含义 |
|---|---|---|
| 1 | 不要做 Hook System | 视频 Agent 生态（Claude/Codex/Cursor/Gemini/自定义）不能靠 OPSV 去 hook 每一个平台；那会变成 Agent Harness |
| 2 | 需要的是薄适配层 | OPSV 给 Agent 一个「生产协议」（inspect/plan/execute/validate/commit），不控制 Agent 怎么工作 |
| 3 | Skills own capabilities. OPSV owns state. | Skill 拥有能力（怎么生成）；OPSV 拥有状态（项目、版本、shot、依赖、约束、artifact、验证） |
| 4 | Capability 而非 Skill | OPSV 问「你有什么 Capability」（video.generate），不问「你有什么 Skill」 |
| 5 | Commit Boundary | 像 git 一样：Agent 在外面随便做，但只有经过 `opsv commit` 的东西才是正式资产 |
| 6 | Artifact Contract | 契约不规定「怎么生成」，只规定「要成为 OPSV 资产必须满足什么条件」 |
| 7 | Asset State Machine + Transition Log | draft → candidate → review → approved → released；每次转换有 actor/reason/timestamp |
| 8 | Review = State Mutation | 评审不是 comment，而是结构化 annotation → 状态变更 → 任务修订 → Agent |
| 9 | Reference DSL | `@alice`/`@alice:v3`/`@alice.face`/`@shot-023.output` → AST → 确定性依赖图 |
| 10 | Timeline 一等公民 | Timeline 是语义容器（segment），不是 prompt 的附加字段 |
| 11 | H3 Prompt = 编译产物 | Semantic Model → Prompt Compiler → Provider Prompt；prompt 不再是唯一信息源 |

### 1.2 与现状的差距

现状（v0.18.1）已经有：文档即源、@ref 依赖图、circle DAG、packs、work packet、review/approve/sync、hook 注入、execution record、四角色、bootstrap、conformance 六检。**缺的不是更多机制，而是缺一个「中间表示」和「状态内核」**：

| 分析要求 | 现状差距 |
|---|---|
| Canonical Model（中间表示） | 文档即模型；无独立 IR，Timeline/Action/Camera 埋在 prose 里 |
| Formal Parser（Markdown → AST → Canonical） | 只有 YAML frontmatter 解析 + @token 解析；正文自由文本 |
| Asset State Machine + Transition Log | 文档只有 drafting/syncing/approved 三态；review 是动作不是状态；无转换日志 |
| Commit Boundary + Artifact Contract | 一切在 OPSV 内闭环；无「外部产物唯一入口」，无产物级验证 |
| Capability Registry + Contract | Profile 有 capability 概念，但无系统级注册表/契约/发现 |
| Review = State Mutation | review 是记录，不是结构化 annotation 驱动的状态变更 |
| Agent 层变薄 | 08-09 建的 Hook 注入层偏重，方向是「约束 Agent」而非「约束状态转换」 |

---

## 2. 目标架构（五层）

```
┌──────────────────────────────────────────────┐
│ Agent / Human（不控制）                       │
│ Claude / Codex / Gemini / Custom Agent / UI   │
│  + 外部 Skill / MCP / API / ComfyUI           │
└──────────────────────┬───────────────────────┘
                       │ Authoring / Actions
                       ▼
┌──────────────────────────────────────────────┐
│ OPSV Authoring Layer                         │
│ Markdown / @ref DSL / Timeline DSL / H3      │   ← 现有文档规范 = 语言，不推翻
└──────────────────────┬───────────────────────┘
                       │ parse / normalize
                       ▼
┌──────────────────────────────────────────────┐
│ OPSV Canonical Model（唯一契约）              │   ← 新增：Canonical IR
│ Project / Asset / Shot / Segment / Task /    │
│ Dependency / Timeline / Reference /          │
│ Constraint / Artifact / Review               │
└──────────────────────┬───────────────────────┘
                       │ create / update / commit / validate / transition / resolve
                       ▼
┌──────────────────────────────────────────────┐
│ OPSV Runtime（内核下沉）                      │
│ Asset State Machine + Transition Log / DAG / │
│ Version / Provenance / Validation / Commit   │
│ Boundary / Capability Registry / Execution   │
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│ Review Runtime                               │
│ Review Protocol / Canvas / 3D / Timeline      │   ← 现有 review-ui + tunnel 提升
└──────────────────────────────────────────────┘
```

**OPSV 强控制下面三层**（Canonical Model / Runtime / Review Runtime）；**不控制上面两层**（Agent 和 Skill）。

### 角色重定义（分析 §22）

```
OPSV   = Canonical State Model + State Transition + Asset Graph + Review Runtime
Agent  = State Editor / Task Executor
Skill  = Capability Provider
API    = Capability Provider
Markdown = Authoring Language
Prompt = Provider-specific Compilation Target
Hook   = Optional Discovery Mechanism
```

---

## 3. 关键机制设计（要点）

### 3.1 Canonical Model v1

新增 `cli/src/canonical/`（Zod schema + TS 类型，纯中间表示，**不是存储格式**）：

- `CanonicalTimeline` = `CanonicalSegment[]`（segment: `{id, start, end, subjects[], scene[], action, camera, prompt, references[], constraints[]}`）
- `CanonicalReference` = ReferenceExpression AST（`@alice:v3` → `{namespace, id, selector, variant, state, raw}`）
- `CanonicalAsset` = `{id, category, docPath, document, timeline, refs, approvedRefs, status, artifacts, reviews}`
- `CanonicalArtifact` = `{id, taskId, uri, type, mediaInfo, provenance, validation, state}`
- `CanonicalReview` = `{kind, timeline, target, issue, severity, comment, actor, timestamp}`

**不变量**：Canonical 永远从现有文档**无损推导**（round-trip 断言），绝不成为文档的第二权威。

### 3.2 Formal Parser

- 现有 `FrontmatterParser` + 新增 `BodyGrammarParser`（识别 `## Subject/Scene/Action/Camera`、`### Timeline`、`0-4s`/`00:32-00:36`、multi-ref `## 镜头 NN-1｜标题 时长 Ns` 边界）+ `RefExpressionParser`。
- **Reference DSL v2**（向后兼容）：`@[ns:]id[.selector][:variant][[state]]`。selector 仅在 pack 声明白名单（`selectors:`）时解析，否则 `.` 保留句号语义（不破坏现有解析）。
- **H3 Prompt 分步语义化**：v1 保留 prompt 原文编译；semantic-state → prompt 编译放后期，等 parser 覆盖率充分。

### 3.3 Asset State Machine + Transition Log

```
draft → candidate → review → approved → released
review → rejected → candidate
approved → superseded（新 variant 触发，旧 artifact 不删除）
```

- 双层状态协调：文档生命周期（drafting/syncing/approved）不动，属作者侧；资产状态机属产物侧；`opsv approve` 一处实现双写。
- Transition Log：`.opsv/state/<asset>.jsonl` append-only，`{asset, from, to, actor, reason, timestamp}`；只有日志记录的转换才合法，非法转换 fail-closed。

### 3.4 Commit Boundary + Artifact Contract

- `opsv commit <artifact> --task <id>`：外部产物唯一入口。validate（type/duration 容差/codec/resolution/provenance）→ accept 进 candidate / reject 返回结构化 errors。
- `opsv import <path>`：Normalization Layer——外部产物规范化（infer type / 补齐 task+timeline+refs）→ Canonical Asset。
- Artifact Contract 存于 pack `profiles/<profile>.yaml` 的 `artifact:` 块；缺省用 core 内置最小契约。

### 3.5 Capability Registry

- `capability: {id: video.generate, input: opsv.shot, output: artifact.video}` 契约。
- `opsv capabilities` 发现：读现有 `api_config.yaml models:` + `project.yaml bindings:` + pack `recommended_capabilities`。**不新增存储、不新增第三注册表**。

### 3.6 Review Runtime / Protocol

- Review annotation 结构化 → Asset State 变更 → Task Revision → Agent。
- Review Protocol 端点：`GET /project`、`GET /assets/:id`、`POST /assets/commit`、`POST /assets/:id/review`、`POST /assets/:id/approve`。
- 现有 `review-ui/` + `tunnel/` 作为承载；Web/Canvas/3D/Timeline 都是 Client。

### 3.7 Agent 层变薄

- Operator Skill 只讲 5 件事：读 state / 解析 @ref / 改文档 / commit 产物 / 处理 review。
- Hook 重定位为可选发现：SessionStart 只发现「这是 OPSV 项目」；workflow-state 面包屑改读 `.opsv/state/` 投影；subagent-context 降级为仅在匹配生产动作时注入。**不删除**，保持 standalone + 幂等。

---

## 4. 六阶段执行计划

| Phase | 内容 | 交付 | 依赖 |
|---|---|---|---|
| **P0 契约冻结** | Canonical Model v1 写成正式 spec（`.trellis/spec/canonical-model/`） | spec 文档 + 语言词典增补 | — |
| **P1 Canonical Model** | `cli/src/canonical/schema/` 全 schema + 互转函数 | 类型 + round-trip 测试 | P0 |
| **P2 Formal Parser** | 文档 → AST → Canonical；Reference DSL v2；Timeline 解析 | parser + fixture 无损断言 | P1 |
| **P3 Runtime** | Asset State Machine + Transition Log + `opsv commit/import` + Artifact Contract | 状态机 + commit/import + 校验器 | P2 |
| **P4 Agent 层变薄** | Operator Skill 瘦身 + hook 重定位 + WorkPacket 从 canonical 投影 | 瘦身 skill + 改造 hook | P3 |
| **P5 Capability** | Capability Registry + `opsv capabilities` | 注册表 + 命令 + 校验 | P3 |
| **P6 Review Runtime** | Review = State Mutation + Review Protocol | 结构化 review + API | P3/P5 |

每 Phase：`npm run build` + `npm test`（基线 597+ 全绿）+ `npm run lint`（errors=0）为评审门；每 Phase 独立 commit 可回滚。

**实施结果（2026-08-14 全部落地）**：

| Phase | 交付 | 测试 |
|---|---|---|
| P0 | `.trellis/spec/canonical-model/` 六份正式 spec + 语言词典 8 词条 | task.py validate |
| P1 | `cli/src/canonical/schema/`（Zod schema + 无损互转） | +35 |
| P2 | `cli/src/canonical/parser/`（Reference DSL v2 + body grammar + normalizer） | +29 |
| P3a | `cli/src/canonical/state/`（Asset State Machine + TransitionStore） | +29 |
| P3b | `cli/src/canonical/artifacts/`（Artifact Contract + Validator + CommitService）+ `opsv commit`/`import` + approve 双写 | +17 |
| P4 | Operator Skill 增补（Commit Boundary/Capabilities/Review）+ 测试守卫 | +5 |
| P5 | `cli/src/canonical/capabilities/` + `opsv capabilities` | +8 |
| P6 | Review Protocol v1（`/api/canonical/*`）→ 状态变更 | +6 |

基线 653 → **786 测试全绿**，`tsc --noEmit` 干净，lint errors=0。

---

## 5. 不变量与约束（不可违反）

1. 继承全部 Core 不变量：`delete: never`、append-only、one asset = one document、三 tier config、approval 显式、compile/execute/review 分离、standalone（不读 `.trellis/`）。
2. **现有文档规范不推翻**——@ref + Timeline + H3 + Shot/Asset + 分段保持可用；Canonical 由 Parser 从现有文档无损推导。
3. **不重造已交付机制**——Stage Contract、四角色、Bootstrap、Execution Record、Conformance 六检、Work Packet/NextAction 建立在之上。
4. **不新增第三注册表**——Capability Registry 是声明层视图。
5. **Hook 重定位而非删除**。
6. 明确非目标：不做 Agent Harness、不发明 Video IR 行业标准、不重新实现 Provider、Review 客户端（Canvas/3D/VR）不在一阶段全做。

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| Reference DSL 加 `.` 破坏现有解析 | selector 白名单机制 + 全部旧 `parseKey` 用例测试守护 |
| 状态双轨变多源 | 双层状态各自属主清晰；approve 一处实现双写；Transition Log 为产物侧唯一事实 |
| Canonical 层变成第二个文档实现 | 硬性 round-trip 断言：Canonical 永远从文档推导 |
| H3 prompt 语义化破坏现有 provider 编译 | 分步：v1 保 prompt 原文编译；semantic-state 编译放后期 |
| Hook 删除引发回归 | 不删除，只重定位；standalone + 幂等保持 |

---

## 7. 关联

- 权威计划与验收：`.trellis/tasks/08-14-chatgpt-analysis-overhaul/prd.md`
- 技术设计：`.trellis/tasks/08-14-chatgpt-analysis-overhaul/design.md`
- 执行清单：`.trellis/tasks/08-14-chatgpt-analysis-overhaul/implement.md`
- 上游分析：`~/文档/clawbay/20_Projects/opsv/chagpt 对opsv 项目的分析.md`

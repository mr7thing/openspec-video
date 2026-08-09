# Trellis 核心设计思想分析 —— spec 强约束如何落地

> 日期：2026-08-07
> 分析对象：`/home/uncle7/code/Trellis`（npm 包 `@mindfoldhq/trellis`，pnpm monorepo）
> 分析方法：使用 mattpocock-skills 的 `codebase-design` 词汇体系（module / interface / implementation / depth / seam / adapter / leverage / locality）
> 用途：为 openspec-video（OPSV）的 pack 契约与 agent 约束改进提供参照

---

## 1. Trellis 是什么

Trellis 是一个 **CLI 安装器/同步器 + 生成物运行时**。本体不在开发时运行：`trellis init` 把一整套 prompt、平台 hook、skill、Python 脚本写进用户仓库（`.trellis/`、`AGENTS.md` managed block、平台目录如 `.claude/`、`.kimi-code/`、`.agents/skills/`），之后完全由 AI 平台自己的 hook/skill 机制驱动。

- CLI：`packages/cli/src/cli/index.ts`（commander，`init/update/mem/workflow/platforms/channel`）
- 模板与分发：`packages/cli/src/templates/`（21 个平台模板 + `trellis/` 目录模板 + `shared-hooks/` 平台无关 Python hook + `common/skills`）
- 每平台一个 configurator：`collectXxxTemplates() → Map<路径, 内容>` 落盘（`packages/cli/src/configurators/`）
- 自举托管：Trellis 仓库根的 `.trellis/` 本身就是活样本

**关键认识：Trellis 的本质是一个"约束分发器"——它把对 agent 行为的约束编码成文件，植入目标仓库，借宿主 AI 平台的钩子机制执行。**

## 2. 核心设计思想总览

workflow.md 开篇两条原则（`packages/cli/src/templates/trellis/workflow.md:8-9`）：

1. **"Specs injected, not remembered"** —— spec 由 hook/skill 注入上下文，不靠模型记忆。
2. **"Conversations get compacted, files don't"** —— 交接靠文件（task.json、jsonl 清单），不靠对话历史。

以及 inject-subagent-context.py 文件头注释点破的实现哲学：**"behavior controlled by code not prompt"** —— 注入行为由代码保证，遵守行为才交给 prompt。

由此派生出完整的设计哲学：**纵深防御的多层注入 + 状态机驱动 + 可测试的不变量**。没有任何单一机制被信任去"管住"agent；每一层都假设上一层可能失效。

## 3. spec 强约束的七层机制（核心）

### 3.1 入口锚点：AGENTS.md managed block

`<!-- TRELLIS:START/END -->` 包裹的块注入到 AGENTS.md/CLAUDE.md，声明 "This project is managed by Trellis" 并指向 `.trellis/`。块内由 `trellis update` 整体替换、块外用户内容保留（`commands/update.ts` 的 `replaceManagedBlock`）。这是任何 agent 进入项目的第一接触点。openspec-video 根 AGENTS.md 就带这个块。

### 3.2 SessionStart hook：每会话状态注入

`templates/shared-hooks/session-start.py` 在会话开始/清空/压缩后注入：

- 当前任务状态 + artifact 存在性检查 + **Next-Action 指令**（如 "Do not enter implementation until the user confirms start"）
- workflow Phase Index 摘要 + 全部 spec index 路径清单（`_collect_spec_index_paths`）
- `TRELLIS_CONTEXT_ID` 写入环境文件，把会话身份桥接到后续 Bash 调用

压缩后重新注入这一点直接回应了"长会话上下文被压缩后 agent 忘记规矩"的真实失效模式。

### 3.3 UserPromptSubmit hook：每一轮的 breadcrumb（最强一层）

`templates/shared-hooks/inject-workflow-state.py` 在**每一轮用户输入**时输出 `<workflow-state>` 块。内容**只**从 workflow.md 的 `[workflow-state:STATUS]...[/workflow-state:STATUS]` tag 块解析（`_TAG_RE`），状态变量是 `task.json.status`。

两个刻意的设计：

- **无 fallback 文案**：找不到 tag 就显示 "Refer to workflow.md for current step."——让破坏**可见**，而非静默兜底。脚本注释明说这是 intentional。
- **有逃生舱**：prompt 含 `no-trellis` 或 `TRELLIS_HOOKS=0` 时跳过。作者承认这是脚手架而非沙箱。

### 3.4 PreToolUse hook：sub-agent prompt 改写（spec 全文物化）

`templates/shared-hooks/inject-subagent-context.py` 拦截 `Task|Agent` 工具调用，识别 trellis-implement/check/research 后：

- 读任务目录的 `implement.jsonl`/`check.jsonl`（每行 `{"file","reason"}`），**把引用的 spec/research 文件全文塞进 prompt**（带字节预算：单文件 32KB / 单 artifact 64KB / 总量 128KB，超限降级为索引行）
- 追加 `prd.md → design.md → implement.md` 任务链
- 包一层角色指令后以 `permissionDecision: allow + updatedInput` **改写这次工具调用的 prompt**

这是"规划（主会话）→ 执行（隔离上下文的子 agent）"的接缝（seam）：子 agent 看不到对话历史，所以契约必须物化成文件清单 + 全文注入。

### 3.5 任务生命周期门禁

- `task.py create` 播种 jsonl 的 `_example` 行；workflow 要求 `task.py start` 前两个 jsonl 必须各至少一条**人工/AI curate 的真实条目**（"Ready gate"），`session-start.py` 的 `_has_curated_jsonl_entry` 做机器侧判定
- `task.py start/archive` 翻转 `task.json.status` 并维护 per-session 指针——status 是驱动全部 breadcrumb 的单一状态变量
- 归档即账本：archive → journal → 三段式 commit

### 3.6 无 hook 平台的兜底：pull-based prelude

对无 PreToolUse 的平台（class-2，如 Kimi Code），把 "Required: Load Trellis Context First" prelude 直接插进 agent 定义文件开头，命令子 agent 自己执行 `task.py current` → 读 jsonl → 逐文件 Read spec（`configurators/shared.ts` 的 `buildPullBasedPrelude`）。agent 模板里还有 `<!-- trellis-hook-injected -->` marker 检测：hook 没触发时子 agent 自行加载。

**同一约束，push（hook 注入）与 pull（agent 自取）双通道**，按平台能力注册表（`types/ai-tools.ts` 的 `AI_TOOLS`，21 平台，字段含 `hasHooks/hasPythonHooks`）分发。

### 3.7 检查门禁与知识闭环

- `trellis-check`：git diff → 对照 spec 逐条 → **自己修** → 跑 lint/typecheck
- Phase 3.3 "spec update" 是 `[required · once]`——把本次教训写回 spec 是流程的强制步骤，形成 institutional memory
- **不变量进测试**：workflow.md 声明 "每个 `[required · once]` 步骤必须在对应 breadcrumb 块里有强制行"，由 `test/regression.test.ts` 守护——文档约束被 CI 锁死

## 4. workflow.md 即状态机：文档与运行时同构

workflow.md 不是纯文档，而是**可解析的运行时配置**（自述 "the scripts are parsers only"）：

- 步骤标注 `[required · once] / [optional · repeatable] / [on demand]`
- 平台分流：`[Claude Code, Cursor, ...]...[/...]` marker 块按平台过滤
- `get_context.py --mode phase --step X.Y` 按需取步骤详情——agent 不必吞下整个 workflow
- 改文档即改行为：tag block 随 `trellis update` 块级下发到所有下游项目

这是最精妙的一笔：**workflow 的"真相源"只有一份**，脚本只是解析器。文档漂移 = 行为漂移，二者不可能不一致。

## 5. spec 内容的合约化

`common/skills/update-spec.md` 定义了 spec 的写作元规范：触发条件（新 API 签名/跨层契约/schema 变更/infra 集成）命中时必须输出 **7 节模板**——Scope / Signatures / Contracts / Validation & Error Matrix / Good-Base-Bad Cases / Tests Required / Wrong vs Correct。

spec 的组织是 `.trellis/spec/<package>/<layer>/index.md`（包 × 层两级），index.md 不是规范本体而是**指针**（Pre-Development Checklist + Quality Check 两节指向同目录具体文件）。`trellis-before-dev` skill 末尾一句 "This step is **mandatory** before writing any code"。

## 6. 深模块视角的评价

**深模块典范：**

- `common/active_task.py`：会话身份解析的复杂逻辑（env 优先级、平台检测、stale 指针）藏在 `resolve_active_task()` 一个小 interface 后，被 4 个 hook + task.py 复用——一次修复，处处生效（locality）。
- `SHARED_HOOKS_BY_PLATFORM`（`templates/shared-hooks/index.ts`）：一张表驱动全部平台的 hook 分发，单一事实源。
- `TrellisTaskRecord`：TS（`core/src/task/schema.ts`）与 Python（`task_store.py`）双实现靠字段顺序常量维持同构，是有意维护的窄 seam。

**浅模块风险区：** 21 个平台 configurator 大多是薄映射层（interface ≈ 实现）；平台 marker 块让 workflow.md 正文重复度高；`update.ts` 2907 行偏臃肿。

**"删除测试"应用于 Trellis 整体：** 删掉 Trellis，约束不会消失于无形——spec 文件还在，但"注入"这一行为消失，约束从"每轮在场"退化为"指望模型想起来"。Trellis 赚的就是这个注入行为的钱（leverage）。

## 7. 诚实的局限性

Trellis 作者自己的定位是 **"高纪律的脚手架"而非沙箱**：

- 所有约束的最终执行者仍是模型本身——hook 保证"spec 在场"，不保证"spec 被遵守"
- 逃生舱（`no-trellis`、`TRELLIS_HOOKS=0`、degraded mode）随处可见
- 门禁（jsonl ready、commit 前 spec-sync）靠每轮可见的 breadcrumb 提醒 + check agent 复查兜底

也就是说：**Trellis 把提示工程能做到的最强形态做到了极致，并用"无 fallback、破坏可见、不变量进测试"三板斧防止脚手架自身腐化。它不追求形式化强制，追求的是在"agent 必然不完美"前提下把违规概率压到最低、把违规可见性提到最高。**

## 8. 对 OPSV 的可迁移点（摘要）

详细改进分析见 `docs/opsv-spec-enforcement-improvement-analysis-2026-08-07.md`（随 grilling 问答迭代）。核心可迁移思想：

| Trellis 机制 | OPSV 现状 | 差距 |
|---|---|---|
| 每轮 breadcrumb（UserPromptSubmit） | 无 hook dispatcher（readiness 已 Go，未实施） | 状态提醒缺失 |
| sub-agent prompt 物化注入（PreToolUse） | Work Packet 已结构化（contractVersion 2）但需 agent 主动跑 `work check` | 有控制面、无注入通道 |
| workflow.md 即状态机（单一天真相源） | pack 的 graph.yaml + profile materialize 两处各写一份依赖；无持久 pipeline 状态机 | 双写漂移风险 |
| spec 7 节合约模板 | pack 契约（pack.yaml/category/profile/skill.yaml）已声明式 + Zod 校验 | OPSV 这方面反而更强 |
| 不变量进测试 | pack fixture 契约测试 + HookReadiness 测试 | 已具备同等实践 |
| jsonl ready gate（开工前必须 curate 上下文） | 无对应物 | 任务上下文交接无门禁 |
| 破坏可见（无 fallback） | skill gates 只展示不执行（fail-open）；policy 只报告不强制 | 违规不可见 |

**初步结论：OPSV 在"契约的静态表达与校验"上已超过 Trellis（Zod schema、content digest、policy lattice、fixture 测试都是 Trellis 没有的硬手段）；真正缺的是 Trellis 最擅长的"运行时注入层"——让契约在 agent 每一轮工作时在场，以及"违规可见性"。两者是互补结构：Trellis 解决 in-context 在场，OPSV 解决 on-disk 校验。改进方向应是给 OPSV 的硬契约装上 Trellis 式的注入通道，而非照搬其 prompt 级约束。**

---

### 附：关键证据文件索引

| 论断 | 证据 |
|---|---|
| 两条核心原则 | `packages/cli/src/templates/trellis/workflow.md:8-9` |
| behavior controlled by code not prompt | `packages/cli/src/templates/shared-hooks/inject-subagent-context.py:11` |
| SessionStart 注入 | `templates/shared-hooks/session-start.py`（`_collect_spec_index_paths` L666-694、`_get_task_status` L424-514） |
| 每轮 breadcrumb | `templates/shared-hooks/inject-workflow-state.py`（`_TAG_RE` L191-219） |
| sub-agent 物化注入 | `inject-subagent-context.py`（`_materialize_jsonl_entries`、多平台输出 L1116-1143） |
| Ready gate 机器判定 | `session-start.py:129-150` `_has_curated_jsonl_entry`；`workflow.md:424` |
| pull-based 兜底 | `configurators/shared.ts:618-648` `buildPullBasedPrelude` |
| 平台能力注册表 | `packages/cli/src/types/ai-tools.ts`（`AI_TOOLS`） |
| 不变量进测试 | `workflow.md:113-119` + `test/regression.test.ts` |
| spec 7 节模板 | `templates/common/skills/update-spec.md:26-36` |
| before-dev mandatory | `templates/common/skills/before-dev.md:35` |

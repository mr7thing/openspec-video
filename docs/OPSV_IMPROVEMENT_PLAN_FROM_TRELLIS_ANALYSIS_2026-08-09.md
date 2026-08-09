# OPSV 改进计划 —— 从 Trellis 强约束分析落实为可执行方案

> 日期：2026-08-09
> 上游分析：`docs/TRELLIS_SPEC_ENFORCEMENT_AND_OPSV_PACK_DESIGN_ANALYSIS.md`（2026-08-09，本计划的审阅对象）
> 参照分析：`docs/trellis-spec-enforcement-design-analysis-2026-08-07.md`（机制层分析）
> 继承计划：`docs/OPSV_AND_MV_PACK_IMPROVEMENT_DEVELOPMENT_PLAN_2026-08-05.md`（Phase 0A/0B/1/2）
> 衔接契约：`docs/opsv-hook-dispatcher-readiness-go-no-go-2026-08-05.md`（冻结的 Hook Readiness 契约）
> 任务：`.trellis/tasks/08-09-trellis-analysis-to-plan/`
>
> 本文是**可执行改进计划**，不是架构结论的复述。审阅结论（§1）、差距清单（§2）说明"分析哪些成立、差距在哪"；§3 起给出分阶段任务，每个任务含现状、目标、验收、依赖。

---

## 1. 审阅结论

对 `TRELLIS_SPEC_ENFORCEMENT_AND_OPSV_PACK_DESIGN_ANALYSIS.md` 按"文档核心、流程可执行"两条主线审阅。

### 1.1 成立的论点（照单采纳）

1. **核心对象是 Asset Document**（§1.1）：分析正确地把 OPSV 定位为"以 Asset Document 为中心的文档生命周期 + 生产闭环"，而非 Agent Framework。改进计划以此为准绳，任何新增机制若试图成为文档的第二权威，都应被拒绝。
2. **硬约束 / 软约束必须分开**（§1.3）：文档格式、依赖、Workflow 顺序、输入输出 Contract、生命周期、produce 任务编译是硬约束；质量标准、工具选择、Agent 拓扑、模型绑定是软约束。这张表直接可用作验收时的分层标尺。
3. **四层约束模型**（§3）：认知层 / 上下文层 / 程序层 / 机器层。前两层解决"Agent 知道该怎样做"，后两层解决"系统不能随意继续"。这是整个计划的骨架。
4. **规范和平台必须分离**（§2.5、§4）：OPSV 定义执行边界，Framework Adapter 使用宿主框架原生机制，不发明新的 Subagent 协议。与 08-05 Go 契约的"平台 Adapter 各自协议独立"一致。
5. **Pack 是 Workflow Contract，不是工具清单**（§5）：Stage 定义输入/输出/完成条件，工具和能力是推荐实现。与当前 Pack 现状（pack.yaml + graph.yaml + profiles + skills）的方向一致，但粒度需补（见 1.2 第 3 条）。
6. **12 项非目标**（§13）：全部合理，本计划逐一保留并标注依据（§4）。

### 1.2 需要修正 / 弱化的点

1. **§12 的 Phase 1-4 粒度太粗，不能直接当任务划分。** 每 Phase 捆绑了多个独立可验收的关注点（如 Phase 1 同时含 Bootstrap 与 Context Injection）。本计划将其拆为可单独立项的 A/B/C/D 任务组，且与 08-05 计划已冻结的 Go 契约衔接（§1.3）。
2. **分析低估了 OPSV 现有控制面。** "NextAction"、"结构化 Work Packet"、"produce 输入检查"在分析里是待建物，但 08-05 计划已完成：`buildNextAction`（`cli/src/core/NextAction.ts`）已输出 `draft|materialize|circle|compile|sync|blocked`；`buildWorkPacket`（`cli/src/core/WorkPacket.ts`）已带 `contractVersion:2`、refs 状态、policy、issue codes、circle manifests。**真正缺的不是"计算下一步"，而是"把下一步注入当前 Agent 上下文"的通道。** 本计划把重心放在注入通道与执行记录上，不重造控制面。
3. **"Stage" 抽象在现有 Pack 里尚未存在。** 分析 §5.1 的 `stage:` 定义（inputs/outputs/completion/quality_guidance/recommended_capabilities）在 `graph.yaml`（目前只有依赖 DAG）和 `profiles/*.yaml`（目前只有 kind/capability/skill/outputs）中都不存在。Pack 需要一次 schema 演进，这是 Phase C/D 的真实工作量，分析只说了方向没说工作量。
4. **Bootstrap（§6）定义不完整。** 分析说 `opsv bootstrap → .opsv/bootstrap/` 生成 Workflow Graph / Document Contract / Role Context 模板，但未定义：输入（Pack Stack 如何锁定）、输出 schema、stale 判定（哪些变更使 bootstrap 过期）。本计划给出最小 schema 与 `bootstrap_stale` 判定（§3 阶段 C-A）。
5. **Execution Record（§8）有与现有机制重叠的风险。** Circle（`queue/<dir>/_manifest.json`）已是"生产执行计划"的载体，Task JSON 已记录任务，Review/Syncing 已记录确认路径。Execution Record 若重复承载这些，会造成多源。分析 §8.3 已声明"只记录执行事实并引用现有领域事实"，本计划把这个约束写成硬性验收（§3 阶段 B-A 验收 3）。
6. **未点名当前 `.claude/hooks/` 的归属。** 现状：`.claude/hooks/session-start.py`、`inject-subagent-context.py`、`inject-workflow-state.py` 是 **Trellis 自身 hook**（从 `/home/uncle7/code/Trellis` 分发而来），注入的是 Trellis 开发任务上下文，**对 OPSV Pack/Asset 零感知**。分析把"Hook 注入"当作待建物，但仓库里已有三只 hook 在跑。改进计划必须明确：Trellis hook 管**开发工作流**，OPSV hook 管**生产工作流**，二者并存（§1.3、§3 阶段 A）。

### 1.3 与既有计划 / 记录的关系（继承而非重启）

| 来源 | 状态 | 对本计划的约束 |
|---|---|---|
| 08-05 Go/No-Go 记录 | 已 Go（条件全清零） | 冻结契约 7 项：typed Pack validation、versioned WorkPacket、结构化 NextAction、稳定 issue codes、Pack content_digest、effective policy、路径规范化。Hook/AgentRouter **只能**消费这些，禁止解析 command string。 |
| 08-05 Go 后续任务输入 | 未实施 | `validate --inline`（proposed content）是首个垂直切片前提；hook cache key = project + source path + **proposed content hash** + **Pack content_digest** + validator contract version；单平台垂直切片先行（Claude Code）。 |
| 08-07 机制层分析 | 结论文档 | "OPSV 硬契约已超 Trellis，缺的是运行时注入层 + 违规可见性"——本计划的两个主攻方向与之一致。 |
| 08-05 计划 Phase 2（T11） | 已完成 readiness | 本计划的阶段 A 是其实现落地，非新需求。 |

**一条总纲**：

> Trellis 管理 OPSV 的**开发工作流**（task/prd/implement/check），且仅在**本项目开发时**在场；OPSV 自身要管的是**媒体生产工作流**（Asset Document → produce → Artifact → review/sync）。改进计划只为后者引入 Trellis 式的注入与状态机制，不干扰前者。
>
> **OPSV 必须能单独工作**：Trellis 是可选叠加层，不是 OPSV 的运行时依赖。OPSV 的注入通道、Bootstrap、Execution Record 全部只依赖 OPSV 自有产物（`.opsv/`、`videospec/`、Pack 文件），不读取 `.trellis/`、不调用 `task.py`、不要求 Trellis 已安装。在一个只装 OPSV、没有 Trellis 的项目里，媒体生产工作流必须完整可用。
>
> **包边界**：OPSV 是一个 **NPM 工具包**（包名 `videospec`，bin `opsv`），自带 CLI、默认配置与 hook 模板；**Packs 是配置层**（`.opsv/packs/<id>`，由 `opsv pack lock` 锁定），提供**可配置的工作流**（graph/stages/profiles）、**工具集**（skills/capabilities/推荐能力）与**规格约束**（categories/文档 Contract/gates）。Packs 不是代码依赖，是 CLI 加载的声明式配置。改进计划中所有新增机制（hook 模板、Bootstrap、Execution）都随 NPM 包分发，Packs 只增加声明，不承担运行时逻辑。

---

## 2. 差距清单：现状 ↔ 分析要求

以分析 §12 的四 Phase 为纵轴，逐项核对 `cli/src/core/`、`.claude/hooks/`、`opsv-packs` 现状。

| # | 分析要求 | 现状 | 差距 | 归属阶段 |
|---|---|---|---|---|
| G1 | 每轮状态注入（Agent 每轮知道下一步） | `opsv work check <asset> --json` 可计算 NextAction，但**无 hook 在每轮把它送入上下文**；`.claude/hooks/inject-workflow-state.py` 注入的是 Trellis 状态，非 OPSV 状态 | **无注入通道**（首要差距） | A |
| G2 | 子 Agent 获得当前动作最小上下文 | WorkPacket 结构化但需 Agent 主动跑 `opsv work check`；PreToolUse 现有 hook 注入的是 Trellis jsonl，非 OPSV Document Contract + Pack 指导 | 无 OPSV-aware 子 Agent 上下文物化 | A |
| G3 | 会话开始注入项目执行上下文 | Trellis SessionStart 注入开发任务状态；无 OPSV 的"当前 Pack Stack + 活跃 Asset 摘要" | 缺 OPSV SessionStart 注入 | A |
| G4 | 校验 proposed content（而非磁盘旧文件） | `opsv validate` 扫描磁盘文档；无 `--inline` | Go 后续 #1 未做 | A |
| G5 | 执行记录持久化、可恢复、可追溯 | 无 `.opsv/execution/`；无 events.jsonl；Circle/Task JSON 各自记录局部 | 缺项目级 Execution Record | B |
| G6 | Core 计算合法动作并持久化 NextAction 投影 | `buildNextAction` 已计算，但每次从磁盘现算，无投影、无历史 | 缺状态机持久层 | B |
| G7 | Bootstrap 生成项目级执行上下文 | 无 `opsv bootstrap`；无 `.opsv/bootstrap/`；无 stale 判定 | 全新机制 | C |
| G8 | Pack 声明 Stage 级 Workflow Contract | `graph.yaml` 只有依赖 DAG；`profiles/*.yaml` 只有 kind/capability/skill/outputs；无 inputs/outputs/completion/quality_guidance/role 适用性 | **schema 演进**（方向对，粒度缺） | C |
| G9 | 四个标准 Role 分角色上下文 | 命令面已隐含：`materialize`(author)、`validate`/`pack check`(checker)、`produce`/`run`/`circle`(dispatcher)、`review`(quality)；但无 Role 声明、无 Context Manifest 模板 | 缺角色层抽象 | C |
| G10 | Review/Syncing 保持唯一确认路径 | 已完整：`approve`/`review`/`sync` 闭环 | 无差距，保持不动 | — |
| G11 | Pack 迁移到统一执行接口 | 4 个 Pack（mv-3d-previs、mv-3d-ref、short-drama、opsv-multi-ref-pipeline）与 Stage Contract 不匹配 | 需 conformance 迁移 | D |
| G12 | 硬约束 fail-closed、违规可见 | `invalid` fail-closed 已成立；但违规只在 `work check` 输出，hook 不呈现 | 缺"每轮可见 + 无 fallback"呈现层 | A/D |
| G13 | **OPSV 独立可用（不依赖 Trellis）** | `.claude/hooks/` 三只脚本依赖 Trellis 安装分发；OPSV 无自安装通道；注入脚本若读 `.trellis/` 则在 Trellis-free 项目失效 | 需 OPSV 自安装 hook（A2，模板随 NPM 包分发）+ 注入/执行数据不读 `.trellis/` | A（全部阶段约束） |

**结论**：差距集中在 **G1-G4（注入通道）、G5-G6（执行记录）、G7-G9（Bootstrap 与 Role/Pack Stage 抽象）、G11（迁移）**。这正是分析 §12 的四 Phase，但任务划分须按本计划的 A/B/C/D 执行，且每个任务都锚定上述现状。

---

## 3. 分阶段改进计划

四个阶段（A→B→C→D）对应分析的 Phase 1→4，但按"先让既有契约在场、再持久化、再抽象、再迁移"的顺序执行。每阶段任务含**现状 / 目标 / 要做 / 验收 / 依赖**。验收全部可用命令或测试断言，不可验收项一律不留。

### 阶段 A：注入通道（分析 Phase 1 的落地）— 单平台垂直切片（Claude Code）

> 原则 1（并存）：Trellis hook 与 OPSV hook 并存，互不侵入。`.claude/settings.json` 的 hook 数组可挂多只 hook，新增 `opsv-` 前缀的 hook，不修改现有 Trellis hook 文件。
> 原则 2（standalone）：OPSV hook 由 OPSV 自己安装/卸载（A2），**不依赖 Trellis 是否在场**。OPSV hook 脚本只读 OPSV 产物（`.opsv/`、`videospec/`、Pack），不 import 或读取 `.trellis/`。在无 `.trellis/` 的项目中，A3-A6 必须完整工作。

#### A1 — `opsv work context <asset> --json`：Context Manifest 物化命令

- **现状**：`work check` 已输出 WorkPacket（含 nextAction、refs、policy、issues、circle），但缺少"角色视角"的最小上下文：文档格式要求、Prompt 语法、Pack 工作流指导、完成条件、推荐能力。
- **目标**：一条命令产出当前 `(asset, stage, role)` 的 Context Manifest，供 hook 注入与子 Agent pull 共用，单一事实源。
- **要做**：
  1. 在 `cli/src/commands/work.ts` 新增 `work context <asset> --role <role>`（`--json`）。
  2. 基于 `buildWorkPacket` 结果 + `resolveDocumentContract`，附加：Document Contract（`categories/*.yaml`）、当前 role 的 Context 模板（阶段 C 定义，本阶段先用最小集：doc 格式 / 依赖语法 / 完成条件 / Pack 指导路径）。
  3. 输出含 `manifest` 结构：`{contractVersion, asset, nextAction, documentContract, promptContract, refs, policy, issues, role, guidanceRefs}`。
- **验收**：
  - [ ] `opsv work context <mv-asset> --role contract-checker --json` 在 `opsv-multi-ref-pipeline` fixture 上输出含 `nextAction` 与 `documentContract` 的 JSON，exit 0。
  - [ ] `--role` 非法值 exit 非 0，报 `ROLE_UNKNOWN`（沿用 issue code 体系）。
  - [ ] 新增 `cli/src/core/__tests__/WorkContext.test.ts`：对已知 fixture 断言 manifest 字段与 `buildWorkPacket` 一致。
- **依赖**：无；但 Role 集合先固定为分析 §7 的四元组（author/checker/dispatcher/quality），阶段 C 再允许 Pack 声明。

#### A2 — `opsv hook install|uninstall`：OPSV hook 自安装机制（standalone 前提，模板随 NPM 包分发）

- **现状**：`.claude/hooks/` 现有三只脚本是 Trellis 安装的；OPSV 无自安装通道。已有两个可复用先例：(a) `scripts/postinstall.js` 把包内 `.opsv/` 默认配置复制到 `~/.opsv/`（不覆盖用户文件）；(b) `opsv pack sync-skills` 在 `.agents/skills` / `.codex/skills` 装 shim（符号链接 + collision 检测），但只覆盖 skill，不覆盖 hook 与 settings.json 合并。
- **目标**：`opsv hook install --platform claude` / `opsv hook uninstall`，把**随 NPM 包分发**的 hook 模板与 settings.json 注册项装进目标项目，**不依赖 `.trellis/` 是否存在**。
- **要做**：
  1. 新增 `cli/templates/hooks/` 存放 OPSV hook 脚本模板（`opsv-inject-workflow-state.py`、`opsv-inject-session-start.py`、`opsv-inject-subagent-context.py`，A3-A5 落地）；`cli/package.json` 的 `files` 字段纳入该目录（当前 `files` 已含 `.opsv`/`scripts`，沿用同一打包路径）。
  2. `opsv hook install` 从已安装包内读取模板（`require.resolve` 定位包根，而非依赖当前仓库 checkout），copy 到 `.claude/hooks/`；`--platform claude` 先行，结构与 `pack sync-skills` 的 `agents|codex` 一致。
  3. settings.json 合并：结构化、幂等、可卸载、可回滚（Go 契约已有此要求）；只管理 OPSV 注册块，冲突时提示而非覆盖非 OPSV 块。
  4. 卸载 = 删脚本 + 回滚 settings.json 中 OPSV 注册块，保留 Trellis 块。
- **验收**：
  - [ ] 从 npm **已安装包**（非仓库 checkout）执行 `opsv hook install --platform claude`，在**无 `.trellis/`** 的临时项目上 `.claude/hooks/opsv-*.py` 与 settings.json 注册项就位；脚本不 import `.trellis/` 且可独立运行。
  - [ ] 重复 install 幂等（不改写 Trellis hook 块）；uninstall 后 settings.json 恢复（Trellis 块原样保留）。
  - [ ] uninstall 无 OPSV 管理块时报错 exit 非 0 且提示明确。
- **依赖**：无（与 A1 并行；A3-A5 的脚本经由此机制分发）。

#### A3 — `opsv-inject-workflow-state.py`：每轮 NextAction 面包屑（UserPromptSubmit）

- **现状**：`.claude/hooks/inject-workflow-state.py` 只注入 Trellis 状态。OPSV 状态（当前资产 → 下一步）完全缺席。
- **目标**：每轮用户输入时，把当前活跃 Asset 的 `NextAction` 以面包屑形式在场，且**无合法动作时输出 blocked + issue codes 并让违规可见**（借鉴 Trellis "无 fallback 破坏可见"）。
- **要做**：
  1. 新脚本 `.claude/hooks/opsv-inject-workflow-state.py`，仅读项目配置定位 `videospec/`，解析当前活跃资产（约定：`.opsv/runtime/active-asset`，见 A4 写入；无则扫 `work next` 第一个 production 资产）。脚本不 import 或读取 `.trellis/`。
  2. 调用 `opsv work context <asset> --role dispatcher --json`（或直接调 TS 层，二选一，本计划定为调 CLI 以保证行为一致）。
  3. 输出 `<opsv-workflow-state>` 块：`asset`、`status`、`nextAction.kind`、`command`（派生展示）、`issueCodes`。**无 fallback 文案**：找不到资产或 nextAction 为 blocked 时，输出 blocked + codes，不静默。
  4. hook 注册经 A2 安装机制写入 `.claude/settings.json`（幂等；Trellis 在场时与 Trellis hook 并列）。
- **验收**：
  - [ ] fixture 资产在 `drafting` 时，hook 输出块含 `nextAction.kind=draft`；在 ref 缺失时含 `REF_*` issue codes 且 exit 非 0。
  - [ ] 无活跃资产时输出明确的"Refer to `opsv work next`"行，不静默通过。
  - [ ] `HookReadiness.test.ts` 追加 1 条：hook 输出块的 `nextAction.kind` 与 `buildNextAction` 结果一致（不变量进测试）。
  - [ ] 在**无 `.trellis/`** 的 fixture 项目上，面包屑输出与 Trellis 在场时一致（standalone）。
- **依赖**：A1、A2。

#### A4 — `opsv-inject-session-start.py`：会话开始注入 Pack Stack 与活跃资产摘要

- **现状**：Trellis SessionStart 注入开发任务状态；OPSV 无会话级生产上下文。
- **目标**：会话开始/清空/压缩后，注入当前 Pack Stack（`opsv pack list` / 项目锁定 Pack）、活跃资产列表（`work next` 摘要）、与 `.opsv/bootstrap/` 存在性检查（阶段 C 前留空）。脚本不读取 `.trellis/`。
- **要做**：新脚本 `.claude/hooks/opsv-inject-session-start.py`，输出 `<opsv-session-context>` 块（Pack Stack / active assets / bootstrap 状态），并写入 `.opsv/runtime/active-asset` 供 A3 使用。
- **验收**：
  - [ ] 会话开始后上下文含 Pack id；`opsv work next` 有 production 资产时块内列出；bootstrap 缺失时提示（不阻断）。
  - [ ] 无 `.trellis/` 的 fixture 项目上会话上下文与 Trellis 在场时一致（standalone）。
- **依赖**：A1、A2；`.opsv/runtime/` 目录约定（分析 §11.3，`runtime` 可丢失，恢复靠事件与 Git）。

#### A5 — `opsv-inject-subagent-context.py`：子 Agent 上下文物化注入（PreToolUse）

- **现状**：PreToolUse 现有 hook 拦截 Task/Agent 注入 Trellis jsonl 全文；OPSV 的 Document Contract、Pack 指导、Approved References 不会随子 Agent 进入上下文。
- **目标**：拦截 `Task|Agent` 调用，当目标是 OPSV 生产动作时，把 `work context` 的 Context Manifest（含 Document Contract、Approved Refs 清单、Pack 指导）注入 prompt，带字节预算（借鉴 Trellis 单文件 32KB / 总量 128KB，超限降级为引用路径）。脚本不读取 `.trellis/`。
- **要做**：
  1. 新脚本 `.claude/hooks/opsv-inject-subagent-context.py`，识别 prompt 中的 OPSV 动作（`opsv produce/compile/materialize/approve/sync` 或明确 asset 引用）。
  2. 物化：`opsv work context <asset> --json` → 追加 `Document Contract` + `Approved References`（只列文件名+状态，大媒体用引用） + `Pack guidance`（阶段 C 前为 SKILL.md 引用路径）。
  3. `permissionDecision: allow + updatedInput` 改写调用（与 Trellis 同 seam）。
- **验收**：
  - [ ] 子 Agent prompt 含 `opsv produce` 时，注入块含 `documentContract` 与 refs 清单；超预算文件降级为路径行。
  - [ ] 无关调用（无 OPSV 动作）原样放行，零输出。
  - [ ] 与 Trellis 注入共存（两者都改写时拼接，不互相覆盖）；无 Trellis 时单独工作。
- **依赖**：A1、A2。

#### A6 — `validate --inline` 共享 Validation Core（proposed content）

- **现状**：Go 后续 #1。`opsv validate` 校验磁盘文档；hook 需要校验"Agent 即将写入的内容"。
- **目标**：提供共享校验内核，输入 proposed content（字符串/临时文件），输出与磁盘校验一致的 issue codes；hook cache key 的 `proposed content hash` 依赖此能力。
- **要做**：`validate.ts` 增加 `--inline` 模式（或新 `core/Validator` 纯函数，CLI 与 hook 共用），支持对一段 proposed frontmatter+body 跑 Document Contract / Ref 语法 / category 规则。
- **验收**：
  - [ ] `opsv validate --inline` 对一段含 `REF_MISSING` 的 proposed 内容输出与磁盘同码；对合法内容 exit 0。
  - [ ] 纯函数与 `validate.ts` 磁盘路径共享同一实现（无复制逻辑）。
  - [ ] hook cache key 纳入 proposed content hash + Pack content_digest（Go 契约 #5）。
  - [ ] 纯校验内核不读 `.trellis/`，Trellis-free 项目可独立使用。
- **依赖**：无（可与 A1-A5 并行）。

### 阶段 B：Workflow 驱动的 Execution Record（分析 Phase 2）

> 借鉴 Trellis 事件存储（typed mutation → append-only events.jsonl → reducer → state projection → NextAction），但只保留 OPSV 自己的事件类型，不复制 Channel/消息/Worker 领域。

#### B1 — `.opsv/execution/` 最小事件存储与状态投影

- **现状**：无 `.opsv/execution/`；`buildNextAction` 每次从磁盘现算。
- **目标**：项目级执行记录：`plan.json` + `events.jsonl` + `state.json`（reducer 投影）。事件类型最小集（分析 §8.3）：`execution / plan / stage / step / role / context / produce_run / artifact / gate / review / syncing / next_action / plan_revision`。
- **要做**：`cli/src/core/execution/` 新增 `EventStore`（append-only，锁 + seq + idempotencyKey）、`reducer.ts`（纯函数投影 state）、`ExecutionRecord` schema（Zod）。事件**引用** asset/task/artifact 的 id，**不得复制文档内容**（写进验收）。
- **验收**：
  - [ ] `events.jsonl` 追加写入、乱序重放后 `state.json` 一致（reducer 纯函数测试）。
  - [ ] 事件不含文档正文，只含引用（`asset`/`refs`/`artifact` id）。
  - [ ] `.gitignore` 增加 `.opsv/runtime/`，保留 `.opsv/execution/`（可 Git 追踪）。
- **依赖**：无。

#### B2 — `opsv exec` 命令面（create/status/next/resume）

- **现状**：无命令面；恢复依赖人工读事件文件。
- **目标**：最小命令面：`opsv exec create --plan <plan.json>`、`exec status`（投影当前状态）、`exec next`（复用 `buildNextAction` 从投影输出合法动作集）、`exec resume`（中断恢复）。
- **要做**：`cli/src/commands/exec.ts`；`exec next` 直接复用 `buildNextAction`（不新写判定逻辑）；`exec status` 输出 ReadyActionSet（多个互不依赖的合法动作，分析 §8.4）。
- **验收**：
  - [ ] 先 `create` → `start` → 若干事件 → `status`/`next` 输出与手推 reducer 结果一致。
  - [ ] 中断（事件缺失）后 `resume` 重建 state 并给出可继续动作或 `blocked`（需人工确认）。
  - [ ] 失败重试产生新 Attempt，不覆盖历史（事件含 `attempt` 字段）。
- **依赖**：B1。

#### B3 — Plan 生命周期与 Plan Revision

- **现状**：短程 `iterate + review + syncing` 已存在且**保持不动**；长程 plan 无载体。
- **目标**：`createExecution → planning → validate → start → running → completed/blocked`；`plan-v1 → plan-v2` 追溯修订（影响分析 + 重开受影响阶段），**不绕过 Asset Document 生命周期**（具体变化仍走文档工作流或 iterate+syncing）。
- **要做**：`plan.json` schema（stages/steps/roles/attempts/refs）；Plan Revision 命令；写 spec（分析 §8.2 两机制分置）。
- **验收**：
  - [ ] plan-v2 变更记录含影响范围与重开阶段清单；短程 iterate 不产生 plan_revision 事件。
  - [ ] `plan_revision` 事件明确引用被修订的 plan 版本号，不静默改写 plan-v1。
- **依赖**：B2。

#### B4 — 面包屑升级：从 Execution Record 投影 NextAction

- **现状**：A3 每轮从磁盘 `work check` 现算。
- **目标**：当存在活跃 Execution 时，A3 的 `<opsv-workflow-state>` 改为从 `opsv exec status/next` 投影（状态机驱动），无 Execution 时回落到 `work context`（磁盘推导）。**回落不是静默**：输出注明来源（`source: execution` vs `source: disk`）。
- **验收**：有活跃 execution 时面包屑与 `exec next` 一致；无 execution 时明确标注来源。
- **依赖**：B2 + A3。

### 阶段 C：Bootstrap、四标准 Role 与 Pack Stage Contract（分析 Phase 1 补全 + Phase 3）

#### C1 — `opsv bootstrap` → `.opsv/bootstrap/`

- **现状**：无 bootstrap；hook 的 Context Manifest 模板未物化。既有 `.opsv/` 约定：`.opsv/project.yaml`（ProjectConfig）、`.opsv/pack-lock.yaml`（`opsv pack lock`，含 Pack content digest）、`.opsv/packs/<id>/`（resolved Pack 源）、`.opsv/.env`。Bootstrap 必须**沿用**此布局，不另起 `.opsv/` 下的平行命名空间。
- **目标**：`opsv bootstrap` 由 Pack Stack + Project Config 生成 `.opsv/bootstrap/`：Pack 锁定信息、Workflow Graph（由 `graph.yaml` + profiles 推导）、Document/Prompt Contract、Input/Output 定义、Gate/Policy、推荐能力、Role Context 模板。
- **要做**：
  1. 新增 `opsv bootstrap` 命令（分析 §6.1 的职责边界：不做 produce、不做 Provider 解析、不做机器绑定）。读取 `.opsv/project.yaml` + `.opsv/pack-lock.yaml`，写入 `.opsv/bootstrap/manifest.json`。
  2. `.opsv/bootstrap/manifest.json` schema（Zod），含 `contentDigest`（复用 `PackDigest.ts` 的 Pack digest + Project Config 哈希）。
  3. stale 判定（分析 §6.2）：`pack.yaml`/`graph.yaml`/`profiles/`/`categories/` 或 Project Config 任一 digest 变化 → `bootstrap_stale`；Execution/hook 启动前检查。
- **验收**：
  - [ ] `opsv bootstrap` 在 `opsv-multi-ref-pipeline` 项目上生成 `.opsv/bootstrap/manifest.json`，含 Workflow Graph 节点与各 Role Context 模板引用。
  - [ ] 修改 `graph.yaml` 后重跑校验命令报 `bootstrap_stale`，`opsv exec start` 拒绝（fail-closed）。
  - [ ] 不改动 `opsv produce` 与 Provider 路径。
- **依赖**：A1（work context 复用）；与 B 并行。

#### C2 — Pack Stage Contract 扩展（schema 演进）

- **现状**：`graph.yaml` 仅依赖 DAG；profiles 仅 kind/capability/skill/outputs。
- **Pack 三层职责（对齐"Packs = 可配置工作流/工具集/规格约束"）**：本次 schema 演进把 Pack 的职责显式分成三层——**工作流**（graph/stages/profiles：Stage 输入输出与完成条件）、**工具集**（`skills`/`recommended_capabilities`/推荐 Provider：软推荐，经 `opsv pack sync-skills` 装 shim，不形成白名单）、**规格约束**（`categories`/文档 Contract/gates：硬校验）。三者都在 `.opsv/packs/<id>/` 声明，CLI 不内嵌任何 Pack 领域逻辑。
- **目标**：将 graph 节点演进为 Stage 级定义，补充分析 §5.1 的字段，并新增四 Role 的适用性声明：
  ```yaml
  # graph.yaml 演进（向后兼容：缺失字段视为继承 profile 的宽松行为）
  workflow:
    script:
      inputs: [script_doc]
      outputs:
        contract: storyboard-ref-v1
      completion: [output_exists, output_contract_valid, document_status_approved]
      quality_guidance: references/storyboard-quality.md
      roles:
        document-author: required
        contract-checker: required
        production-dispatcher: optional
        asset-quality-reviewer: optional
      recommended_capabilities: [storyboard_renderer]
  ```
- **要做**：
  1. `PackSchemas.ts` 扩展 `graph.yaml`/`stage` schema（Zod，`pack check` 校验）；缺失字段宽松（默认继承），新字段可选（避免破坏现有 4 Pack）。
  2. `opsv pack check <pack> --json` 对 stage schema 报错/警告。
  3. `resolveDocumentContract` 消费 stage 的 inputs/completion，纳入 `work context`。
- **验收**：
  - [ ] 现有 4 个 Pack 在扩展 schema 下 `pack check` 0 error（向后兼容）。
  - [ ] 一个带完整 stage 字段的 fixture Pack 通过校验，`work context` 输出包含 stage 的 completion 与 roles。
  - [ ] stage 字段错误（如 roles 非法值）报稳定 `PACK_STAGE_INVALID` code。
- **依赖**：A1。

#### C3 — 四标准 Role 的 Context Manifest 模板

- **现状**：命令面隐含角色，无角色上下文模板。
- **目标**：分析 §10.2 的四模板落地：
  | Role | 模板内容 |
  |---|---|
  | document-author | 文档模板、章节要求、Prompt 语法、示例 |
  | contract-checker | 验证 Schema、依赖规则、输入输出 Contract |
  | production-dispatcher | 生产输入/输出、produce/run 规则、推荐 Provider/API |
  | asset-quality-reviewer | Pack 默认质量检查说明、Review 目标 |
- **要做**：Bootstrap 物化四模板到 `.opsv/bootstrap/roles/<role>.md`（引用 Pack 内文件，不复制内容）；`work context --role` 消费；Pack 通过 stage `roles` 字段声明 required/optional/not_applicable。
- **验收**：四模板生成后，`work context <asset> --role <role>` 输出对应模板内容；Pack 声明 not_applicable 的 role 在 `work context` 报 `ROLE_NOT_APPLICABLE`。
- **依赖**：C1、C2。

#### C4 — Adapter 原生交接四角色

- **现状**：无 Subagent 角色分发。
- **目标**：Claude Code 上，A5 hook 根据 manifest 的 role 目标，用宿主框架原生 `Task`/`Agent` 机制创建对应角色子 Agent；Pack 定义领域上下文，不定义 Core 角色拓扑。
- **要做**：A5 输出块携带 `role` 与 `nextAction`，由宿主框架的 agent 定义（`.agents/*.md`）按 role 组装 prompt。
- **验收**：针对 `opsv produce` 动作，子 Agent 以其 role 的模板获得上下文；文档校验动作由 contract-checker 角色执行，不产生写操作。
- **依赖**：C3。

### 阶段 D：Pack 迁移与 Conformance（分析 Phase 4）

#### D1 — 四 Pack 迁移到 Stage Contract + Role 声明

- **现状**：mv-3d-previs、mv-3d-ref、short-drama、opsv-multi-ref-pipeline 四 Pack 的 graph/profiles 未声明 stage 字段与 roles。
- **目标**：四 Pack 通过扩展 schema 的 `pack check`，且每 Stage 声明 inputs/outputs/completion/roles。
- **要做**：逐个 Pack 补 stage 字段；`opsv-packs` 仓提交，主仓 fixture 同步。
- **验收**：每个 Pack `opsv pack check --json` 0 error；`test/pack-contract.test.js` 对四 Pack 全绿。
- **依赖**：C2。

#### D2 — Conformance 检查脚本

- **现状**：无统一 conformance 入口。
- **目标**：一条命令对任意项目检查分析 §12 Phase 4 的六问：每 Stage 输入能否从文档获得 / 输出有无 Contract / 当前 Role 是否获完整 Context / 用户能否 Review 后 iterate+sync / 推荐工具是否误当白名单 / 硬软约束是否分层。
- **要做**：`opsv conformance <pack>` 命令，输出检查矩阵与 fail 项。
- **验收**：对 opsv-multi-ref-pipeline 输出六问矩阵；不满足项可定位到 Pack 文件与行。
- **依赖**：C1、C2。

#### D3 — 双仓版本配对、spec 更新、回归测试

- **现状**：08-05 计划 §13 已定双仓配对流程。
- **目标**：Core（cli/src）+ Pack（opsv-packs）版本配对发布；`.trellis/spec/` 更新；`HookReadiness.test.ts` 扩展到新 hook（A3/A4/A5）与 execution（B2）。
- **要做**：按 08-05 §13 流程执行；spec 更新清单见 §5。
- **验收**：Core build/lint/test 全绿；hook 相关 7+ 项 readiness 测试全过；`opsv bootstrap`+`exec`+`work context` 在 fixture 项目端到端可用。
- **依赖**：A-D 各任务。

---

## 4. 非目标（保留分析 §13 的 12 项并标注依据）

| # | 非目标 | 依据 / 与既有计划的关系 |
|---|---|---|
| 1 | 不把 OPSV 做成 Agent Framework | 第一性原理 §1.1；08-05 计划 §4.2 非目标一致 |
| 2 | 不实现统一 Subagent 调度协议 | §2.5；Go 契约"平台 Adapter 各自协议独立" |
| 3 | 不复制 Trellis Channel/聊天/Worker 管理 | §2.6；本计划阶段 B 只做最小事件存储 |
| 4 | 不重设计 `opsv produce` 与 Provider Task Queue | 08-05 Phase 0 已稳定；分析 §5.3 |
| 5 | 不把 ComfyUI 从 Model API 改造成 Agent Tool | §5.3；它继续走 produce/run 链路 |
| 6 | 不建立工具强制白名单 | §5.4；工具选择是软约束 |
| 7 | 不要求外部生产伪装成 OPSV Task | §9；外部 Artifact 走同一 Review 路径 |
| 8 | 不建立独立主观质量量化系统 | §10.4；质量标准保持轻量 |
| 9 | 不以 Agent 自然语言回复作为完成证明 | §7.3；Receipt 结构化 |
| 10 | 不让 Plan Revision 替代短程 iterate+syncing | §8.2；本计划 B3 显式分置 |
| 11 | 不让平台 Hook 复制 Pack 业务规则 | §2.5；hook 只注入，不解释业务状态 |
| 12 | 不把整份 Pack 无差别塞进每个 Agent 上下文 | §10.2；A5 用字节预算 + 最小上下文 |

另加三条本计划特有的非目标：

- **13.** 不改动 `.claude/hooks/` 现有 Trellis hook 文件（新增 `opsv-` 前缀 hook，二者并存）。
- **14.** 不为 OPSV 生产工作流新建 `.trellis/` 状态；开发工作流归 Trellis，生产工作流归 `.opsv/`。
- **15.** 不把 Trellis 作为 OPSV 的运行时依赖：OPSV 的注入通道（A2 自安装）、Bootstrap、Execution Record 全部只依赖 OPSV 自有产物（`.opsv/`、`videospec/`、Pack），Trellis 仅为本项目开发时的可选层，OPSV 必须能单独工作。

---

## 5. Spec 更新清单（随各阶段落地）

| 阶段 | 更新文件 |
|---|---|
| A | `.trellis/spec/cli/engine/index.md`（`work context` 命令面）、`.trellis/spec/cli/engine/document-pipeline.md`（Context Manifest）、`architecture.md`（四标准 Role、注入通道） |
| B | `architecture.md`（Execution Record 事件类型与投影）、`.trellis/spec/cli/engine/config-system.md`（`.opsv/execution`/`runtime` 目录约定） |
| C | `.trellis/spec/packs/authoring/pack-format.md`（Stage Contract 扩展）、`architecture.md`（Bootstrap 与 Role 模板） |
| D | `.trellis/spec/packs/authoring/index.md`（conformance 六问）、`pack-format.md`（迁移指南） |

---

## 6. Definition of Done（整份计划的完成定义）

- [ ] A1-A6 落地：Claude Code 上 OPSV 状态每轮在场（A3）、子 Agent 获得最小上下文（A5）、`validate --inline` 可用（A6）、hook 可自安装（A2）。
- [ ] B1-B4 落地：`.opsv/execution/` 事件存储 + `opsv exec` 命令面 + Plan Revision，与短程 iterate 分置。
- [ ] C1-C4 落地：`opsv bootstrap` + 四 Role 模板 + Pack Stage Contract schema + 原生角色交接。
- [ ] D1-D3 落地：四 Pack 通过扩展 schema + conformance 检查 + 双仓配对发布。
- [ ] HookReadiness.test.ts 覆盖 A3/A4/A5 与 B2；`pack check` 对四 Pack 0 error。
- [ ] **Standalone 验收**：在无 `.trellis/` 的 fixture 项目上，A2 安装 → A3/A4/A5 注入 → `opsv bootstrap` → `opsv exec` 端到端可用，媒体生产工作流完整。
- [ ] 无一项非目标（§4）被违反。

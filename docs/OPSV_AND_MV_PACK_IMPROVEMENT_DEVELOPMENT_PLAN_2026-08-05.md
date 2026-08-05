# OPSV Core 与 MV Pack 改进开发计划（Trellis 规范版）

> 日期：2026-08-05
> 状态：Proposed / 等待按 Trellis 创建任务并执行
> 主仓库：`/home/uncle7/code/opsv/openspec-video`
> Pack 仓库：`/home/uncle7/code/opsv/opsv-packs/opsv-mv-pipeline`
> 前置结论：在 Core Contract 与 MV Pack Phase 0 验收完成前，Agent Hook / Dispatcher 保持 **Conditional No-Go**。

---

## 1. 目的

本计划把 2026-08-05 的 OPSV Core 与 MV Pack 联合代码评审结论，转换为一组可按 Trellis 执行、验证、回滚和归档的开发任务。

计划同时覆盖：

1. **OPSV Core/CLI**：Pack schema、跨文件契约、Work Packet、结构化下一步动作、policy 合并、Pack content digest、路径安全、Skill shim 和质量门禁。
2. **OPSV MV Pack**：Skill/Profile identity、Capability/Profile 设计、Category allow-list、模型解耦、half-life 五点 fixture、Pack 发布门禁和 legacy discovery 清理。
3. **Hook/Dispatcher 前置条件**：只定义 readiness 和后续接入边界；不在基础契约尚未可信时直接实现平台 Hook。

本计划不是对既有评审文档的重复，而是它的可执行实施分解。

---

## 2. 输入与规范优先级

### 2.1 评审与架构输入

1. `docs/opsv-agent-hook-architecture-code-and-mv-pack-review-2026-08-05.md`
2. `docs/opsv-agent-hook-architecture-plan-review-2026-08-04.md`
3. `/home/uncle7/.hermes/plans/2026-08-04_153000-opsv-agent-hook-architecture.md`
4. `docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md`
5. `UBIQUITOUS_LANGUAGE_2026-07-18.md`

### 2.2 Trellis 执行规范

实施前必须将相关规范注入对应任务的 `implement.jsonl` 与 `check.jsonl`，不能依靠会话记忆：

- `.trellis/workflow.md`
- `.trellis/spec/architecture.md`
- `.trellis/spec/cli/engine/index.md`
- `.trellis/spec/cli/engine/directory-structure.md`
- `.trellis/spec/cli/engine/document-pipeline.md`
- `.trellis/spec/cli/engine/config-system.md`
- `.trellis/spec/cli/engine/error-handling.md`
- `.trellis/spec/cli/engine/quality-guidelines.md`
- `.trellis/spec/cli/engine/testing.md`
- `.trellis/spec/packs/authoring/index.md`
- `.trellis/spec/packs/authoring/pack-format.md`
- `.trellis/spec/packs/authoring/asset-documents.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`

若 Trellis spec、架构蓝图与现有代码发生冲突：

1. 先记录冲突；
2. 不在实现中悄悄选择一种语义；
3. 由对应任务的 `design.md` 给出决策；
4. 实现和验证通过后，再用 `trellis-update-spec` 或等价流程更新 spec。

---

## 3. Trellis 计划原则

### 3.1 先计划，后编码

这是跨两个仓库、多个层次和多个运行时契约的复杂改造。父任务与复杂子任务均应至少包含：

- `task.json`
- `prd.md`：目标、范围、非目标、验收标准；
- `design.md`：类型、数据流、兼容策略、错误语义、迁移决策；
- `implement.md`：红测、最小实现、验证顺序、提交切片；
- `implement.jsonl`：实现阶段所需规范和研究材料；
- `check.jsonl`：检查阶段所需规范、测试和验收材料。

不得用一个“大任务”同时修改所有 Core 和 Pack 文件。

### 3.2 父子任务和显式依赖

本计划采用一个父任务和十一个子任务。父任务只管理范围、依赖、跨仓验收和最终归档，不直接承载大范围代码修改。

子任务应满足：

- 单一明确结果；
- 可独立红测和验收；
- 可形成小型 conventional commit；
- 失败时可回滚到前一个稳定契约；
- 不把 Hook、Router 与 Pack 基础修复混在同一个提交中。

### 3.3 测试先行与可执行验收

每个缺陷先写可复现的失败测试，再做最小修复。以下类型的测试不能只做 snapshot 或静态 grep：

- Work Packet 返回命令必须实际从项目根运行；
- policy 必须验证不能放宽；
- digest 必须通过修改有效 Pack 文件证明发生变化；
- broken symlink 必须用真实临时目录和真实符号链接测试；
- path containment 必须覆盖 `../` 和 symlink escape；
- MV fixture 必须真实调用 Core CLI 完成五点契约，而不是仅检查 Markdown 表格。

### 3.4 跨层数据只有一个契约拥有者

本项目的关键数据流是：

```text
Pack files
  → schema decode
  → cross-file contract graph
  → resolved Pack Stack
  → Project bindings/policy
  → Work Packet / NextAction
  → CLI command renderer
  → future Hook Adapter / AgentRouter
```

类型、解析、规范化和错误码必须由 Core 的共享模块拥有。命令层、Hook Adapter 和 Pack 本地脚本不得分别实现私有版本。

---

## 4. 范围与非目标

### 4.1 本计划范围

#### OPSV Core

- Pack YAML/Skill manifest 的 Zod schema；
- `opsv pack check [path] --json`；
- Pack 跨文件引用和导出契约检查；
- 结构化 `NextAction`；
- Work Packet action 与可执行命令修复；
- policy tightening lattice；
- canonical Pack content digest；
- Pack export realpath containment；
- broken Skill shim 自愈；
- Core 单元、集成、架构流测试；
- lint 与 Jest 生命周期基线修复。

#### MV Pack

- canonical Skill/Profile identity；
- shotlist Profile 去重；
- 四个 WIP Profile 的正式设计或明确撤回；
- Capability 粒度调整；
- Skill 中删除 concrete model/provider；
- Category allow-list 与 Pack export 对齐；
- half-life 自包含 E2E fixture；
- Pack contract runner；
- `mv-check.js` 定位为补充语义检查；
- README/legacy discovery surface 清理。

#### Hook/Dispatcher readiness

- 定义它们依赖的稳定 Core 接口；
- 增加 readiness 集成测试；
- 明确 Go/No-Go 门禁；
- 为后续 Hook 任务提供 Trellis 输入。

### 4.2 非目标

本轮不包含：

- 直接实现 Claude Code、Codex、Kimi、OpenClaw Hook Adapter；
- 直接实现 Hermes Dispatcher/AgentRouter 的完整路由；
- 新增具体 AI provider 或 model；
- 重写现有 Director 脚本业务逻辑；
- 自动迁移生产项目中的所有 `.opsv/project.yaml`；
- 修改历史 Asset Documents、Tasks、Artifacts 或 Circle；
- 删除 append-only 历史。

---

## 5. 目标架构与不可破坏约束

### 5.1 Pack 加载与验证

目标链路：

```text
pack.yaml
  → syntactic schema validation
  → export path normalization
  → realpath containment
  → exported file schema validation
  → cross-file identity/reference validation
  → policy validation
  → canonical content digest
  → PackLock / ResolvedPack
```

约束：

1. `pack.yaml` 是唯一 export index。
2. 未导出的物理文件不进入运行时解析；若疑似 WIP/孤儿文件，可由 `pack check` 以 warning 报告。
3. 导出的 Category/Profile/Skill 必须全部解析成功。
4. Profile `skill`、Skill `profile`、Skill `category` 和 Category `profiles` 必须形成闭环。
5. 错误必须 fail closed，不得静默降级为空 gates。
6. Pack 路径不得通过 `../` 或符号链接逃出 Pack root。

### 5.2 Work Packet 与 NextAction

Work Packet 不再把 shell command string 当作架构 API。目标模型示意：

```ts
type NextAction =
  | { kind: 'draft'; asset: string; skill: string }
  | { kind: 'materialize'; asset: string; profile: string; dryRunSupported: true }
  | { kind: 'circle'; asset: string; sourceDir: string }
  | { kind: 'compile'; asset: string; manifest: string }
  | { kind: 'sync'; asset: string }
  | { kind: 'blocked'; issueCodes: string[] };
```

实际字段名由 `design.md` 决定，但必须满足：

- action 来源于已验证的 Skill/Profile contract，不从 `profile.kind` 猜测；
- structured action 是 source of truth；
- shell command 只是 Core renderer 的派生展示；
- production compile/produce 必须带明确 `manifest` 和 `asset/file selector`；
- 多 Circle 命中必须返回稳定错误 `CIRCLE_AMBIGUOUS`；
- draft action 返回 Skill/authoring surface，不伪造不可执行的 materialize 命令；
- future Hook/Router 消费 structured action，不解析 shell string。

### 5.3 Policy lattice

自治等级定义：

```text
auto < ask < human
```

合并规则：

```text
effective = stricter(packPolicy, projectPolicy)
```

约束：

- Project 只能收紧，不能放宽 Pack policy；
- 放宽尝试必须产生稳定 issue code，而不是静默取 Project 值；
- `delete: never` 是 Core invariant，任何层都不能覆盖；
- policy 解析、比较、合并只能有一个共享实现。

### 5.4 Pack content digest

Pack lock 至少记录：

- Pack `id`、`version`、source；
- `manifest_digest`；
- `content_digest`；
- digest algorithm/version；
- 规范化文件清单或足以诊断差异的元信息。

`content_digest` 覆盖所有影响运行时或 Agent 行为的受管内容，包括：

- `pack.yaml`；
- 导出的 Category/Profile/Skill manifest；
- 对应 `SKILL.md`；
- Pack contract 引用的 templates、validation configs、scripts、references；
- 后续通过明确 include/exclude 规则纳入的文件。

排除：

- `.git/`；
- 缓存、测试输出、临时文件；
- OS metadata；
- 明确不参与发布的本地文件。

目录遍历顺序、路径分隔符和文本字节必须规范化，确保相同内容跨机器得到相同摘要。

### 5.5 MV Pack capability 约束

Pack Profile 只声明抽象 capability，Project 负责 capability → model binding。建议评审以下候选能力：

- `character-multiview-generation`
- `two-reference-character-consistency`
- `scene-character-compositing`
- `multi-character-scene-compositing`

最终名称须在 MV 子任务 `design.md` 中确认。Skill 不得出现 `rh-workflow-v2.*` 等具体 model key 作为规范路径。

---

## 6. Trellis 父子任务树

建议父任务：

```text
08-05-opsv-mv-pack-contract-hardening
```

建议子任务：

| ID | Trellis 子任务 | 仓库 | 结果 |
|---|---|---|---|
| T01 | `08-05-pack-schema-and-check` | openspec-video | Pack schema、跨文件 checker、稳定 issue codes |
| T02 | `08-05-structured-next-action` | openspec-video | Work Packet action/command 修复，结构化 NextAction |
| T03 | `08-05-policy-tightening-lattice` | openspec-video | Project 只能收紧 Pack policy |
| T04 | `08-05-pack-content-digest` | openspec-video | canonical content digest 和 lock 升级 |
| T05 | `08-05-pack-path-and-shim-safety` | openspec-video | root containment、broken shim 自愈 |
| T06 | `08-05-mv-identity-conformance` | opsv-mv-pipeline | Skill/Profile/Category identity 闭环 |
| T07 | `08-05-mv-capability-profile-redesign` | opsv-mv-pipeline | 四个 Profile 与 capability 正式化、模型解耦 |
| T08 | `08-05-mv-half-life-contract-fixture` | 两仓联合 | 自包含五点 E2E fixture 和 runner |
| T09 | `08-05-mv-discovery-release-surface` | opsv-mv-pipeline | canonical 安装/发现/发布入口 |
| T10 | `08-05-core-pack-quality-gates` | 两仓联合 | lint、Jest 生命周期、CI 和 Pack release gate |
| T11 | `08-05-hook-dispatcher-readiness` | openspec-video | Hook/Router 前置契约与最终 Go/No-Go |

> 两个 Git 仓库应分别提交。父任务负责依赖和联合验收，不要求跨仓原子提交。

### 6.1 评审 Finding 可追踪矩阵

| Finding | 问题摘要 | 主修复任务 | 联合验收 |
|---|---|---|---|
| F1 | workflow Work Packet 错误硬编码 materialize | T02 | T08、T11 |
| F2 | production command 缺 manifest/file selector | T02 | T08、T11 |
| F3 | MV Skill/Profile identity mismatch、gates 丢失 | T01、T06 | T08、T11 |
| F4 | lock 只摘要 `pack.yaml` | T04 | T08、T11 |
| F5 | half-life fixture false-green | T08 | T10、T11 |
| F6 | WIP Profile 不可达、Skill 硬编码模型 | T07 | T08、T10 |
| F7 | Project policy 可以放宽 Pack policy | T03 | T08、T11 |
| F8 | 缺少 Pack schema 与跨文件 checker | T01 | T06、T08 |
| F9 | 多套 Pack discovery/install 真相 | T09 | T10 |
| F10 | broken Skill shim 无法自愈 | T05 | T10、T11 |
| F11 | Pack export path 缺 root containment | T05 | T10、T11 |
| F12 | lint/Jest/open-handle 基线不稳定 | T10 | T11 |

### 6.2 建议创建命令

在实施开始时使用项目实际支持的 Trellis 命令创建；以下仅作为推荐结构：

```bash
python3 ./.trellis/scripts/task.py create \
  "OPSV Core and MV Pack contract hardening" \
  --slug 08-05-opsv-mv-pack-contract-hardening

python3 ./.trellis/scripts/task.py create \
  "Pack schema and check command" \
  --slug 08-05-pack-schema-and-check \
  --parent 08-05-opsv-mv-pack-contract-hardening
```

其余子任务按表格依次创建。创建后执行：

```bash
python3 ./.trellis/scripts/task.py validate <task-name>
python3 ./.trellis/scripts/task.py list-context <task-name> implement
python3 ./.trellis/scripts/task.py list-context <task-name> check
```

若当前 Trellis 版本的 `--parent` 行为不同，以 `task.py --help` 和 `.trellis/workflow.md` 为准，使用 `add-subtask` 建立层级。

---

## 7. 依赖图与阶段顺序

```text
T01 Pack schema/check ─────────────┬────> T06 MV identity
                                  │
T03 Policy lattice ───────────────┤
                                  ├────> T08 MV fixture ──> T10 quality gates ──> T11 readiness
T04 Content digest ───────────────┤             ▲
                                  │             │
T05 Path/shim safety ─────────────┘             │
                                                │
T02 Structured NextAction ──────────────────────┘

T06 MV identity ──> T07 MV capabilities ──> T08 MV fixture
T06 MV identity ──> T09 discovery surface ─> T10 quality gates
T04 Content digest ─────────────────────────> T11 readiness
T02 Structured NextAction ──────────────────> T11 readiness
```

### 7.1 强制依赖

1. **T01 在 T06 最终验收之前完成**：MV migration 必须由机器 checker 证明，而不是人工 grep。
2. **T02 在 T11 之前完成**：Hook/Router 不能继续解析不可靠的 command string。
3. **T04 在 T11 之前完成**：Hook cache 和 AgentRouter fingerprint 必须引用真实 Pack content digest。
4. **T06、T07 在 T08 之前完成**：fixture 只验证 canonical identity 和正式 capability，不为临时命名背书。
5. **T08 在 T11 之前全绿**：五点契约 fixture 是 Hook 开发的硬门禁。
6. **T10 在 T11 之前完成**：必须区分 sandbox 限制与真实 open-handle/lint 问题。
7. T03、T04、T05 可与 T06/T07 分仓并行，但联合验收必须基于同一 Core/Pack 版本组合。

---

## 8. Phase 0A：OPSV Core Contract Stabilization

### T01 — Pack schema、跨文件契约与 `opsv pack check`

**Owner**：`openspec-video/cli`
**优先级**：P0
**依赖**：无
**建议复杂度**：需要 `prd.md`、`design.md`、`implement.md`

#### 目标

新增一个可独立运行、可 JSON 输出、错误码稳定的 Pack contract checker，使无效 Pack 在 lock、sync-skills、Work Packet 之前 fail closed。

#### 主要改动范围

- `cli/src/types/`：Pack、Category、Profile、Skill manifest 的 Zod schemas；
- `cli/src/core/PackContracts.ts`：跨文件 graph validation；
- `cli/src/core/ProjectConfig.ts`：使用已验证的 resolved Pack；
- `cli/src/commands/pack.ts`：新增 `pack check [path] --json`；
- `cli/src/errors/OpsVError.ts`：稳定错误分类；
- `cli/src/**/__tests__/`：单元和跨层测试。

#### 最低 schema/contract 范围

- `pack.yaml` 的 id/version/dependencies/policy/categories/profiles/skills；
- production/workflow Profile 的互斥和必需字段；
- capability 不得看起来像 concrete provider/model key；
- Skill manifest 的 name/action/category/profile/gates；
- export path 文件存在性；
- Profile → Skill；
- Skill → Profile；
- Skill → Category；
- Category default_profile 和 profiles allow-list；
- Profile 必须进入相应 Category allow-list；
- `delete` 只能为 `never`；
- duplicate export、identity mismatch、unknown keys 的 severity 策略。

#### 稳定 issue code 建议

```text
PACK_SCHEMA_INVALID
PACK_EXPORT_MISSING
PACK_EXPORT_OUTSIDE_ROOT
PACK_PROFILE_SKILL_MISSING
PACK_SKILL_PROFILE_MISSING
PACK_SKILL_CATEGORY_MISSING
PACK_PROFILE_NOT_ALLOWED
PACK_DEFAULT_PROFILE_INVALID
PACK_POLICY_INVALID
PACK_CAPABILITY_CONCRETE_MODEL
PACK_ORPHAN_FILE
```

最终 code 清单在 `design.md` 固化，并加入兼容测试。

#### 红测

1. 用最小合法 Pack 证明 checker 通过。
2. Profile 引用未导出 Skill 时失败，不能返回空 gates。
3. Skill 引用不存在 Profile/Category 时失败。
4. Category default/allow-list 不一致时失败。
5. export 文件不存在时失败。
6. `--json` stdout 只输出机器 JSON；诊断日志走 stderr。
7. `pack lock` 遇到 checker error 时不得写 lock。
8. 扩展 `ArchitectureFlow.test.ts` 或等价 flow test，覆盖：Pack → Project → Work Packet。

#### 最小实现顺序

1. 定义 schemas 和解析结果类型；
2. 将现有 YAML 读取收口到单一 decoder；
3. 建立 export graph；
4. 实现 cross-file validator；
5. 实现 CLI renderer（human + JSON）；
6. 把 checker 设为 `pack lock` 前置条件；
7. 让 Work Packet 只消费 validated/resolved Pack。

#### 验证命令

```bash
cd cli
npm run build
npx jest src/core/__tests__/PackContracts.test.ts --runInBand
npx jest src/core/__tests__/ArchitectureFlow.test.ts --runInBand
node dist/cli.js pack check ../packs/short-drama --json
npm test -- --runInBand
```

#### 验收标准

- 合法 reference Pack 为 0 error；
- 当前未修复 MV Pack 能准确报出 Skill/Profile mismatch；
- 所有 error 含稳定 code、相对路径和必要 context；
- `pack lock` 不再锁定无效 Pack；
- Work Packet 不再对无效关联 fail open；
- 无命令层私有 schema/cast。

#### 回滚点

checker 可先以独立命令落地，再单独提交 lock precondition。若 precondition 引发兼容问题，可回滚“强制接入”提交，但保留 schema/check 命令和测试。

#### 推荐小提交

1. `test: cover invalid pack cross-file contracts`
2. `feat: add typed pack schemas and diagnostics`
3. `feat: add opsv pack check command`
4. `fix: require valid pack contracts before lock`

#### Trellis context

`implement.jsonl`：architecture、directory-structure、config-system、error-handling、pack-format、cross-layer guide。
`check.jsonl`：testing、quality-guidelines、pack-format、现有联合评审文档。

---

### T02 — 结构化 NextAction 与 Work Packet 可执行性

**Owner**：`openspec-video/cli`
**优先级**：P0
**依赖**：T01 的 validated Skill/Profile contract；类型设计可提前进行
**建议复杂度**：需要 `prd.md`、`design.md`、`implement.md`

#### 目标

修复 workflow action 猜测和 production 命令缺参问题，让 Work Packet 始终表达一个确定、允许且可执行的下一步，或明确表达 blocked。

#### 主要改动范围

- `cli/src/core/WorkPacket.ts`
- 新建或复用 action/command builder owning module；
- `cli/src/core/ManifestReader.ts`
- `cli/src/commands/work.ts`
- `cli/src/commands/produce.ts` 的参数契约测试；
- `cli/src/core/__tests__/WorkPacket.test.ts`
- `cli/src/core/__tests__/ArchitectureFlow.test.ts`

#### 红测

1. workflow Skill `action: draft` 返回 `NextAction.kind=draft`，不返回 `materialize`。
2. workflow Skill `action: materialize` 且 Profile 声明 materialize 规则时返回 materialize。
3. production asset 未进入 Circle 时返回 circle/compile 前置动作，而不是不可执行 produce。
4. production asset 在唯一 Circle 时返回 manifest + asset selector。
5. 从 project root 执行 renderer 生成的命令只处理目标 asset。
6. 同一 asset 位于多个 Circle 时返回 `CIRCLE_AMBIGUOUS`。
7. blocked issues 存在时不得同时返回可执行 action。
8. JSON 字段版本或 schema 被测试锁定。

#### 实现要点

- Skill manifest action 是 action source of truth；
- Profile kind 只决定允许的 action family，不直接决定具体 action；
- command renderer 只从 `NextAction` 生成文本；
- manifest path 使用 project-root-relative 或明确的规范化绝对路径策略；
- model/provider 仍由 production pipeline 通过 capability binding 解析，不优先固化在 shell command 中；
- Work Packet JSON 加 contract version，供未来 Adapter 做显式兼容。

#### 验证命令

```bash
cd cli
npm run build
npx jest src/core/__tests__/WorkPacket.test.ts --runInBand
npx jest src/core/__tests__/ArchitectureFlow.test.ts --runInBand
npm test -- --runInBand
```

联合 fixture 建立后追加：

```bash
opsv work check music --json
opsv work check <production-asset> --json
opsv produce --manifest <fixture-manifest> --file <production-asset>
```

#### 验收标准

- `music` 不再返回 `opsv materialize music`；
- production command 可从项目根执行；
- command 明确限定 manifest 和 asset；
- structured action 与 rendered command 一致；
- Hook/Router 无需解析 command string；
- 不存在“有 critical issue 但仍给出可执行 action”的状态。

#### 回滚点

先增加 structured action，同时暂时保留旧 `command` 字段作为派生兼容字段；待 Pack fixture 和下游验证后，再决定旧字段弃用周期。

#### 推荐小提交

1. `test: reproduce invalid work packet actions`
2. `feat: add structured next action contract`
3. `fix: derive workflow action from skill manifest`
4. `fix: render scoped production commands`

#### Trellis context

`implement.jsonl`：architecture、document-pipeline、error-handling、pack-format、asset-documents、cross-layer guide。
`check.jsonl`：testing、quality-guidelines、联合评审 F1/F2/F3。

---

### T03 — Policy tightening lattice

**Owner**：`openspec-video/cli`
**优先级**：P0
**依赖**：可独立；与 T01 集成验收
**建议复杂度**：`prd.md` + `design.md` + `implement.md`

#### 目标

替换 `Object.assign` 式覆盖，确保 Project policy 只能收紧 Pack policy。

#### 红测

覆盖所有组合：

| Pack | Project | 结果 |
|---|---|---|
| auto | ask | ask |
| auto | human | human |
| ask | human | human |
| human | auto | error 或 human，按 design 决策但不能放宽 |
| ask | auto | error 或 ask，按 design 决策但不能放宽 |
| delete: never | 任意其他值 | error |

还需覆盖缺省值和未知 action key。

#### 实现要点

- 单一 `PolicyLevel` schema；
- 单一 rank/comparator；
- 区分“有效合并结果”和“配置尝试放宽”的诊断；
- Work Packet 显示 effective policy 以及可选 origin；
- `pack check` / project config validation 在适当阶段报告错误。

#### 验证命令

```bash
cd cli
npm run build
npx jest src/core/__tests__/ProjectConfig.test.ts --runInBand
npx jest src/core/__tests__/WorkPacket.test.ts --runInBand
npm test -- --runInBand
```

#### 验收标准

- Project 无法把 `human` 或 `ask` 变为 `auto`；
- `delete: never` 永久保持；
- policy 比较逻辑只存在一份；
- 错误 code 和输出稳定。

#### 回滚点

保留旧配置读取兼容，但不保留旧的 loosen 行为。若生产配置存在放宽值，提供 doctor/check 诊断和迁移说明，不通过静默兼容恢复错误语义。

#### 推荐小提交

1. `test: define policy tightening matrix`
2. `feat: add policy lattice resolver`
3. `fix: prevent project policy loosening`

#### Trellis context

`implement.jsonl`：architecture、config-system、error-handling、pack-format、code-reuse guide。
`check.jsonl`：testing、quality-guidelines、联合评审 F7。

---

### T04 — Canonical Pack content digest 与 lock 迁移

**Owner**：`openspec-video/cli`
**优先级**：P0
**依赖**：T01 提供 validated export graph
**建议复杂度**：需要 `prd.md`、`design.md`、`implement.md`

#### 目标

让 `.opsv/pack-lock.yaml` 能证明实际运行的 Pack 内容，而不只是 `pack.yaml`。

#### 设计必须回答

1. digest include/exclude 规则；
2. symlink 文件如何处理；
3. 文本换行是否规范化；
4. lock schema version；
5. 旧 lock 只有 `digest` 时如何读取和提示升级；
6. Task provenance 如何记录 `content_digest`；
7. Hook cache/Router fingerprint 如何引用同一摘要实现。

#### 红测

- 修改导出的 Category/Profile/Skill manifest，digest 改变；
- 修改对应 `SKILL.md`，digest 改变；
- 修改纳入发布的 validation script/reference，digest 改变；
- 修改 `.git/`、缓存或测试输出，digest 不变；
- 文件创建顺序不同但内容相同，digest 相同；
- `../` 或 symlink escape 不得被 hash 为合法 Pack 内容；
- 旧 lock 可被明确识别并要求 re-lock；
- lock 写入具备确定性。

#### 验证命令

```bash
cd cli
npm run build
npx jest src/core/__tests__/ProjectConfig.test.ts --runInBand
npx jest src/core/__tests__/PackDigest.test.ts --runInBand
npm test -- --runInBand
```

#### 验收标准

- 任一有效 Pack 行为文件变化都会改变 `content_digest`；
- 相同 Pack 内容跨临时目录得到相同摘要；
- lock 同时区分 manifest 与 content digest；
- Work Packet/Task provenance 可见 content digest；
- 后续 Hook cache 不另写摘要算法。

#### 回滚点

先以 lock schema v2 并行读取旧字段；写入默认升级到 v2。若需要短期兼容，可继续读取 v1，但必须发出明确 stale/legacy 诊断。

#### 推荐小提交

1. `test: define canonical pack content digest`
2. `feat: compute pack tree content digest`
3. `feat: write versioned pack lock digests`
4. `feat: expose pack digest in work provenance`

#### Trellis context

`implement.jsonl`：architecture、config-system、pack-format、path security 相关代码研究、cross-layer guide。
`check.jsonl`：testing、quality-guidelines、联合评审 F4。

---

### T05 — Pack export path 与 Skill shim 安全

**Owner**：`openspec-video/cli`
**优先级**：P0/P1
**依赖**：与 T01/T04 协作；可独立编码
**建议复杂度**：`prd.md` + `design.md` + `implement.md`

#### 目标

统一 Pack 文件路径安全和 Agent Skill shim 生命周期，消除路径逃逸、broken symlink `EEXIST` 和 collision 的不确定行为。

#### 红测

1. `profiles/x: ../outside.yaml` 被拒绝。
2. Pack root 内 symlink 指向 root 外文件时被拒绝。
3. 合法 root 内文件和 symlink 按明确策略通过。
4. broken destination symlink 可被安全替换。
5. destination 已有普通文件时不得覆盖，返回明确 collision。
6. destination 已有正确 symlink 时幂等成功。
7. `.agents` 与 `.codex` 使用同一底层实现。
8. 路径错误不得留下半写入 shim。

#### 实现要点

- 用 `lstat`/lexists 语义识别 broken symlink；
- path normalization 与 `realpath` containment 共用一套 helper；
- 对尚不存在的目标路径，先验证 parent realpath，再安全创建；
- 所有平台 Adapter 只提供目标目录策略，不复制文件安全代码；
- 错误消息包含 Pack-relative source 和 destination。

#### 验证命令

```bash
cd cli
npm run build
npx jest src/core/__tests__/ProjectConfig.test.ts --runInBand
npx jest src/utils/__tests__/pathSecurity.test.ts --runInBand
npm test -- --runInBand
```

#### 验收标准

- Pack export 无法逃出 root；
- broken shim 自动恢复；
- 普通文件/非 OPSV symlink 不被覆盖；
- 重复 sync 幂等；
- 安全检查被 T01、T04 和 sync-skills 复用。

#### 回滚点

path helper 与 shim recovery 分提交。若兼容性问题出现，可单独回滚 shim 行为，不回滚 export containment 安全修复。

#### 推荐小提交

1. `test: cover pack path escape and broken shims`
2. `fix: enforce pack export root containment`
3. `fix: recover broken skill shims safely`

#### Trellis context

`implement.jsonl`：directory-structure、config-system、error-handling、testing、pack-format、code-reuse guide。
`check.jsonl`：quality-guidelines、联合评审 F10/F11。

---

## 9. Phase 0B：MV Pack Conformance

> MV Pack 位于独立 Git 仓库。所有变更必须在该仓库单独检查 status、提交和回滚；不要从主仓库提交 symlink 目标内容。

### T06 — canonical Skill/Profile/Category identity

**Owner**：`opsv-packs/opsv-mv-pipeline`
**优先级**：P0
**依赖**：T01 checker 可用后最终验收
**建议复杂度**：`prd.md` + `design.md` + `implement.md`

#### 目标

消除 `mv-*` 与 `opsv-mv-*` 双命名空间以及 shotlist 三重身份，让所有已导出 Profile/Skill/Category 形成唯一闭环。

#### 决策建议

- `pack.yaml skills:` key 使用 canonical agent Skill name：`opsv-mv-*`；
- Profile `skill:` 使用同一 key；
- `skill.yaml name` 与目录/导出 key 一致；
- Skill `profile:` 指向 `pack.yaml profiles:` 中真实导出的 key；
- shotlist 只保留 `shotlist` Profile，删除或迁移未导出的 `mv-shotlist` 重复定义；
- Category default 和 allow-list 使用 canonical Profile key。

若选择不同命名方案，必须在 `design.md` 给出映射、兼容和迁移理由，但仍只能有一个运行时 identity。

#### 红测/验收测试

1. T01 checker 对修复后的 MV Pack 为 0 identity error。
2. 每个 Profile `skill` 命中 exported Skill。
3. 每个 Skill manifest 的 Profile/Category 命中并被 allow-list 接受。
4. `opsv work check` 对各 canonical fixture asset 返回正确 Skill 和非空 gates。
5. `shotlist` 不再存在未导出重复运行时 Profile。
6. `pack sync-skills --platform agents/codex` 生成的 shim 指向 canonical Skill。

#### 迁移清单

- `pack.yaml`
- `profiles/*.yaml`
- `skills/*/skill.yaml`
- `skills/*/SKILL.md` 内 identity 文本与命令示例；
- Category YAML；
- fixture 文档；
- README、manifest/legacy metadata；
- scripts/tests 中的 identity 常量。

修改任何 identity 前必须按 Trellis guide 全仓搜索旧值。

#### 验证命令

```bash
# 使用构建后的 Core CLI
opsv pack check /home/uncle7/code/opsv/opsv-packs/opsv-mv-pipeline --json
opsv pack lock
opsv pack sync-skills --platform agents
opsv work check <fixture-asset> --json
```

Pack 自身已有检查继续运行：

```bash
node --check scripts/director-timeline-check.js
node --check scripts/director-prepare-task.js
node --check scripts/mv-check.js
node --test test/director-timeline-check.test.js
```

#### 验收标准

- identity checker 0 error；
- Work Packet gates 不再为空或静默丢失；
- shotlist 只有一个 canonical Profile；
- Skill discovery 与 Pack runtime 使用同一 identity；
- 没有未解释的旧 identity 残留。

#### 回滚点

先提交 manifest/profile identity 修改，再提交文档和 discovery surface 更新。保留迁移映射记录，避免回滚时无法识别旧 fixture。

#### 推荐小提交

1. `test: assert mv pack identity closure`
2. `fix: align mv skill export identities`
3. `fix: canonicalize shotlist profile identity`
4. `docs: update mv skill identity references`

#### Trellis context

若 Pack 仓库无独立 Trellis 目录，可由主仓父任务保存 context，并在 Pack `implement.md` 明确引用：architecture、pack-format、asset-documents、code-reuse guide、联合评审 F3。

---

### T07 — MV Capability 与四个生产 Profile 正式化

**Owner**：`opsv-packs/opsv-mv-pipeline`
**优先级**：P0/P1
**依赖**：T06
**建议复杂度**：必须有 `prd.md`、`design.md`、`implement.md`

#### 目标

对以下四个 WIP Profile 做正式产品决策，而不是继续以“磁盘上存在但运行时不可达”的状态保留：

- `character-multiview.yaml`
- `character-tworef.yaml`
- `scene-character-2refs.yaml`
- `scene-character-3refs.yaml`

每个 Profile 必须二选一：

1. 正式导出并完成 capability、Category allow-list、Skill、refs/input contract、fixture binding；或
2. 从发布内容中撤回，并记录延期原因。

#### 设计内容

每个正式 Profile 明确：

- `kind: production`；
- 独立抽象 capability；
- 所属 Category；
- required reference categories；
- input slots/数量/顺序语义；
- outputs/variants；
- Skill identity；
- Project fixture binding；
- 是否允许 fallback capability；
- 与通用 `image-generation` 的关系。

#### 红测

1. Pack checker 验证 export、allow-list 和 Skill 闭环。
2. Project 缺少新 capability binding 时，Work Packet 返回明确 blocked issue。
3. Project 提供 binding 时，production NextAction 解析成功。
4. Skill 文档不得包含 concrete `rh-workflow-v2.*` 作为执行模型。
5. required refs 缺失/未批准时 blocked；满足后 unblock。
6. 多参考输入顺序和 category 由 Core/contract 可验证，而非只写在 prose。

#### 实现要点

- 不通过在 Skill 中拼 `opsv produce --model ...` 绕过 binding；
- 如果 Core 现有 Profile schema 不能表达 input slot 差异，先在 T01/T02 的设计中扩展通用 declarative contract，不能引入 MV 专属硬编码；
- Pack-specific arithmetic/semantic validation 仍留在 scripts；
- 对 capability rename 提供 fixture project migration 示例。

#### 验证命令

```bash
opsv pack check /home/uncle7/code/opsv/opsv-packs/opsv-mv-pipeline --json
opsv pack lock
opsv work check <character-fixture> --json
opsv work check <scene-fixture> --json
```

并执行禁止 concrete model 的静态检查；最终应由 Pack checker 或专用 test 拥有，不应长期只依赖 grep。

#### 验收标准

- 四个 Profile 均有“正式发布”或“撤回”结论；
- 正式 Profile 可被 Asset Document 解析；
- Category allow-list 完整；
- capability 粒度足以选择不同工作流；
- Skill 无 concrete provider/model；
- fixture Project 通过 bindings 解析模型。

#### 回滚点

每个 capability/Profile 尽量独立提交。若某个工作流仍不稳定，可只撤回该 Profile export，不影响其他已验证 Profile。

#### 推荐小提交

1. `design: define mv production capabilities`
2. `feat: export character production profiles`
3. `feat: export scene composition profiles`
4. `fix: remove concrete models from mv skills`
5. `test: cover mv capability bindings`

#### Trellis context

`implement.jsonl`：architecture、pack-format、asset-documents、cross-layer guide、MV Skill/Profile 源文件。
`check.jsonl`：Pack 五点 contract、联合评审 F6、fixture 预期。

---

### T08 — half-life 五点 Pack contract fixture

**Owner**：两仓联合；fixture 和 Pack runner 在 `opsv-mv-pipeline`，Core flow helper 可在 `openspec-video/cli`
**优先级**：P0
**依赖**：T01、T02、T03、T04、T05、T06、T07
**建议复杂度**：必须有 `prd.md`、`design.md`、`implement.md`

#### 目标

把当前 false-green fixture 改造成自包含、可重复、失败即红的真实 Pack contract E2E。

#### Fixture 最低组成

```text
test/fixtures/half-life-v1/
  .opsv/project.yaml
  .opsv/category_validate.yaml
  videospec/
    music.md
    shotlist.md
    character/scene/shot documents...
  reference/
    real placeholder images...
  expected/
    work-packet/*.json
    materialize/*.txt or snapshots
  scripts or runner metadata
```

lock 和 Circle 可由 runner 每次在临时目录生成，避免提交机器相关绝对路径；若提交 golden lock，必须使用可移植 source 表达。

#### 必须证明的五点契约

1. `work check` 返回正确 Skill 和 capability binding；
2. unapproved external reference 会阻断；
3. approved `@id:variant` 会解除阻断；
4. Circle 对生产者和消费者按依赖排序；
5. workflow materialization 只创建缺失文档，不覆盖已有文档。

#### 额外修复

- `shotlist.md` frontmatter 提供合法 `plan:` 数组；
- 修复 Asset id 大小写/命名不一致；
- refs value 不得为空数组；
- 所有引用图片真实存在或由 runner 创建；
- strict validate 的 expected warnings/errors 明确；
- Work Packet JSON snapshot 去除绝对路径和时间戳等不稳定字段。

#### Runner 顺序

```text
1. copy fixture to temp project
2. inject local Pack source
3. opsv pack check
4. opsv pack lock
5. opsv validate --strict
6. work check: binding + blocked cases
7. explicit approve fixture variant or install approved state
8. work check: unblocked case
9. circle create / inspect ordering
10. materialize --dry-run and real run
11. assert existing files unchanged and only missing files created
12. node scripts/mv-check.js all
```

#### 红测

先将当前 fixture 接入 runner，确认至少在以下点失败：

- Pack identity；
- frontmatter `plan:`；
- dead refs/missing media；
- approved/unapproved ref；
- Circle 缺失；
- materialize；
- false-green local checker。

禁止先修改 fixture 再补一个无法证明旧错误的测试。

#### 验证命令

最终由 Pack 提供单一入口，例如：

```bash
npm test
# 或
node --test test/pack-contract.test.js
```

runner 内必须实际调用构建后的 Core CLI；同时保留：

```bash
node scripts/mv-check.js all
node --test test/director-timeline-check.test.js
```

#### 验收标准

- fixture 在干净临时目录可重复通过；
- 五点契约均有正反断言；
- strict validate 为预期状态；
- shotlist 可 dry-run materialize；
- materialize 不覆盖已有文档；
- `mv-check.js` 失败会使总 runner 失败，但它不替代 Core gate；
- 修改 canonical Pack rule 后 fixture 能发现 lock/digest 变化。

#### 回滚点

fixture 数据修复、runner、Core helper 分提交。旧 fixture 可在一个提交中重命名为 `legacy-invalid` 作为 regression 输入，但不能继续作为绿色 reference fixture。

#### 推荐小提交

1. `test: expose half-life fixture contract failures`
2. `fix: make half-life fixture core-valid`
3. `test: cover approved reference and circle ordering`
4. `test: cover idempotent shotlist materialization`
5. `test: combine core and mv semantic gates`

#### Trellis context

`implement.jsonl`：architecture、document-pipeline、testing、pack-format、asset-documents、cross-layer guide、联合评审 F5。
`check.jsonl`：完整五点契约、fixture expected snapshots、Director test 记录。

---

### T09 — MV canonical discovery、安装和发布入口

**Owner**：`opsv-packs/opsv-mv-pipeline`
**优先级**：P1
**依赖**：T06；可与 T08 并行，最终进入 T10
**建议复杂度**：`prd.md` + `implement.md`；若 legacy consumer 不清楚则补 `design.md`

#### 目标

消除 `pack.yaml`、root `SKILL.md`、`manifest.json` 和 README `cp -r` 形成的多套发现真相。

#### 目标规则

- `pack.yaml` 是 runtime 唯一 export index；
- 安装流程使用 `opsv pack lock`；
- Agent Skill 发现使用 `opsv pack sync-skills --platform ...`；
- legacy metadata 只能作为兼容/导航，不得重新定义 Profile/Skill exports；
- README 不再鼓励复制目录形成不可追踪安装；
- root navigator 明确指向 canonical Pack 和 Skill identity。

#### 验收标准

- 新用户只按 README 可以完成 lock、sync-skills、work check；
- 修改 `manifest.json` 不会改变 runtime export；
- legacy 文件标注 deprecated/compatibility；
- Pack release checklist 只使用 canonical commands；
- 文档示例与 T06/T07 identity、capability 一致。

#### 验证命令

```bash
opsv pack check . --json
opsv pack lock
opsv pack sync-skills --platform agents
opsv pack sync-skills --platform codex
opsv work check <fixture-asset> --json
```

#### 回滚点

先更新 README 和 metadata 声明；删除 legacy 文件必须单独提交，并确认无已知 consumer 后进行。

#### 推荐小提交

1. `docs: make pack commands the canonical install path`
2. `chore: align legacy mv discovery metadata`
3. `test: verify canonical skill sync surface`

#### Trellis context

`implement.jsonl`：pack-format、architecture、T06 identity design。
`check.jsonl`：联合评审 F9、README clean-room install checklist。

---

## 10. Phase 1：质量门禁与发布基线

### T10 — Core/Pack quality gates 稳定化

**Owner**：两仓联合
**优先级**：P1，但为 Hook readiness 的硬门禁
**依赖**：T01–T09 的相关测试
**建议复杂度**：`prd.md` + `design.md` + `implement.md`

#### 目标

建立可区分“真实缺陷”和“受限 sandbox 环境”的稳定 CI 基线。

#### 当前已知基线

- `npm run build` 通过；
- `npm run lint` 当前因 `eslint` 不存在而不可执行；
- ReviewServer 在受限 sandbox 中可能因 `listen EPERM` 失败；
- SyncService 在受限 sandbox 中可能因 `spawnSync git EPERM` 失败；
- Jest 报告 open handles/不能自动退出；
- MV Director scripts 的 syntax check 与既有 Node test 通过。

#### 工作内容

1. 为 CLI 增加可执行的 lint 配置和依赖，或若决定不用 ESLint则同步修改 package scripts/spec；不能保留假门禁。
2. 定位 Jest open handles，修复 server/timer/child-process 生命周期。
3. ReviewServer 使用 app factory + supertest，单元测试不绑定真实端口。
4. SyncService 隔离 git process adapter，使单元测试可 mock，集成测试在支持 spawn 的 CI 运行。
5. 标记并记录确实需要系统权限的 integration tests，但不得通过跳过掩盖普通逻辑失败。
6. 增加 Core + Pack 联合 CI job，固定 Core build 和 Pack fixture 的组合。
7. Director scripts 和 `mv-check.js` 作为 Pack supplementary gates 保留。

#### 推荐 CI 矩阵

| Job | 环境 | 内容 |
|---|---|---|
| core-build-lint | 标准 Node CI | install、build、lint |
| core-unit | 标准 Node CI | Jest unit `--runInBand`，必须自动退出 |
| core-architecture-flow | 标准 Node CI | `ArchitectureFlow.test.ts` |
| mv-pack-contract | 标准 Node CI | T08 五点 fixture runner |
| mv-director | 标准 Node CI | syntax check、director node tests、mv-check |
| optional-system-integration | 具备 git/spawn/listen 权限 | Sync/real server 特定测试 |

#### 验证命令

```bash
cd cli
npm run build
npm run lint
npm test -- --runInBand --detectOpenHandles
```

Pack：

```bash
node --check scripts/director-timeline-check.js
node --check scripts/director-prepare-task.js
node --check scripts/mv-check.js
node --test test/director-timeline-check.test.js
node --test test/pack-contract.test.js
```

#### 验收标准

- build、lint、Jest 在标准 CI 全绿；
- Jest 自行退出，无未解释 open handles；
- sandbox 权限失败被标识为环境限制，不与真实断言失败混合；
- Pack 五点 fixture 和 supplementary checks 在一个 release gate 中；
- CI 失败日志能区分 Core contract、Pack contract 和环境问题。

#### 回滚点

lint、test lifecycle、CI workflow 分提交。不得为了绿色基线用 `--forceExit` 长期掩盖 open handles；如临时使用必须有 issue 和移除期限。

#### 推荐小提交

1. `chore: establish cli lint baseline`
2. `fix: close jest runtime handles`
3. `test: isolate server and git process boundaries`
4. `ci: add core and mv pack contract gates`

#### Trellis context

`implement.jsonl`：testing、quality-guidelines、error-handling、cross-layer guide、联合评审 F12。
`check.jsonl`：完整 CI 命令、sandbox 限制记录、T08 runner。

---

## 11. Phase 2：Agent Hook / Dispatcher Readiness

### T11 — readiness contract 与 Go/No-Go

**Owner**：`openspec-video`，联合读取 MV Pack fixture
**优先级**：P0 gate，不等于 Hook 实现
**依赖**：T01–T10
**建议复杂度**：`prd.md` + `design.md` + `implement.md`

#### 目标

证明 Core 和 Pack 已经可以作为 Hook/Dispatcher 的可信控制面，并为后续平台 Adapter 任务冻结输入输出契约。

#### Readiness contract

未来 Hook/Router 只能依赖：

1. typed Pack validation result；
2. versioned Work Packet；
3. structured `NextAction`；
4. stable issue codes 与 severity；
5. Pack `content_digest`；
6. effective policy；
7. project root/path canonicalization；
8. proposal validation 的后续接口，而不是仅验证旧磁盘文件。

#### 必须保留的 Hook 架构边界

- `invalid` 永远 fail closed；
- 只有明确的 `infrastructure_error` 才可根据 policy 决定 fail-open；
- 平台 Adapter 解析 proposed content，各平台协议独立；
- shared Core 不解析 Claude/Codex/Kimi 私有 payload；
- Hook cache key 至少包含：project、source path、proposed content hash、Pack content digest、validator contract version；
- AgentRouter 消费 `NextAction`，不解析 command string；
- Hook config manager 必须结构化合并、幂等、可卸载、可回滚；
- 本任务只冻结这些接口和测试，不开始多平台铺开。

#### Readiness 集成测试

1. 无效 MV Pack 无法 lock，也无法产生 Work Packet。
2. 合法 MV Pack 返回正确 Skill、gates、binding 和 NextAction。
3. Pack Skill/Profile/script 改变后 digest 改变，旧 fingerprint 不再相同。
4. policy loosen 尝试被阻断。
5. unique Circle 产生确定 compile action；多 Circle 返回 ambiguity。
6. half-life 五点 fixture 全绿。
7. Work Packet JSON schema/version 有兼容测试。
8. command renderer 的输出可执行，但 Router 测试只依赖 structured action。

#### Go 条件

以下全部满足才允许把状态从 Conditional No-Go 改为 Go：

- [ ] `opsv pack check <mv-pack> --json` 为 0 error；
- [ ] 所有 Profile/Skill/Category identity 形成闭环；
- [ ] `opsv work check music` 不返回伪 materialize action；
- [ ] production NextAction 带唯一 manifest 和 asset selector；
- [ ] 多 Circle 明确失败；
- [ ] Project policy 无法放宽 Pack policy；
- [ ] Pack content digest 覆盖行为文件；
- [ ] export path containment 和 broken shim 测试通过；
- [ ] half-life 五点 fixture 通过；
- [ ] Core build/lint/test 全绿且 Jest 自动退出；
- [ ] Pack contract/Director gates 全绿；
- [ ] Work Packet/NextAction/issue/digest contract 已版本化并写入 spec。

#### No-Go 条件

任何以下情况仍存在即保持 No-Go：

- empty gates 仍可由 identity mismatch 产生；
- Work Packet 返回无法从 project root 执行的命令；
- lock 看不到 Skill/Profile/script 变化；
- Pack checker 或 fixture 仍为 false-green；
- policy 可被 Project 放宽；
- path escape 未关闭；
- Jest 依赖 `--forceExit` 才能常态通过；
- Hook 设计仍只验证磁盘旧内容。

#### 验收输出

- readiness 测试；
- versioned JSON schema 或 TypeScript exported contract；
- Hook/Dispatcher 后续 PRD 输入；
- 更新后的 Trellis spec；
- 一份明确的 Go/No-Go 记录。

#### 推荐小提交

1. `test: add hook dispatcher readiness flow`
2. `docs: freeze work packet integration contract`
3. `docs: record hook implementation go decision`

#### Trellis context

`implement.jsonl`：architecture、document-pipeline、config-system、error-handling、testing、pack-format、cross-layer guide、两份 Hook 评审。
`check.jsonl`：T01–T10 验收结果、half-life runner、最终 Go checklist。

---

## 12. 测试矩阵

### 12.1 Core 单元测试

| 模块 | 正常路径 | 失败/边界路径 |
|---|---|---|
| Pack schemas | 最小合法 Pack | unknown/missing/type mismatch |
| Cross-file contracts | 完整闭环 | missing Skill/Profile/Category、allow-list mismatch |
| Policy | tightening | loosening、unknown、delete override |
| Digest | deterministic tree | content change、excluded file、symlink escape |
| Path security | in-root path | `../`、absolute escape、symlink escape |
| Shim sync | create/idempotent | broken link、collision、wrong target |
| NextAction | draft/materialize/circle/compile/sync | blocked、ambiguous Circle、unsupported action |
| Command renderer | scoped executable command | missing manifest/asset 禁止生成 |

### 12.2 Core 跨层测试

扩展 `cli/src/core/__tests__/ArchitectureFlow.test.ts` 或添加等价测试，覆盖：

```text
Pack decode
  → Pack check
  → lock
  → project binding/policy
  → Asset Document parse/refs
  → Work Packet
  → Circle/manifest
  → NextAction
  → rendered CLI invocation
```

Trellis 要求跨层字段或 payload 变更必须有架构流测试；`NextAction`、lock schema 和 issue codes 均属于此类变更。

### 12.3 MV Pack E2E

| 契约 | 失败案例 | 成功案例 |
|---|---|---|
| Skill/binding | identity/binding 缺失 | canonical identity + project binding |
| Approved refs | unapproved/syncing/ambiguous | approved explicit variant |
| Circle | consumer 无 producer 或顺序错误 | producer-before-consumer |
| Materialize | 缺 plan/试图覆盖 | 只创建缺失文档 |
| Semantic checks | 时间轴/卡点错误 | `mv-check.js all` 通过 |

### 12.4 兼容性测试

- 旧 lock schema 读取和升级提示；
- 旧 Work Packet `command` 字段的临时兼容；
- legacy Skill discovery metadata 不影响 runtime；
- 已有合法 `packs/short-drama` 不因 MV 特殊需求回归；
- Pack stack 多 Pack 解析不因 single Pack checker 设计受损。

---

## 13. 迁移与发布策略

### 13.1 双仓版本配对

由于 Core 与 MV Pack 在独立仓库：

1. Core 先发布能够报告问题但不一定强制的新 checker；
2. MV Pack 完成 identity/capability 修复；
3. Core 再启用 lock 前置强制；
4. MV Pack fixture 固定最低 Core version；
5. 发布记录明确 Core version、MV Pack commit/version 和 content digest。

避免在同一时间发布“Core 立即强制”与“Pack 尚未修复”的组合。

### 13.2 推荐 rollout

#### Stage A — Observe

- `opsv pack check` 可用；
- 对现有 Pack 报告 issues；
- 不改变已有 lock 读取；
- 收集兼容问题。

#### Stage B — Conform

- 修复 MV identity/capability/fixture；
- 更新 README 和 Skill discovery；
- 生成 lock v2。

#### Stage C — Enforce

- `pack lock` 强制 0 contract error；
- Work Packet 只消费 validated Pack；
- policy tightening 和 containment 强制生效。

#### Stage D — Integrate

- 通过 T11 readiness；
- 另开 Trellis 父任务实现 proposed-content Validation Core 和单平台 Hook 垂直切片。

### 13.3 用户迁移提示

需要提供清晰诊断和建议命令：

```text
PACK_LOCK_LEGACY
  → Run: opsv pack lock

PACK_SKILL_PROFILE_MISSING
  → Fix pack export/profile identity; do not continue with empty gates

PROJECT_POLICY_LOOSENS_PACK
  → Remove or tighten the project override

PACK_CAPABILITY_BINDING_MISSING
  → Add .opsv/project.yaml bindings entry
```

不得自动改写用户的生产 Asset Documents 或删除历史文件。

---

## 14. 回滚策略

### 14.1 Core

- schema/check、强制接入、lock v2、NextAction 和 renderer 分提交；
- 兼容读取与新写入分离；
- 安全修复不与大规模重构混合；
- 每个任务完成后记录已验证的 commit hash；
- 不使用破坏性 Git 操作覆盖当前工作树已有修改。

### 14.2 MV Pack

- identity、capability、fixture、docs 分提交；
- 每个新 Profile 可独立撤回 export；
- legacy metadata 删除必须独立提交；
- fixture 的旧错误版本如有 regression 价值，改名保留，不继续冒充绿色 reference。

### 14.3 联合回滚

发布记录维护兼容矩阵：

| Core | MV Pack | 状态 |
|---|---|---|
| old Core | old Pack | legacy baseline |
| new checker/non-enforcing Core | old Pack | diagnostics only |
| new Core | conformed Pack | target |
| enforcing Core | old Pack | unsupported / clear error |

如果联合发布失败，优先回滚 Core 的 enforcement 开关或 MV Pack version pointer，不回滚已验证的安全检查代码。

---

## 15. Definition of Done

每个子任务完成必须满足：

1. `prd.md` 验收项全部勾选；
2. `design.md` 的关键决策已实现，没有未记录偏差；
3. 红测先失败、修复后通过；
4. 新测试位于 `src/**/__tests__/` 或 Pack 明确测试目录；
5. 跨层变更有 `ArchitectureFlow.test.ts` 或等价 flow test；
6. `npm run build && npm test` 在标准环境通过；
7. 对相关任务执行 `task.py validate`；
8. 没有修改任务范围外文件；
9. conventional commits 小而可回滚；
10. 新形成的契约和踩坑已回写 `.trellis/spec/`；
11. 主仓和 Pack 仓分别记录 status/diff/test；
12. 父任务只在 T11 Go/No-Go 记录完成后归档。

---

## 16. Spec 更新清单

实现完成后，至少评估并更新：

### `.trellis/spec/architecture.md`

- Work Packet/NextAction 的正式定义；
- Pack content digest 的 provenance 角色；
- Hook/Router 只消费 Core typed contract 的边界。

### `.trellis/spec/cli/engine/document-pipeline.md`

- Pack validation 在 pipeline 中的位置；
- Work Packet action 解析；
- Circle ambiguity 和 compile action。

### `.trellis/spec/cli/engine/config-system.md`

- policy lattice；
- lock schema v2；
- content digest；
- path canonicalization。

### `.trellis/spec/cli/engine/error-handling.md`

- Pack checker 稳定 issue codes；
- invalid 与 infrastructure error 的区分；
- JSON stdout/stderr 规则。

### `.trellis/spec/cli/engine/testing.md`

- Pack schema 和 digest 测试模式；
- command renderer 的真实执行测试；
- sandbox-only integration 分类；
- open handles 禁止长期用 `--forceExit` 掩盖。

### `.trellis/spec/packs/authoring/pack-format.md`

- Profile/Skill/Category identity closure；
- capability 禁止 concrete model；
- content digest include/exclude；
- canonical discovery/install；
- Pack publish checker。

### `.trellis/spec/packs/authoring/asset-documents.md`

- fixture 对 approved/unapproved refs 的标准写法；
- workflow `plan:` 与 materialization 示例；
- 多参考 capability 的 declarative input contract（若本轮新增）。

---

## 17. 建议实施节奏

不以日历时间作为硬承诺，以通过门禁为推进条件：

| 阶段 | 任务 | 可并行性 | 退出条件 |
|---|---|---|---|
| 0 | 父任务、PRD/design、基线固化 | 单线程短阶段 | 任务树与 context validate |
| 0A | T01–T05 Core | T03/T05 可并行 | Core contract unit/flow green |
| 0B | T06–T07 MV | 可与 0A 分仓并行 | Pack checker 0 identity/capability error |
| 0C | T08–T09 fixture/release | T09 可并行 | 五点 fixture green |
| 1 | T10 quality gates | 部分并行 | CI 可重复且自动退出 |
| 2 | T11 readiness | 串行收口 | 明确 Go/No-Go + spec 更新 |

### 17.1 Critical path

```text
T01 → T06 → T07 → T08 → T10 → T11
```

并行支线：

```text
T03 ─┐
T04 ─┼→ T08/T11
T05 ─┘

T02 ─────→ T08/T11
T09 ─────→ T10
```

---

## 18. 最终验收命令集合

以下命令代表目标状态；部分命令需在对应任务实现后才存在：

### Core

```bash
cd /home/uncle7/code/opsv/openspec-video/cli
npm run build
npm run lint
npm test -- --runInBand --detectOpenHandles
node dist/cli.js pack check ../packs/short-drama --json
```

### MV Pack

```bash
cd /home/uncle7/code/opsv/opsv-packs/opsv-mv-pipeline
opsv pack check . --json
opsv pack lock
opsv pack sync-skills --platform agents
opsv pack sync-skills --platform codex
node --test test/pack-contract.test.js
node --test test/director-timeline-check.test.js
node scripts/mv-check.js all
```

### 联合 readiness

```bash
opsv work check music --json
opsv work check <fixture-production-asset> --json
opsv validate --dir test/fixtures/half-life-v1/videospec --max-depth -1 --strict
opsv materialize shotlist --dry-run
```

联合 runner 还必须断言：

- renderer 生成的 production command 可从 project root 执行；
- 只选择目标 asset；
- unapproved ref 阻断；
- approved variant 解锁；
- Circle producer-before-consumer；
- materialize 只创建缺失文档；
- Pack 内容变化导致 digest/fingerprint 变化。

---

## 19. 最终建议

本轮应优先把 **Pack Contract、Work Packet 和 MV fixture** 变成可被机器信任的控制面，而不是先扩大 Hook 覆盖面。

推荐决策：

1. 立即按 Trellis 创建父任务与 T01–T11 子任务；
2. 先执行 T01/T02，并在 MV 仓并行准备 T06/T07；
3. 将 T08 五点 fixture 作为两个仓库的联合集成门；
4. 在 T10 清理 lint 与 Jest 生命周期后执行 T11；
5. 只有 T11 给出 Go，才另立 Hook/Dispatcher 实现任务；
6. Hook 后续首个垂直切片应验证 **proposed content**，不能回到只读磁盘旧文件的方案。

在上述门禁完成前，Hook/Dispatcher 实施状态保持：

> **Conditional No-Go — architecture direction approved, implementation blocked by Core/Pack contract readiness.**

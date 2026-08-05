# OPSV Agent Hook 架构：现有代码与 MV Pack 联合评审

> 日期：2026-08-05  
> 评审对象：`/home/uncle7/.hermes/plans/2026-08-04_153000-opsv-agent-hook-architecture.md` v2、当前 `openspec-video` 工作树、链接仓库 `opsv-packs/opsv-mv-pipeline` 当前工作树  
> 结论：**暂缓进入 Hook/Dispatcher 实施阶段（Conditional No-Go）**。应先完成 Pack Contract、Work Packet、锁摘要和 MV fixture 的 Phase 0 修复，否则 Hook 会把当前错误路由、空 gates 和不可执行命令放大为“框架级强制错误”。

## 1. 执行摘要

架构方向本身是合理的：把 Pack 规则的机器执行集中在 OPSV Core，再由不同 Agent 平台的薄 Adapter 接入，比复制多套 Skill 规则更可维护。当前代码也已经具备 Pack Stack、Profile/Capability binding、Work Packet、Circle 和 Materializer 等关键骨架。

但联合检查发现，现有实现尚未形成可被 Hook 信任的闭环：

1. `opsv work check` 对 workflow 和 production 都可能返回**立即执行即失败**的命令。
2. MV Pack 的 Profile `skill:` 与 `pack.yaml skills:` 命名空间整体错位，导致 Skill manifest 和 gates 静默丢失。
3. `.opsv/pack-lock.yaml` 的 digest 只覆盖 `pack.yaml`，不能识别 Profile、Skill、脚本等实际行为变化。
4. MV Pack 自称用于证明 5 点契约的 fixture 不能通过当前 Core 校验，也不能 materialize；Pack 本地 checker 却给出全绿。
5. 当前新增的四个 MV Profile 没有导出、没有加入 Category allow-list，同时 Skill 直接硬编码具体模型，绕过 Capability → Project binding 设计。
6. Pack/Project YAML 缺少完整 schema 和跨文件 contract lint，以上错误因此可以无告警进入运行时。

因此，本评审建议把架构计划中的“Phase 0”扩大为 **Core Contract Stabilization + MV Pack Conformance**。只有当 `work check`、Pack lock 和 fixture 可以作为可信控制面后，才开始实现 `validate --inline`、Hook Adapter 和 AgentRouter。

---

## 2. Findings（按严重度排序）

### [Critical] F1 — Work Packet 对 workflow 硬编码 `materialize`，忽略 Skill manifest 的真实 action

**位置**

- `cli/src/core/WorkPacket.ts:61-69`
- `cli/src/core/WorkPacket.ts:91-94`
- `cli/src/core/Materializer.ts:53-56`
- `opsv-packs/opsv-mv-pipeline/skills/opsv-mv-music/skill.yaml:1-5`
- `opsv-packs/opsv-mv-pipeline/skills/opsv-mv-concept/skill.yaml:1-5`
- `opsv-packs/opsv-mv-pipeline/skills/opsv-mv-performance/skill.yaml:1-5`

**问题**

`WorkPacket.ts:92` 只要 Profile 是 `workflow`，就固定返回：

```text
action=materialize
opsv materialize <asset>
```

但 MV Pack 中：

- `music-map` 的 Skill action 是 `draft`；
- `concept-map` 的 Skill action 是 `draft`；
- `performance-plan` 的 Skill action 是 `draft`；
- 这些 Profile 均未声明 `materialize`。

运行时复现：

```text
opsv work check music --json
→ action: materialize
→ command: opsv materialize music

opsv materialize music --dry-run
→ Profile "music-map" does not declare materialize rules
→ exit 1
```

**影响**

Work Packet 的核心承诺是返回“一个允许且可执行的下一步”。当前实现会把错误命令交给 Agent；若接入 Hook/Dispatcher，该错误会被自动化和规模化，而不是被修复。

**建议**

1. 将 Skill manifest 纳入正式类型和 schema。
2. Work Packet 从已解析的 Skill manifest 读取 `action`，不能从 `profile.kind` 猜 action。
3. 只有 `profile.materialize` 存在且 Skill action 为 `materialize` 时才生成 materialize 命令。
4. `draft` action 应返回明确的 authoring 指令/Skill，而不是伪造 CLI 命令。
5. 添加 workflow `draft`、workflow `materialize`、production `circle`、production `compile` 四类契约测试。

---

### [Critical] F2 — Production Work Packet 返回的命令缺少 Circle manifest 和 asset selector，从项目根执行会失败

**位置**

- `cli/src/core/WorkPacket.ts:88-94`
- `cli/src/commands/produce.ts:35-45`
- `cli/src/commands/produce.ts:48-52`
- `cli/src/core/ManifestReader.ts:110-136`

**问题**

当 production asset 已进入 Circle 时，Work Packet 返回：

```text
opsv produce --model <bound-model>
```

但 `produce` 从当前目录或父目录寻找 `_manifest.json`；它不会从 Work Packet 已发现的 `packet.circle.manifests` 自动选中 manifest。`produce` 明明支持 `--manifest` 和 `--file`，Work Packet 却没有使用。

运行时复现：

```text
opsv work check hero --json
→ circle.available: true
→ circle.manifests: [/tmp/.../opsv-queue/elements_circle1/_manifest.json]
→ command: opsv produce --model test.image

# 在同一个项目根执行返回命令
opsv produce --model test.image
→ No _manifest.json found. Run inside a circle directory or use --manifest <path>.
→ exit 1
```

即便 Agent 手工切换到 Circle，命令仍缺少 `--file hero`，可能编译 Circle 中所有 pending assets，不再是单一 Work Packet 的单一 action surface。

**影响**

- Agent 无法机械执行 `work check` 输出。
- 多资产 Circle 中可能扩大执行范围。
- Dispatcher 无法把 command 当作确定性、可审计的执行计划。

**建议**

生成完整命令：

```text
opsv produce --manifest <manifest> --file <asset>
```

模型应优先由 Profile capability binding 在 `produce` 内解析；Work Packet 不必把 provider/model 细节固化进命令。若同一 asset 出现在多个 Circle，必须产生 `CIRCLE_AMBIGUOUS`，不能默认选最新或任意一个。

---

### [Critical] F3 — MV Pack 的 Skill 标识整体不一致，所有 Profile-linked gates 静默丢失

**位置**

- `cli/src/core/WorkPacket.ts:61-69`
- `opsv-packs/opsv-mv-pipeline/pack.yaml:30-46`
- `opsv-packs/opsv-mv-pipeline/profiles/music-map.yaml:1-2`
- `opsv-packs/opsv-mv-pipeline/profiles/concept-map.yaml:1-2`
- `opsv-packs/opsv-mv-pipeline/profiles/shotlist.yaml:1-8`
- `opsv-packs/opsv-mv-pipeline/profiles/performance-plan.yaml:1-2`
- `opsv-packs/opsv-mv-pipeline/profiles/image-reference.yaml:1-4`
- `opsv-packs/opsv-mv-pipeline/profiles/clip-keyframe.yaml:1-4`
- `opsv-packs/opsv-mv-pipeline/profiles/mv-i2v.yaml:1-6`

**问题**

Core 使用 Profile 的 `skill:` 值作为 `pack.yaml skills:` 的 key 查找 Skill manifest。

MV Profile 使用：

```text
opsv-mv-music
opsv-mv-concept
opsv-mv-shotlist
opsv-mv-assets
...
```

而 `pack.yaml` 导出的 key 是：

```text
mv-music
mv-concept
mv-shotlist
mv-assets
...
```

所以查找全部 miss。Core 没有报错，只返回空 gates：

```json
{
  "primarySkill": {
    "name": "opsv-mv-music",
    "gates": []
  }
}
```

静态 contract 检查确认 7 个已导出 Profile 均引用了未导出的 Skill key。

此外，`skills/opsv-mv-shotlist/skill.yaml:3` 声明 `profile: mv-shotlist`，但运行时 Category 使用的是 `shotlist`；物理文件 `profiles/mv-shotlist.yaml` 又未被 `pack.yaml` 导出，形成三个身份：

- Category default：`shotlist`
- Skill manifest：`mv-shotlist`
- 未导出 Profile 文件：`profiles/mv-shotlist.yaml`

**影响**

`work-check`、`refs-valid`、`validate`、`circle` 等 gates 全部消失，且是 fail-open。架构计划如果基于 Work Packet 做 Hook 注入或 AgentRouter 路由，会误以为当前资产没有门禁。

**建议**

选定一个唯一标识体系，并在所有层一致使用。建议 `pack.yaml` key 直接使用 canonical Skill name（例如 `opsv-mv-music`），因为这也是 agent discovery 的名称。删除 `mv-shotlist` 重复 Profile，只保留 `shotlist`，同步 Skill manifest。

Core 必须在 Pack 加载/检查时验证：

- Profile `skill` 必须命中导出 Skill；
- Skill `profile` 必须命中导出 Profile；
- Skill `category` 必须命中导出 Category；
- Skill Profile 必须在 Category `profiles` allow-list 中；
- mismatch 应 fail closed，不能降级为空 gates。

---

### [Critical] F4 — Pack lock digest 只覆盖 `pack.yaml`，不能锁定实际 Pack 行为

**位置**

- `cli/src/core/ProjectConfig.ts:75-100`
- `cli/src/core/ProjectConfig.ts:104-116`
- `.trellis/spec/packs/authoring/pack-format.md:108-112`

**问题**

当前 digest 的输入只有 `pack.yaml` 原始内容：

```ts
const raw = fs.readFileSync(manifestPath);
digest = sha256(raw);
```

修改以下内容不会改变 lock digest：

- `categories/*.yaml`
- `profiles/*.yaml`
- `skills/*/skill.yaml`
- `skills/*/SKILL.md`
- Pack validation scripts、templates 和 references

实测在 `/tmp` 复制 MV Pack，只向 `profiles/music-map.yaml` 添加内容，修改前后 digest 完全相同。

**影响**

- `.opsv/pack-lock.yaml` 不能证明运行时使用了哪一版规则。
- Task provenance 和复现失真。
- Hook cache/AgentRouter fingerprint 即使实现正确，也可能在 Pack 规则变化后继续复用旧判断。
- 当前 MV Pack 存在大量已修改和未跟踪文件，但只要 `pack.yaml` 不变，lock 看不到差异。

**建议**

计算规范化 Pack tree digest，而不是 manifest-only digest。至少覆盖所有导出文件及其递归依赖；若 Skill 文档和 validation scripts 会改变 Agent 行为，也应进入摘要。建议：

1. 规范化相对路径排序；
2. 逐文件 hash 后再计算 Merkle/tree hash；
3. 排除 `.git`、测试输出、缓存和临时文件；
4. lock 同时记录 `manifest_digest` 与 `content_digest`；
5. Task 记录 `content_digest`；
6. 添加“任一有效 Pack 文件变化都会改变 digest”的测试。

---

### [High] F5 — MV reference fixture 不能证明当前 OPSV 0.17 Pack contract，本地 checker 产生假绿

**位置**

- `opsv-packs/opsv-mv-pipeline/test/fixtures/half-life-v1/videospec/music.md:12-15`
- `opsv-packs/opsv-mv-pipeline/test/fixtures/half-life-v1/videospec/shotlist.md:1-23`
- `opsv-packs/opsv-mv-pipeline/scripts/mv-check.js:184-288`
- `cli/src/core/Materializer.ts:16-40`
- `.trellis/spec/packs/authoring/pack-format.md:114-124`

**问题**

fixture 文档声明用于验证 Pack 的 5 条 contract，但实际缺少：

- `.opsv/project.yaml` 和 Pack Stack fixture；
- `.opsv/pack-lock.yaml`；
- Circle manifest；
- approved/unapproved variant 的正反例；
- 可被 Materializer 读取的 frontmatter `plan:` 数组；
- 引用的图片文件。

`shotlist.md` 只有 Markdown 表格，没有 `plan:`。因此：

```text
opsv materialize shotlist --dry-run
→ Workflow document requires a plan array
→ exit 1
```

把 fixture 放入真实临时 OPSV 项目后，Core strict validate 结果为：

```text
Validated: 1/3 files
2 dead references
3 missing image files
2 frontmatter validation errors
exit 1
```

其中元素文件使用 `Protagonist` / `Scene-Courtyard` 身份，但 refs 使用小写 `@character-protagonist` / `@scene-courtyard`，无法命中当前精确索引；两个 ref value 还是空数组，直接违反 Frontmatter schema。

与此同时：

```text
node scripts/mv-check.js all
→ 4 OK, 0 WARN, 0 ERROR
→ exit 0
```

原因是 `mv-check.js` 只检查 music/shotlist Markdown 表格中的时间轴和卡点算术，不执行 Core schema、Pack resolution、refs、gates、Circle 或 materialization。

**影响**

Pack 发布者会在主契约已失败的情况下得到绿色结果。Hook 架构若把 Pack-local checker 当 gate，会产生错误安全感。

**建议**

建立真正的 e2e fixture runner：

```text
opsv pack check
opsv pack lock
opsv work check <fixture-assets> --json
opsv validate --dir videospec --max-depth -1 --strict
opsv materialize shotlist --dry-run
opsv circle create ...
node scripts/mv-check.js all
```

`mv-check.js` 保留为算术补充检查，但不得作为 Core contract 的替代品。

---

### [High] F6 — 当前新增 MV Profiles 不可解析，并且 Skill 硬编码 provider/model，Capability 抽象已失效

**位置**

- `opsv-packs/opsv-mv-pipeline/pack.yaml:30-37`
- `opsv-packs/opsv-mv-pipeline/categories/character.yaml:1-2`
- `opsv-packs/opsv-mv-pipeline/categories/scene.yaml:1-2`
- `opsv-packs/opsv-mv-pipeline/profiles/character-multiview.yaml:1-8`
- `opsv-packs/opsv-mv-pipeline/profiles/character-tworef.yaml:1-8`
- `opsv-packs/opsv-mv-pipeline/profiles/scene-character-2refs.yaml:1-8`
- `opsv-packs/opsv-mv-pipeline/profiles/scene-character-3refs.yaml:1-8`
- `opsv-packs/opsv-mv-pipeline/skills/opsv-mv-assets/SKILL.md:348-371`
- `opsv-packs/opsv-mv-pipeline/skills/opsv-mv-keyframe/SKILL.md:250-289`
- `.trellis/spec/packs/authoring/asset-documents.md:61-66`

**问题**

四个 WIP Profile 文件存在于磁盘，但：

1. 未出现在 `pack.yaml profiles:`；
2. 未加入 `character` 或 `scene` Category 的 `profiles` allow-list；
3. 因此 Core 无法通过 Asset Document 的 `profile:` 解析它们；
4. 对应 Skill 又指导 Agent 直接执行 `opsv produce --model rh-workflow-v2...`。

Skill 文档一边说明应通过 `bindings.image-generation`，另一边又为不同工作流硬编码具体 model key，内部自相矛盾。

根因是这些生产能力并非真正等价：角色多角度、双参考一致性、场景角色合成是不同输入契约，却全部复用粗粒度 `image-generation` capability。一个 binding 无法同时选择多个具体 workflow，于是文档退回到手工 `--model`。

**影响**

- 新功能按文档操作会在 Profile resolution 阶段失败，或绕过 Profile binding 直接跑 provider。
- Project 不能集中替换模型/provider。
- Work Packet 和未来 AgentRouter 无法从 Profile 得到可靠能力需求。

**建议**

不要用硬编码 model 修补过粗 capability。为输入契约定义稳定能力，例如：

```text
character-multiview-generation
two-reference-character-consistency
scene-character-compositing
multi-character-scene-compositing
```

Pack Profile 只声明 capability；Project `bindings:` 决定对应模型。随后导出 Profiles、更新 Category allow-list、补 required ref categories/input contract，并删除 Skill 中具体 `rh-workflow-v2.*` 命令。

---

### [High] F7 — Project policy 可以覆盖并放宽 Pack policy，违反 tightening-only 规则

**位置**

- `cli/src/core/WorkPacket.ts:59`
- `cli/src/core/ProjectConfig.ts:14-20`
- `.trellis/spec/packs/authoring/pack-format.md:44`

**问题**

当前实现直接按顺序覆盖：

```ts
Object.assign(defaults, pack.policy, config.policy)
```

因此 Pack 声明 `sync: human` 时，Project 可声明 `sync: auto` 并成功放宽。实测 Work Packet 最终返回 `sync: auto`。只有 `delete: never` 被单独硬编码保护。

**影响**

Hook/Dispatcher 根据 Work Packet policy 自动执行时，会突破 Pack 作者设定的人类确认边界。

**建议**

为 policy 定义偏序/严格度：

```text
auto < ask < human
never 为不可覆盖顶层约束
```

合并时取更严格值；Project 试图放宽时应报配置错误，而不是静默纠正。为每个 action 添加组合矩阵测试。

---

### [High] F8 — Pack 配置没有完整 schema 与跨文件校验，错误直到运行时才暴露

**位置**

- `cli/src/core/ProjectConfig.ts:61-72`
- `cli/src/core/ProjectConfig.ts:75-100`
- `cli/src/core/PackContracts.ts:54-58`
- `cli/src/core/PackContracts.ts:76-97`

**问题**

Project/Pack YAML 主要通过 TypeScript cast 进入运行时，仅检查少量字段：Pack id、version、Profile kind 和 production binding。以下内容没有在 Pack 加载或发布前系统校验：

- policy 枚举；
- export path 是否存在、是否位于 Pack root；
- Category/Profile/Skill 的互相引用；
- Skill action/gates/completion schema；
- workflow/production 字段组合；
- production outputs；
- 未导出的孤儿 contract 文件；
- SKILL.md canonical name 与 export key 的一致性。

当前 MV Pack 的 7 个 Profile→Skill mismatch、shotlist Profile mismatch 和 5 个未导出 Profile 就是直接证据。

**影响**

Core 在最需要 fail closed 的 Pack 控制面上处于 fail late/fail open 状态。Hook 只能放大输入质量，不能替代 Pack compiler/linter。

**建议**

新增 `opsv pack check [path] --json`，使用 Zod 或同等级 schema，输出稳定 issue code，并作为：

- Pack 发布前 gate；
- `opsv pack lock` 前置 gate；
- CI gate；
- Hook/AgentRouter 加载 Pack 时的 fail-closed gate。

---

### [Medium] F9 — Pack 有两套并行发现/安装入口，canonical export surface 不唯一

**位置**

- `opsv-packs/opsv-mv-pipeline/pack.yaml:13-46`
- `opsv-packs/opsv-mv-pipeline/manifest.json:14-19`
- `opsv-packs/opsv-mv-pipeline/README.md:33-45`
- `.trellis/spec/packs/authoring/pack-format.md:19-22`
- `.trellis/spec/packs/authoring/pack-format.md:101-106`

**问题**

当前规范规定 `pack.yaml` 是唯一 export index，并通过 `opsv pack sync-skills` 创建 discovery shims。但 MV Pack：

- `manifest.json` 仍声明 root `opsv-mv-pipeline` 为 entry skill；
- README 仍指导把整个 Pack `cp -r` 到 `.agents/skills`；
- root `SKILL.md` 承担另一套 S0 导航器；
- canonical `pack.yaml` 不导出该 navigator。

这会让不同平台加载到不同 Skill 集合和不同版本规则，也绕过 Pack lock 的发现路径。

**建议**

明确过渡方案：

- 要么把 navigator 作为合法的 exported review/router Skill 纳入 `pack.yaml`；
- 要么将 root legacy surface 标记 deprecated，并只保留 `sync-skills` 安装方式；
- README 不再指导复制整包；
- `manifest.json` 如果保留，仅作兼容元数据，不得定义另一套运行时 truth。

---

### [Medium] F10 — Pack Skill shim 遇到 broken symlink 会稳定失败

**位置**

- `cli/src/core/ProjectConfig.ts:120-138`

**问题**

`fs.existsSync(target)` 对 broken symlink 返回 false；当前代码随后检查的是 target 父目录是否为 symlink，而不是 target 本身。因此不会删除 broken link，最终 `fs.symlinkSync` 报 `EEXIST`。

实测：

```text
EEXIST: file already exists, symlink ... -> .agents/skills/demo--make
```

**影响**

Pack 更新、移动或清理后，`opsv pack sync-skills` 无法自愈。Hook/Agent 初始化阶段可能因此中断。

**建议**

用 `lstatSync(target)`/`lexists` 语义检测目录项；若是 symlink，读取链接目标并进行 canonical path 比较。为 valid、stale、broken、non-symlink collision 四种情况写测试。

---

### [Medium] F11 — Pack export path 未做 root containment，Pack manifest 可读取或链接 root 外路径

**位置**

- `cli/src/core/ProjectConfig.ts:78-84`
- `cli/src/core/ProjectConfig.ts:125-134`
- `cli/src/core/PackContracts.ts:76-88`

**问题**

Category/Profile/Skill export path 通过 `path.join(pack.root, relative)` 解析，没有 `realpath` 后的 Pack root containment 检查。`../`、绝对路径或 Pack 内 symlink 可把 contract 解析和 Skill shim 指向 Pack 外部。

**影响**

对本地可信私有 Pack 风险较低，但一旦支持第三方 Pack、自动安装或 registry，这会成为任意本地文件读取/意外 Skill 暴露边界问题。

**建议**

复用 `resolveWithin` 风格的路径安全函数，并在解析 symlink 后验证 real path 仍在 Pack root。`pack check` 应拒绝逃逸 export。

---

### [Medium] F12 — 当前质量门禁不能作为架构改造的稳定基线

**位置**

- `cli/package.json:14-21`
- `cli/package.json:57-70`

**验证结果**

- `npm run build`：通过。
- `npm run lint`：失败，`eslint: not found`；`package.json` 定义了 lint script，但没有 ESLint devDependency/config 的可用闭环。
- Jest 在当前受限沙箱中：ReviewServer 测试因监听 `0.0.0.0` 被 `EPERM` 阻断；排除该文件后为 38/39 suites、306/307 tests 通过，`SyncService` 因沙箱禁止 `spawnSync git` 失败。
- 即使测试主体完成，Jest 仍提示 open handles 且不自动退出，需要手工终止。
- MV Director 两个脚本和 `mv-check.js` 的 `node --check` 通过；`director-timeline-check.test.js` 通过。

**说明**

沙箱相关的 `EPERM` 不能直接认定为产品缺陷，但 lint 缺失和 Jest open handles 是真实的工程门禁问题。Hook/多 Agent 改造会显著增加并发、进程和文件系统边界，应先让基础 CI 可重复退出并给出可信结果。

---

## 3. 对 Agent Hook / Dispatcher 计划的直接影响

### 3.1 当前不能把 Work Packet 当 Router 的可信输入

计划的 `opsv agent plan <asset>` 和 AgentRouter 建立在 Work Packet 上。如果现在实施：

- workflow 会被路由到不存在的 materialize action；
- production 会拿到无法从项目根执行的 command；
- Skill gates 为空；
- Project 可放宽 Pack policy；
- Pack 规则变化可能不改变 lock/fingerprint。

Router 再确定性，也只是在确定性地传播错误输入。

### 3.2 Hook cache 必须把 Pack content digest 纳入 key

仅使用文件 mtime/size 或 Work Packet JSON 不足以处理 Pack 规则变更。建议 Hook validation cache key 至少包含：

```text
asset realpath
asset content hash
project config digest
category validation config digest
resolved Pack content digests
validator version
platform adapter schema version
```

### 3.3 “invalid” 必须 fail closed，但前提是 validator/Pack contract 本身可信

计划已正确区分 policy rejection 与 infrastructure failure。但当前 Pack gates 会静默丢失，fixture 也不能证明 validator 输入正确。因此实施顺序应是：

```text
Pack compiler/checker
→ Work Packet command/action 修复
→ content lock
→ e2e fixture
→ validate --inline
→ platform Hook adapters
→ AgentRouter/Dispatcher
```

而不是先做 Hook，再用 Hook 弥补 Core contract。

---

## 4. 建议改进计划

### Phase 0A — Core Contract Stabilization（P0，先于原计划 Phase 0）

#### 0A-1. 建立机器可验证的 Pack schema

新增：

```text
opsv pack check [pack-path] --json
```

验收：

- MV Pack 当前 mismatch 全部能在一次检查中报告；
- issue code 稳定；
- `pack lock` 默认拒绝锁定 invalid Pack；
- path escape、missing export、orphan profile、invalid action/policy 均有测试。

#### 0A-2. 修正 Work Packet action/command builder

不要在 `buildWorkPacket` 中拼接分支字符串，抽出 typed action builder：

```ts
type NextAction =
  | { kind: 'draft'; skill: CanonicalSkill }
  | { kind: 'materialize'; asset: string }
  | { kind: 'circle'; sourceDir: string }
  | { kind: 'compile'; manifest: string; asset: string }
  | { kind: 'sync'; asset: string };
```

由 CLI renderer 生成 shell command，由 Hook/AgentRouter 消费结构化 action。这样避免 command string 成为架构 API。

#### 0A-3. 实现 Pack content digest

- canonical tree hash；
- lock 记录 content digest；
- Work Packet 暴露 pack digest；
- AgentRouter fingerprint 和 validation cache 引用同一 digest。

#### 0A-4. 实现 policy tightening lattice

- `auto < ask < human`；
- Pack/Project 合并取更严格；
- 任何放宽尝试报错；
- `delete: never` 保持 Core invariant。

#### 0A-5. 修正 shim 与 export path 安全

- broken symlink 自愈；
- realpath containment；
- collision 明确报错；
- 为 `.agents`、`.codex` 以及未来平台 Adapter 共用同一安全实现。

---

### Phase 0B — MV Pack Conformance（P0，可与 0A 并行但验收需联合）

#### 0B-1. 统一 canonical Skill/Profile identity

建议直接统一为：

```text
skills key: opsv-mv-music / opsv-mv-concept / ...
profile skill: 同上
skill manifest profile: pack.yaml 中真实导出的 profile key
```

删除未导出的重复 `profiles/mv-shotlist.yaml`。

#### 0B-2. 正式设计并导出新增生产 Profiles

- 为四个 WIP Profile 建立独立 capability；
- 加入 `pack.yaml profiles:`；
- 加入对应 Category allow-list；
- 定义 required refs/input slots；
- Project fixture 提供 bindings；
- Skill 中删除具体 provider/model 命令。

#### 0B-3. 重建 half-life e2e fixture

fixture 至少应包含：

- 自包含 `.opsv/project.yaml`；
- Pack source 可由 test runner 注入；
- category validation config；
- 正确大小写和非空 refs；
- 实际占位图片或显式 fixture artifact；
- shotlist frontmatter `plan:`；
- approved/unapproved variant 双向案例；
- Circle manifest/生成步骤；
- expected Work Packet JSON snapshots。

#### 0B-4. 将 `mv-check.js` 定位为补充 gate

统一入口建议：

```text
npm test / node --test
  └─ pack contract e2e
      ├─ Core validate
      ├─ Work Packet
      ├─ materialize
      ├─ Circle
      └─ mv-check arithmetic
```

任一层失败，整体失败。

#### 0B-5. 清理 legacy discovery surface

- README 改为 `pack lock` + `pack sync-skills`；
- 明确 root navigator 的 canonical 身份；
- `manifest.json` 不再定义第二套运行时导出。

---

### Phase 1 — 恢复原架构计划的 Hook MVP

只有 0A/0B 验收通过后，继续：

1. `validate --inline` 共享 Validation Core；
2. Claude/Codex/Kimi 各自协议 Adapter；
3. `invalid` 始终阻断，`infrastructure_error` 才受 fail-open policy 控制；
4. Adapter 输入解析 proposed content，而不是只读磁盘旧文件；
5. cache key 包含 Pack content digest；
6. `agent plan` 消费结构化 `NextAction`，不解析 shell command；
7. 真机协议 fixture 锁定各平台 schema。

---

## 5. 推荐验收清单

进入 Hook 实施前，以下条件应全部满足：

- [ ] `opsv pack check opsv-packs/opsv-mv-pipeline` 为 0 error。
- [ ] 所有 Profile `skill` 都能解析到 manifest，Work Packet gates 非空且正确。
- [ ] `opsv work check music` 不再返回不可执行的 materialize 命令。
- [ ] `opsv work check <production-asset>` 返回带 manifest + file 的确定性 action，能从项目根执行。
- [ ] 修改任一有效 Profile/Skill/script 后 Pack content digest 必须变化。
- [ ] Project 不能把 `human`/`ask` 放宽为 `auto`。
- [ ] half-life fixture 可通过 Core strict validate。
- [ ] half-life shotlist 可 dry-run materialize，并只创建缺失文档。
- [ ] fixture 能证明 unapproved ref block、approved variant unblock、Circle producer-before-consumer。
- [ ] `mv-check.js` 与 Core gate 统一纳入一个失败即红的 test runner。
- [ ] `npm run lint` 可执行并通过。
- [ ] Jest 在标准 CI 环境中全绿且自动退出，无 open handles。
- [ ] Director 脚本测试继续通过。

---

## 6. 正向评价

1. **Pack/Profile/Capability/Project binding 的分层方向正确。** 当前问题主要是缺少机器校验和 MV Pack 没有完全服从该分层，而不是抽象本身不可用。
2. **Materializer 的“只创建缺失文档、不覆盖已有文档”边界清晰。** `Materializer.ts:60-76` 已有良好的幂等基础。
3. **Work Packet 已聚合 refs、Circle、policy、Profile 和 Skill。** 修正 action builder 和 contract validation 后，可以成为 Hook/Router 的合理控制面。
4. **MV Director 脚本已有前置校验、上传去重和 submit-ready 测试。** 本次 syntax check 与现有 Node test 均通过，适合保留为 Pack 专属补充校验。
5. **架构计划 v2 已认识到多平台 Adapter、fail-open 边界、path canonicalization 和平台协议差异。** 现在需要把同样的严谨性向下延伸到 Pack/Core 基础契约。

---

## 7. 本次验证记录

### 主仓库

```text
npm run build
→ PASS

npm run lint
→ FAIL: eslint: not found

npx jest --runInBand --testPathIgnorePatterns=ReviewServer.test.ts
→ 38 passed suites / 1 sandbox-blocked suite
→ 306 passed tests / 1 sandbox-blocked test
→ Jest reports open handles and does not exit automatically
```

完整 ReviewServer 测试在当前 sandbox 中因 `listen EPERM 0.0.0.0` 失败；`SyncService` 因 `spawnSync git EPERM` 失败。这两个 EPERM 结果应在非沙箱 CI 中复核。

### MV Pack

```text
node --check scripts/director-timeline-check.js
node --check scripts/director-prepare-task.js
node --check scripts/mv-check.js
→ PASS

node --test test/director-timeline-check.test.js
→ PASS

node scripts/mv-check.js all
→ 4 OK, 0 WARN, 0 ERROR

opsv validate --dir videospec --max-depth -1 --strict
→ FAIL: dead refs, missing images, frontmatter errors

opsv materialize shotlist --dry-run
→ FAIL: Workflow document requires a plan array
```

### 评审边界

- 评审基于 2026-08-05 可见的两个 working tree，不只评审已提交内容。
- `opsv-packs` 中现有 modified/untracked WIP 被纳入评估，但本次未修改外部仓库。
- 本次仅新增本评审文档，没有修改被评审代码。

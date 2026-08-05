# OPSV Agent Hook & Dispatcher Architecture Plan 评审意见

- **评审日期**：2026-08-04
- **评审对象**：`/home/uncle7/.hermes/plans/2026-08-04_153000-opsv-agent-hook-architecture.md`
- **评审范围**：OPSV CLI、Pack/Pack Stack、Work Packet、Agent Hook、配置安装、Dispatcher 路由与实施顺序
- **评审结论**：**Concept Approved / Implementation Replan Required**

## 1. 执行摘要

该计划的战略方向与 OPSV 架构原则一致：

1. 把影响正确性的规则放在 OPSV CLI/Core，而不是依赖 Skill 或提示词自觉执行。
2. 通过 Agent Hook 把规则检查提升为运行时约束。
3. Hermes 保持编排层角色，不复制 OPSV 正确性逻辑。
4. 先跑通单平台，再逐步扩展 Codex、Claude Code、Kimi 和可选 OpenClaw。

但当前 v2 计划尚不具备直接实施条件。核心阻断机制在 `PreToolUse` 阶段只验证磁盘上的旧文件，没有验证 Agent 即将写入的 proposed content；共享 Shell Handler 会丢失 validator 退出码；规则不通过与 Hook 基础设施故障被错误地混为 fail-open；部分平台配置和协议与当前官方实现不一致；AgentRouter 示例也与当前 Work Packet、PackManifest 类型契约冲突。

因此建议：

> 保留“Validation Core + Platform Adapter + Dispatcher”方向，退回并重写任务拆分、接口契约和 Phase 顺序，在完成一个真实的 proposed-content 阻断垂直切片后，再开发路由与多平台能力。

## 2. 当前项目基线

评审期间未修改项目代码，仅运行了 CLI 基线验证：

- `npm run build`：通过。
- Jest：40/40 test suites、315/315 tests 通过。
- Jest 在报告通过后未自行退出，提示存在未关闭的异步句柄，最终由评审者中断。断言基线为绿色，但测试生命周期仍需清理。

当前工作区已有的未提交内容未被改动。

## 3. 阻断实施的问题（P0）

### P0-1：PreToolUse 验证了旧状态，而不是 proposed content

计划的主要链路是：

```text
PreToolUse
  → 取得文件路径
  → opsv validate --inline <file>
  → 根据退出码决定是否阻断
```

相关位置：计划 `:132-134`、`:483`、`:500`、`:535-537`。

该机制无法实现真正的写前校验：

- 创建文件时，目标文件可能尚不存在。
- 编辑文件时，磁盘上仍然是旧内容。
- Claude Code 的 Write/Edit proposed content 位于 Hook stdin JSON 中。
- Codex 常通过 `apply_patch` 写入，Hook 收到的是 patch command，不是通用的文件路径和完整新内容。
- 计划依赖的 `$TOOL_INPUT_FILE_PATH` 不是这些平台统一提供的协议字段。

因此，即使 `opsv validate --inline <file>` 本身实现正确，Hook 也很可能验证旧内容后放行非法的新内容。

#### 建议

Validation Core 应提供虚拟内容接口：

```ts
interface ValidationProposal {
  projectRoot: string;
  sourcePath: string;
  proposedContent: string;
  operation: 'create' | 'update' | 'delete';
}

validateProposal(proposal: ValidationProposal): ValidationResult;
```

平台 Adapter 负责把各平台 stdin payload 转换为 `ValidationProposal`：

- Claude Write：直接使用 `file_path` 和 `content`。
- Claude Edit：在当前内容上应用 `old_string → new_string`。
- Codex `apply_patch`：在内存工作区快照上应用 patch。
- 无法可靠还原 proposed content 的平台：只能做 PostToolUse 检测，不得宣称支持事前阻断。

### P0-2：共享 Shell Handler 会吞掉 validator 失败码

计划 `:535-537`：

```bash
RESULT=$(opsv validate --inline "$FILE" 2>&1) || RESULT="$RESULT"
EXIT=$?
```

当 validator 非零退出时，`EXIT=$?` 取得的通常是后续变量赋值的成功状态，而不是 `opsv validate` 的失败状态。实际效果可能是 validator 已失败，但 Handler 仍返回成功。

计划还使用：

```bash
set -u
FILE="$1"
if [ -z "$FILE" ]; then exit 0; fi
```

如果第一个参数不存在，脚本会在 `FILE="$1"` 处直接因未绑定参数退出，无法进入预期的 fail-open 分支。

#### 建议

不要继续发展依赖位置参数的五平台共享 Shell Handler。共享边界应当是 Validation Core；每个平台使用独立、薄且可测试的协议 Adapter，并从 stdin 读取原始 Hook payload。

### P0-3：规则不通过与基础设施故障被错误地合并为 fail-open

计划 `:687-702`、`:547-557` 在默认配置下允许以下流程：

```text
validator 正常运行
→ 发现 Asset Document 不符合规则
→ 输出 WARN
→ exit 0
→ Agent 继续写入
```

这与“Hook 强制执行 Pack 规则”的目标矛盾。

必须区分：

1. **Policy rejection**：validator 正常运行并发现内容不合法。
2. **Infrastructure failure**：CLI 不存在、Hook payload 无法解析、超时、内部崩溃或系统 I/O 故障。

建议使用三态结果：

```ts
type ValidationResult =
  | { outcome: 'valid'; issues: [] }
  | { outcome: 'invalid'; issues: ValidationIssue[] }
  | {
      outcome: 'infrastructure_error';
      error: { code: string; message: string };
    };
```

执行策略：

| 结果 | 行为 |
|---|---|
| `valid` | 放行 |
| `invalid` | 始终阻断 |
| `infrastructure_error` | 根据 Project/User Policy 决定 fail-open 或 fail-closed |

Pack 规则失败不是基础设施失败，不能 fail-open。

### P0-4：平台协议不能由一个通用模板和 Shell 参数统一

#### Codex

截至 2026-08-04，项目级 `.codex/hooks.json` 是官方支持的位置，因此计划的文件路径本身可以保留。但以下假设不成立：

- Hook 输入通过 stdin JSON 传入。
- `apply_patch` 输入是 patch command，不是通用文件路径。
- 不存在统一的 `$TOOL_INPUT_FILE_PATH`。
- 自定义 `schemaVersion: "codex-hooks-v1"` 不能锁定已安装 Codex 的真实 Hook 协议。

参考：<https://developers.openai.com/codex/hooks>

#### Claude Code

`.claude/settings.json` 路径正确，但：

- Hook 输入同样来自 stdin JSON。
- Write 和 Edit 拥有不同的 tool input 结构。
- 计划中的 `$TOOL_INPUT_FILE_PATH` 假设不成立。
- 退出码 2 可以阻断 PreToolUse，但不等价于“自动重试并自动修复”。

参考：<https://docs.anthropic.com/en/docs/claude-code/hooks>

#### Kimi

截至 2026-08-04，Kimi 官方 Hook 文档描述的是：

- `.kimi-code/config.toml`
- `[hooks]` 配置
- `before_tool_call` 等事件
- stdin/stdout JSON
- 通过 `{"permission":"deny","reason":"..."}` 拒绝工具调用

这与计划中的 `.kimi/hooks.yaml`、`PreToolUse`、`matcher` 和通用 exit-code Handler 不一致。

参考：<https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html>

#### 结论

正确的复用边界应是：

```text
共享 Validation Core
  + Claude Adapter
  + Codex Adapter
  + Kimi Adapter
  + 可选 OpenClaw Adapter
```

而不是“五个平台共用一个 Shell 脚本”。

### P0-5：AgentRouter 与当前代码契约冲突

计划 `:396-458` 的示例不能按预期编译或路由。

#### Profile 字段不匹配

计划使用：

```ts
this.packet.profile?.id
```

当前 `cli/src/core/WorkPacket.ts:12-20` 定义为：

```ts
profile?: {
  name: string;
  kind: string;
  capability?: string;
  model?: string;
};
```

#### Issue code 不匹配

计划使用：

```ts
i.code.startsWith('schema.')
```

当前 Work Packet 使用大写 issue code，例如：

- `CATEGORY_MISSING`
- `REF_MISSING`
- `REF_SYNCING`
- `REF_AMBIGUOUS`
- `REF_UNAVAILABLE`
- `PROFILE_REF_REQUIRED`
- `SYNC_REQUIRED`

因此 `hasSchemaIssue` 不会按计划命中。

#### Pack manifest 没有传入 Router

计划命令创建：

```ts
const router = new AgentRouter(packet);
```

而 Pack 约束通过构造函数第二个参数提供，所以 `primary/fallback/forbidden` 实际始终不可用。

#### 约束实现不完整

即使传入 PackManifest：

- `fallback` 没有使用。
- `forbidden` 只检查了 `primary`。
- heuristic 的结果没有再经过 forbidden 检查。
- 没有检查平台是否安装、是否健康。
- 没有检查 required hooks/capabilities。
- 默认 Kimi 与“Kimi 未验证前不可承担 hard-block”的前置条件冲突。
- `fingerprint()` 只产生 hash，并不会自动带来缓存、任务复用或 token 成本下降。

建议把 Router 推迟到 Hook 强制执行垂直切片完成之后。

## 4. 高优先级架构问题（P1）

### P1-1：`opsv init --agent` 与现有 init 语义冲突

当前 `cli/src/commands/init.ts:17-43` 将 `opsv init` 定义为新项目脚手架，并在发现已有 `videospec/` 后拒绝执行。

Hook 安装是对已有项目配置的幂等修改，不应继续扩展 `init` 的职责。建议增加独立命令：

```bash
opsv hooks install --platform claude
opsv hooks uninstall --platform claude
opsv hooks doctor
opsv hooks print --platform claude
```

该接口比把 Hook 生命周期塞进 `init` 更深、更小，也能保持 scaffold 与 configuration management 的职责边界。

### P1-2：Hook 配置必须合并，不能覆盖

项目现有 `.claude/settings.json` 已包含 Trellis Hook：

- `SessionStart`
- `PreToolUse: Task`
- `PreToolUse: Agent`
- `UserPromptSubmit`

计划没有定义：

- JSON/TOML 结构化合并；
- OPSV Hook 去重；
- 所有权标记；
- 更新已有 OPSV Hook；
- uninstall 时保留 Trellis/用户 Hook；
- 写入失败后的回滚。

安全的安装器必须：

1. 保留所有无关键和 Hook。
2. 追加或更新 OPSV 管理的条目。
3. 支持 dry-run。
4. 原子写入。
5. 支持备份、卸载和回滚。
6. 测试安装到已有配置文件的场景。

“检测到配置文件就认为 multi-hook conflict”不是正确方案；单个平台配置文件包含多个不同职责的 Hook 是正常情况。

### P1-3：单一 Write Hook 无法执行所有 OPSV 正确性规则

`.trellis/spec/architecture.md:9-16, 60-76` 规定：影响正确性的规则由 CLI，而不是 prose 执行。计划方向正确，但一个 Write PreToolUse 无法覆盖：

- 跨文档引用有效性；
- Asset ID 唯一性；
- Circle/manifest 一致性；
- Approved Reference 状态；
- append-only history；
- 禁止删除；
- Bash、Python、`sed`、shell 重定向等旁路修改；
- Action Policy。

建议在实现前建立 enforcement matrix：

| 规则类别 | 推荐执行点 |
|---|---|
| proposed frontmatter/schema | PreToolUse proposal validation |
| proposed content + 当前项目引用 | PreToolUse virtual snapshot validation |
| 写后项目一致性 | PostToolUse |
| 删除与 patch policy | PreToolUse patch/command adapter |
| 全项目一致性 | pre-commit / dispatcher final check |
| Action Policy | 命令执行前 policy adapter |

### P1-4：配置所有权和 Pack Stack 合并语义不明确

计划同时提出：

- 在 `pack.yaml` 增加 `validation.fail-closed`；
- Handler 执行 `opsv config get validation.fail-closed`；
- 注释声称从 `.opsv/pack.yaml` 读取。

当前实际结构是：

- 项目配置位于 `.opsv/project.yaml`；
- 一个项目可启用多个 Pack；
- 每个 Pack 有自己的 `pack.yaml`；
- 当前没有 `opsv config get`；
- `PackManifest` 没有 `agents` 或 `validation` 字段。

见 `cli/src/core/ProjectConfig.ts:30-49, 61-90`。

建议：

1. 基础设施失败策略属于 Project/User Policy，不由单个 Pack 决定。
2. Pack 声明的是 required validation capabilities。
3. 多个 Pack 的约束必须有确定性的合并或 tightening 规则。
4. ProjectConfig 和 PackManifest 增加运行时 schema validation，不能只依赖 TypeScript interface。

### P1-5：Multi-hook 检测没有解决真正的并发风险

Codex 和 Claude Code 分别读取自己的配置。安装两个平台的 Hook，不意味着运行 Codex 时 Claude Hook 也会被触发。

真正风险是多个 Agent 同时修改同一个 Asset Document。需要单独定义：

- lock scope；
- owner/session ID；
- timeout；
- stale lock recovery；
- 原始内容 hash 或 optimistic version；
- 冲突处理方式；
- 原子保存或提交策略。

因此并发设计不应简化成 `detectExistingHooks()` 或 `init.multi-hook.test.ts`。

### P1-6：缓存设计过早且不安全

`mtime + size` 不能可靠表示内容身份：

- 内容可能改变但尺寸不变。
- 文件系统 mtime 精度可能不足或被保留。
- PreToolUse proposed content 尚未落盘。
- Pack、project config、category rules 变化也应使缓存失效。
- 每次 CLI 作为新进程启动时，所谓 LRU 需要额外的跨进程存储设计。

建议 Phase 1 不做缓存，先建立基准。若真实性能无法达到目标，再采用：

```text
cache key =
  proposedContentHash
  + canonicalSourcePath
  + effectivePackLockDigest
  + projectConfigDigest
  + validatorVersion
```

计划 `:231-249` 的性能测试本身也没有正确测量第二次调用：`t2` 在第二次调用之前已经记录。

### P1-7：命令级测试示例较脆弱

计划通过：

```ts
execSync(`node dist/cli.js validate --inline ${doc}`)
```

测试 CLI，存在以下问题：

- 文件路径没有进行参数转义。
- 依赖事先构建且保持最新的 `dist`。
- 临时项目示例未创建 `.opsv/project.yaml` 和有效 Pack 配置。
- 缓存测试跨 CLI 进程，却没有明确持久化缓存设计。
- 路由测试只检查结果属于三个字符串之一，没有验证具体路由规则。

建议：

1. 大部分测试直接针对 Validation Core 和 Adapter 接口。
2. 只保留少量 process-level contract tests。
3. process test 使用 `spawnSync(process.execPath, [cliPath, ...args])`，避免 shell 插值。
4. E2E fixture 必须包含最小合法 OPSV 项目和 Pack Stack。

## 5. 值得保留的设计方向

以下内容建议保留：

1. **正确性集中在 OPSV Core**：符合当前项目架构原则。
2. **平台 Hook 作为 Adapter**：平台层不应复制 Pack 规则。
3. **Hermes 仅作为编排层**：可以选择 Agent、准备上下文和最终复核，但不能成为唯一正确性防线。
4. **先单平台、后多平台**：是合理的风险控制方式。
5. **OpenClaw 保持可选**：主链路稳定前不进入默认强依赖。
6. **机器可读 Work Packet / execution plan**：有长期价值，但应排在 Validation Core 和 Hook Adapter 之后。

## 6. 推荐架构

```text
┌──────────────────────────────────────────────┐
│ OPSV Validation / Policy Core                │
│                                              │
│ validateProposal(...)                        │
│ validatePersistedFile(...)                   │
│ validateProject(...)                         │
│ evaluateActionPolicy(...)                    │
│                                              │
│ → stable typed ValidationResult              │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│ Claude      │ │ Codex       │ │ Kimi        │
│ Adapter     │ │ Adapter     │ │ Adapter     │
│ stdin JSON  │ │ patch input │ │ TOML + JSON │
│ Write/Edit  │ │ virtual FS  │ │ permission  │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       └───────────────┼────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│ Hook Configuration Manager                   │
│ install / update / uninstall / doctor        │
│ merge-preserving / atomic / owned entries    │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│ Agent Execution Planner / Hermes Dispatcher  │
│ Work Packet + installed capabilities         │
│ 不包含正确性规则                              │
└──────────────────────────────────────────────┘
```

三个模块的职责应明确分离：

- **Validation Core**：唯一的正确性规则实现。
- **Platform Adapter**：协议和 transport 转换。
- **Dispatcher**：任务编排、能力匹配和上下文组织，不执行或复制正确性规则。

## 7. 建议重排的实施阶段

### Phase 0：定义执行契约

1. 建立规则 × Hook Event 的 enforcement matrix。
2. 定义稳定的 `ValidationResult` schema。
3. 明确 `invalid` 与 `infrastructure_error` 的处理差异。
4. 定义 Pack Stack validation capability 合并语义。

**退出门槛**：每条声称“可强制”的规则都有明确执行点和可自动化验证的验收场景。

### Phase 1：抽取 Validation Core

从当前较大的 `cli/src/commands/validate.ts` 中抽取：

```ts
validateProposal()
validatePersistedFile()
validateProject()
```

当前 `validate.ts:42-110+` 同时承担命令解析、项目发现、Circle、扫描、输出和退出码，不适合继续直接增加 Hook、缓存和协议分支。

**退出门槛**：相同内容通过 CLI Adapter 与 Core 得到相同的稳定 issue code。

### Phase 2：单平台真实阻断垂直切片

建议优先使用 Claude Code Write/Edit，因为 proposed content 可直接重建。若业务上必须 Codex-first，则必须先实现可靠的 `apply_patch` 虚拟应用器。

E2E 必须证明：

1. 文件初始内容合法。
2. Agent 提议写入非法 frontmatter。
3. Core 验证的是 proposed content。
4. Hook 阻断工具调用。
5. 磁盘文件保持不变。
6. Agent 收到明确的失败原因。
7. 合法写入正常通过。

### Phase 3：Hook Configuration Manager

增加：

```bash
opsv hooks install
opsv hooks uninstall
opsv hooks doctor
opsv hooks print
```

覆盖：

- 已有 Claude settings 合并；
- 去重；
- OPSV ownership marker；
- dry-run；
- 原子写入；
- rollback；
- uninstall 保留 Trellis 和用户 Hook。

### Phase 4：Codex Adapter 与项目级一致性检查

1. 解析 `apply_patch`。
2. 构建 virtual snapshot。
3. 检查创建、更新和删除操作。
4. 增加 PostToolUse/full-project validation。
5. 定义 Bash 等旁路修改的检测策略。

### Phase 5：Capability 模型与 Doctor

Pack 应优先声明能力需求，而不是直接绑定厂商：

```yaml
agent_requirements:
  capabilities:
    - proposal-validation
    - post-write-validation
    - project-validation
```

项目配置再把能力映射到已安装且健康的平台 Adapter。这也符合项目现有的“Pack Profile 指向 capability，而非硬编码 provider/model”原则。

### Phase 6：AgentRouter / Hermes Dispatcher

Router 输入至少应包含：

- resolved Work Packet；
- resolved Pack Stack；
- required capabilities；
- installed adapters；
- adapter health；
- forbidden constraints；
- concurrency state。

Router 不参与正确性判断，只选择能够满足能力要求的执行 Agent。

### Phase 7：性能优化与可选平台

1. 基准测试后再决定是否缓存。
2. Kimi 使用其原生协议 Adapter。
3. OpenClaw 作为可选 Adapter。
4. 不再追求“五平台一个 Shell Handler”。

## 8. Go / No-Go 验收门槛

重新进入实施前，至少应满足：

- [ ] PreToolUse 验证的是 proposed content，而不是磁盘旧文件。
- [ ] `invalid` 始终阻断，只有 infrastructure error 可以配置 fail-open。
- [ ] 每个平台拥有自己的协议 Adapter。
- [ ] 不依赖虚构或非标准的 `$TOOL_INPUT_FILE_PATH`。
- [ ] Hook 安装会合并而不是覆盖 `.claude/settings.json`。
- [ ] uninstall 不会删除 Trellis 或用户 Hook。
- [ ] Pack Stack 的 capability/validation 合并规则已定义。
- [ ] 一个真实平台 E2E 证明非法 proposed content 没有落盘。
- [ ] Router 不参与或复制正确性判断。
- [ ] 现有 315 个测试继续通过。
- [ ] Jest open-handle 问题被定位或记录为明确技术债。

## 9. 工期判断

原计划约 7 天的估算偏乐观，因为它没有完整计入：

- proposed-content 重建；
- Codex patch 虚拟应用；
- 多平台 Adapter；
- 配置结构化合并和卸载；
- Pack Stack 合并语义；
- 项目级一致性检查；
- 并发控制设计。

建议拆分为：

- **严格单平台 MVP**：约 3–4 个开发日。
- **多平台、配置生命周期和项目级验证完整版本**：约 8–12 个开发日。

## 10. 最终意见

建议将原计划状态标记为：

> **Concept Approved / Implementation Replan Required**

可以继续保留的主线是：

```text
OPSV Validation Core
  → Platform Hook Adapters
  → Hook Configuration Manager
  → Agent Execution Planner / Hermes Dispatcher
```

当前不得以原计划的共享 Shell Handler、`validate --inline <磁盘文件>` 和 `opsv init --agent` 作为实施起点。第一条可交付成果应是：

> 在一个真实平台上，Hook 使用 proposed content 调用统一 Validation Core，并证明非法写入在落盘前被阻断。

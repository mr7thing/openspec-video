# Hook / Dispatcher Readiness — Go/No-Go 记录

> 日期：2026-08-05
> 任务：T11 `08-05-hook-dispatcher-readiness`（父任务 `08-05-opsv-mv-pack-contract-hardening`）
> 依据：`docs/OPSV_AND_MV_PACK_IMPROVEMENT_DEVELOPMENT_PLAN_2026-08-05.md` §11
> **决定：Go — Conditional No-Go 解除。** Core 与 MV Pack 已可作为 Hook/Dispatcher 的可信控制面。

---

## 1. Go 条件核对（计划 §11 逐项）

| 条件 | 状态 | 证据 |
|---|---|---|
| `opsv pack check <mv-pack> --json` 0 error | ✅ | 实测 0 error / 0 warning（T06/T07 后）；checker: `cli/src/core/PackChecker.ts`（主仓 `c30b8a1`/`4c348de`） |
| Profile/Skill/Category identity 闭环 | ✅ | Pack 提交 `f1d7219`、`920c490`；8 个 canonical `opsv-mv-*` key 全闭环 |
| `work check music` 不再返回伪 materialize | ✅ | 返回 `nextAction.kind=draft`（`opsv-mv-music`），无伪造 command（主仓 `a5f294a`/`d02134c`） |
| production NextAction 带唯一 manifest + asset selector | ✅ | `compile` action 含 `manifest`+`asset`；命令可从项目根执行（`HookReadiness.test.ts` #7） |
| 多 Circle 明确失败 | ✅ | `CIRCLE_AMBIGUOUS` → blocked（`NextAction.test.ts`、`HookReadiness.test.ts` #5） |
| Project policy 无法放宽 Pack policy | ✅ | `PolicyLattice.ts`；`PROJECT_POLICY_LOOSENS_PACK` blocked（主仓 `cfa773d`–`8bc80c5`） |
| Pack content digest 覆盖行为文件 | ✅ | `PackDigest.ts` + lock v2（主仓 `3dd3f3e`–`e8fda80`）；SKILL.md/scripts 变更使 digest 变化（readiness #3） |
| export containment + broken shim | ✅ | `resolveContainedReal`/`resolvePackExportPath`、shim 自愈（主仓 `92afe0e`–`2d35d85`） |
| half-life 五点 fixture 通过 | ✅ | `test/pack-contract.test.js` 9/9，连跑可重复（Pack 仓 `47b8f65`–`a230e9d`） |
| Core build/lint/test 全绿且 Jest 自动退出 | ✅ | 398/398、rc=0、无 `--forceExit`；lint 0 error（主仓 `892d436`/`aa38b0f`） |
| Pack contract/Director gates 全绿 | ✅ | director 10/10、no-concrete-models 2/2、mv-check 4 OK/0 ERROR |
| 契约版本化并写入 spec | ✅ | `WORK_PACKET_CONTRACT_VERSION=2`；issue code 快照测试；`architecture.md` / `config-system.md` / `error-handling.md` / `pack-format.md` / `testing.md` 已更新 |

**No-Go 条件（§11）逐项复核**：empty gates 不再可能由 identity mismatch 产生（fail closed）；无项目根不可执行命令；lock 可见 Skill/Profile/script 变化；checker/fixture 非 false-green；policy 不可放宽；path escape 已关闭；Jest 不依赖 forceExit。全部清零。

## 2. Readiness 契约（冻结，供 Hook/Router 消费）

未来 Hook Adapter / AgentRouter **只能**依赖（`cli/src/core/__tests__/HookReadiness.test.ts` 7 项集成测试锁定）：

1. typed Pack validation result（`PackCheckReport` + 稳定 `PACK_*` codes）
2. versioned Work Packet（`contractVersion: 2`）
3. 结构化 `NextAction`（`draft|materialize|circle|compile|sync|blocked`）
4. 稳定 issue codes + severity
5. Pack `content_digest`（`PackDigest.ts` 唯一实现；Hook cache key 必须包含它）
6. effective policy（`PolicyLattice.ts`）
7. 路径规范化（`resolveContainedReal` / `resolvePackExportPath`）

保留的架构边界：`invalid` 永远 fail closed；只有明确 `infrastructure_error` 可按 policy fail-open；平台 Adapter 各自解析 proposed content，shared Core 不解析平台私有 payload；Hook config 合并必须结构化、幂等、可卸载、可回滚。

## 3. Hook 后续任务输入（follow-up PRD 要点）

1. **`validate --inline` 共享 Validation Core**（首个垂直切片）：验证 **proposed content** 而非磁盘旧文件——这是本次 Go 的前提条件，不得回退。
2. Hook cache key = project + source path + proposed content hash + **Pack content_digest** + validator contract version（+ adapter schema version）。
3. AgentRouter 消费 `NextAction`，禁止解析 command string；command 仅为派生展示。
4. 平台 Adapter（Claude Code / Codex / Kimi）各自协议独立，真机协议 fixture 锁定 schema。
5. 单平台垂直切片先行，不多平台铺开。

## 4. 已知限制与后续工作

- lint 基线 87 个 warning 为记录在案的债务（`cli/eslint.config.js` 注释），后续任务递减。
- 同一 category 的多 input slot 顺序不可机器区分（`pack-format.md` 已记录，prose 补充）。
- CI `mv-pack-contract` job 假设 `mr7thing/opsv-packs` 可被 Actions 访问；私有仓需 checkout token。
- 旧 `command` 字段仍作为派生兼容字段保留；弃用周期在首个 Hook Adapter 落地后决定。
- manifest.json / root SKILL.md 兼容面保留未删（消费者审计未做）。

## 5. 提交索引

**主仓**（openspec-video）：T01 `20aa830`–`682697e` · T02 `2e591ec`–`d02134c` · T03 `cfa773d`–`8bc80c5` · T04 `3dd3f3e`–`e8fda80` · T05 `92afe0e`–`2d35d85` · spec `a992fca` · T07 Core `cb514a8`–`b580b5b` + spec `690d0c9` · T10 `892d436`–`5611b89` + spec `07f1d97` · T11 readiness 测试（本记录同批提交）

**Pack 仓**（opsv-packs）：T06 `f1d7219`/`920c490` · WIP 快照 `1877b89` · T07 `823388d`–`b4ec8bc` · T08 `47b8f65`–`a230e9d` · T09 `7a5a023`/`32fcc6a`

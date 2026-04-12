# OpsV 第二轮代码修复报告

> 日期: 2026-04-12 | 编译状态: ✅ `npx tsc --noEmit` 零错误

---

## 修复背景

在第一轮安全修复（命令注入 + dispatcher 稳定性）完成后，对全代码库进行了深度审查，发现 12 个新问题。本轮针对其中 6 个核心问题（P0+P1+P2）进行修复，同步更新中英文接口文档。

---

## 修复详情

### ✅ T1+T2 — ImageProvider 接口升格（方案A）

**根因**: `ImageModelDispatcher.dispatchJob` 中存在 `instanceof` 分支（死代码陷阱），第三个 `Provider` 接入时图片生成成功但不写盘，系统静默丢失数据。

**哲学**: 特殊情况的最优解不是处理它，而是让它消失。接口强制所有 Provider 承担自己的"写盘"责任，Dispatcher 无需知道任何 Provider 的内部策略。

**修改文件**:
- `src/executor/providers/ImageProvider.ts` — 删除 `generateImage` 和 `ImageGenerationResult` 公开导出，`generateAndDownload` 成为唯一必须方法，加入完整的接入规范注释
- `src/executor/ImageModelDispatcher.ts` — 删除 `instanceof SeaDreamProvider || instanceof MinimaxImageProvider` 分支，改为单行 `await provider.generateAndDownload(...)`；`stats` 实例变量改为函数局部变量（修复竞争条件）；移除 `as any` 类型强转
- `src/executor/providers/SeaDreamProvider.ts` — `generateAndDownload` 返回类型 `Promise<string>` → `Promise<void>`；内部 `generateImage` 设为 `private`；`ImageGenerationResult` 改为文件内部接口
- `src/executor/providers/MinimaxImageProvider.ts` — 删除旧的 `generateImage` stub 方法，删除 `ImageGenerationResult` 导入

---

### ✅ T3+T4 — DependencyGraph async bug 修复

**根因**: `prettyPrint()` 中 `approvedRefReader.hasAnyApproved(id)` 是异步方法，但被当作同步布尔值使用。`Promise` 对象始终为 truthy，导致依赖图状态显示**永远全是 ✅**，功能形同虚设。

**修改文件**:
- `src/core/DependencyGraph.ts` — `prettyPrint()` 改为 `async prettyPrint(): Promise<string>`，内部 `await approvedRefReader.hasAnyApproved(id)` 正确执行异步调用
- `src/automation/JobGenerator.ts` — `logger.info(depGraph.prettyPrint(...))` 改为 `logger.info(await depGraph.prettyPrint(...))`

---

### ✅ T5+T6 — 消除 extractFirstParagraph 重复代码

**根因**: `AssetManager` 和 `JobGenerator` 各自维护一份 `extractFirstParagraph` 的私有实现，违反 DRY 原则。AssetManager 的版本更完整（同时过滤标题/图片/注释/分隔线），JobGenerator 的版本是简化副本。

**修改文件**:
- `src/core/FrontmatterParser.ts` — 新增公共静态方法 `extractFirstParagraph(body: string): string`（使用完整版逻辑）
- `src/core/AssetManager.ts` — 删除私有 `extractFirstParagraph` 方法，改调 `FrontmatterParser.extractFirstParagraph(body)`
- `src/automation/JobGenerator.ts` — 同上，删除私有副本

---

### ✅ T7 — genVideo.ts 接通 dispatcher options + DispatchSummary

**根因**:
1. `VideoModelDispatcher` 构造函数已支持 `{ failFast }` 选项，但 `genVideo.ts` 创建时用旧签名，`--skip-failed` CLI 选项完全断路
2. `dispatchAll` 返回 `DispatchSummary`，但返回值被丢弃，失败任务用户无感知，CLI 始终打印"completed"

**映射关系**: `--skip-failed` = 失败后继续 = `failFast: !options.skipFailed`

**修改文件**:
- `src/commands/genVideo.ts`:
  - `new VideoModelDispatcher(projectRoot, { failFast: !options.skipFailed })`
  - `const summary = await dispatcher.dispatchAll(...)` 使用返回值
  - 每个模型管道完成后输出 `summary.failed`/`summary.succeeded` 计数
  - 全部完成后汇总 `totalFailed`/`totalSucceeded`
  - 删除误导性的"video pipeline requires sequential execution"提示（现在 skip-failed 真正有效）

---

### ✅ T8 — cli.ts 注释编码乱码修复

**修改文件**:
- `src/cli.ts` — 3 行 GB2312/UTF-8 混码注释恢复为正确中文

---

### ✅ D1+D2 — 中英文接口文档同步更新

**修改文件**:
- `docs/cn/07-API-REFERENCE.md` — 全面重写，从"参数列表文档"升级为"完整接口规范"：设计理念（方案A）、接口定义、现有 Provider 一览、新增 Provider 强制规范（三条铁律+接入清单+超时约定）、Dispatcher 调用协议
- `docs/en/07-API-REFERENCE.md` — 英文版 1:1 对等内容

---

## 后续接入新 Provider 的强制要求

> 这是文档中明确的规范，所有 AI Agent 和人类开发者接入新图像 Provider 时必须遵守：

1. **必须实现** `generateAndDownload(job, modelName, apiKey, outputPath): Promise<void>`
2. **禁止** 实现旧的 `generateImage` 方法（接口不再定义此方法）
3. **必须注册** 到 `ImageModelDispatcher.registerProviders()` 中
4. **超时必须抛异常含 "超时" 或 "timeout" 关键词**（Dispatcher 统计依赖此约定）
5. **遵守三条防御性编码准则**（见 `docs/cn/07-API-REFERENCE.md` 第4节）

---

## 编译验证

```
npx tsc --noEmit
# Exit code: 0（零错误）
```

---

## 修复统计

| 类别 | 文件数 | 问题 |
|------|--------|------|
| Provider 接口 | 4 | instanceof 死代码、类型不兼容、重复方法 |
| 运行时 bug | 1 | async/await 误用导致状态图全错 |
| 功能断路 | 1 | --skip-failed + DispatchSummary 未接通 |
| 代码质量 | 3 | 重复实现、竞争条件、编码乱码 |
| 文档 | 2 | 中英文接口文档同步更新 |

> *「接口是合约，让每一个方法的存在都有其必然的理由。」*

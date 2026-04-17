# OpenSpec-Video v0.6.0 Specification

> 从 v0.5.19 到 v0.6.0 的架构升级总览

## 重大变更 (Breaking Changes)

### 1. Dispatcher 灭亡 → Spooler Queue 统治
- **删除**: `ImageModelDispatcher.ts`、`VideoModelDispatcher.ts`
- **删除**: `opsv gen-image`、`opsv gen-video` 命令
- **新增**: `opsv queue compile <tasksJson> --provider <name>`
- **新增**: `opsv queue run <provider>`
- 所有 Provider 降级为 `processTask()` 纯消费者

### 2. Generate 回归本位
- `opsv generate` 不再唤起执行管线或守护进程
- 仅输出 `queue/jobs.json` 纯意图大纲

### 3. 服务拓扑标准化
- 新增根目录 `.env` 服务管理配置文件
- `OPSV_DAEMON_PORT` 和 `OPSV_REVIEW_PORT` 从硬编码解耦
- 明确 Global Daemon / Local Review / Task Worker 三层服务分类
- 新增 `docs/Server-Architecture.md`

### 4. 项目初始化增强
- `opsv init` 自动创建 `.opsv/` 和 `.opsv-queue/` 运行时目录
- 内建生成 `.gitignore` (不再依赖外部模板文件)

### 5. Queue 命令 Provider 名称不区分大小写

## 新增组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `StandardAPICompiler` | `src/core/compiler/StandardAPICompiler.ts` | 标准 HTTP API 编译器 |
| `SpoolerQueue` | `src/core/queue/SpoolerQueue.ts` | 物理文件状态机 |
| `QueueWatcher` | `src/executor/QueueWatcher.ts` | 单线程任务消费看守 |

## 已删除组件

| 组件 | 原路径 | 替代方案 |
|------|--------|----------|
| `ImageModelDispatcher` | `src/executor/` | `opsv queue compile + run` |
| `VideoModelDispatcher` | `src/executor/` | `opsv queue compile + run` |
| `genImage.ts` | `src/commands/` | `opsv queue run <provider>` |
| `genVideo.ts` | `src/commands/` | `opsv queue run <provider>` |

## 文档体系

| 文档 | 路径 | 状态 |
|------|------|------|
| 项目全景 | `docs/cn/01-OVERVIEW.md` | ✅ 重写 |
| 工作流程 | `docs/cn/02-WORKFLOW.md` | ✅ 重写 |
| CLI 参考 | `docs/cn/03-CLI-REFERENCE.md` | ✅ 重写 |
| Agent 体系 | `docs/cn/04-AGENTS-AND-SKILLS.md` | ✅ 更新 |
| 文档规范 | `docs/cn/05-DOCUMENT-STANDARDS.md` | ✅ 更新 |
| 配置体系 | `docs/cn/06-CONFIGURATION.md` | ✅ 重写 |
| API 规范 | `docs/cn/07-API-REFERENCE.md` | ✅ 重写 |
| Addon 开发 | `docs/cn/08-ADDONS-DEVELOPMENT.md` | ✅ 更新 |
| 服务架构 | `docs/Server-Architecture.md` | ✅ 更新 |
| 英文文档 | `docs/en/01-07` | ✅ 全部同步 |

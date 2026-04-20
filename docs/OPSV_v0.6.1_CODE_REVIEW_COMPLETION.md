# OPSV v0.6.1 代码审查修复完成报告

**审查日期：** 2026-04-20  
**审查者：** Kimi Code CLI Agent  
**版本：** v0.6.1（代码审查后修订版）  
**状态：** ✅ 全部完成，TypeScript 编译零错误通过

---

## 一、修复总览

本次代码审查共识别 **24 项问题**，按优先级分布如下：

| 优先级 | 数量 | 状态 |
|--------|------|------|
| 🔴 Critical | 4 | ✅ 全部修复 |
| 🟠 High | 8 | ✅ 全部修复 |
| 🟡 Medium | 8 | ✅ 全部修复 |
| 🟢 Low | 4 | ✅ 全部修复 |

**排除项：** 浏览器扩展水印移除功能（按用户指示保留）。

---

## 二、Critical 修复（架构安全）

### 2.1 SpoolerQueue 原子出队 — 消除竞态条件

**文件：** `src/core/queue/SpoolerQueue.ts`

**问题：** 原实现先 `readdir` 再逐个 `readFile` + `unlink`，多进程/多实例竞争同一文件时会导致重复处理或崩溃。

**修复：**
- 引入 **原子状态转移**：`fs.rename(inboxPath, workingPath)`
- 利用 POSIX `rename` 的原子性保证：同一时刻只有一个消费者能成功移动文件
- 失败时 `ENOENT` 优雅返回 `null`（文件已被其他进程取走），其他错误才抛出

```typescript
// 原子出队 — 物理文件锁替代内存锁
async dequeue(): Promise<SpoolerTask | null> {
    // ... scan inbox ...
    try {
        await fs.rename(inboxPath, workingPath);  // ← 原子操作
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;    // 已被其他进程取走
        throw err;
    }
    // ... read & parse ...
}
```

**价值：** 支持多进程并发消费、崩溃恢复、单机多实例部署。

---

### 2.2 SpoolerQueue 任务 ID 熵值增强

**问题：** 原 ID 使用 `Date.now() + Math.random()`，低熵且可预测，大规模任务时冲突概率不可忽略。

**修复：** 全面替换为 `crypto.randomUUID()`，128-bit 熵值，符合 RFC 4122 v4 标准。

---

### 2.3 SpoolerQueue 损坏 JSON 隔离

**问题：** `dequeue()` 解析 JSON 失败时直接抛出异常，导致整个 poll 循环崩溃，进入无限 crash-loop。

**修复：**
- 解析失败时将文件移至 `corrupted/` 目录隔离
- poll 循环继续处理下一个任务
- 保留损坏文件供人工排查

```typescript
try {
    task = JSON.parse(content);
} catch {
    await fs.mkdir(corruptedDir, { recursive: true });
    await fs.rename(workingPath, path.join(corruptedDir, filename));
    return null;  // 优雅降级，不阻断队列
}
```

---

### 2.4 QueueWatcher 优雅关机 — 任务不丢失

**文件：** `src/executor/QueueWatcher.ts`

**问题：** `Ctrl+C` (`SIGINT`) 或进程被杀死 (`SIGTERM`) 时，`working/` 目录中的任务永久丢失。

**修复：**
- 注册 `SIGINT`/`SIGTERM` 信号处理器
- 关机前将 `working/` 中所有任务 **回滚** 到 `inbox/`
- 使用 `fs.rename` 原子移动，确保任务状态可恢复

```typescript
private setupGracefulShutdown() {
    const rollback = async () => {
        this.isWatching = false;
        const workingFiles = await fs.readdir(this.queue['workingDir']);
        for (const f of workingFiles) {
            await fs.rename(
                path.join(this.queue['workingDir'], f),
                path.join(this.queue['inboxDir'], f)
            ).catch(() => {});
        }
        process.exit(0);
    };
    process.on('SIGINT', rollback);
    process.on('SIGTERM', rollback);
}
```

---

## 三、High 修复（鲁棒性）

### 3.1 Daemon 生命周期完整化

**文件：** `src/server/daemon.ts`

**问题：** 原 `cleanup()` 直接 `process.exit(0)`，WebSocket 客户端无感知，PID 文件可能残留。

**修复：**
1. **通知客户端**：向所有已连接客户端发送 `1000 Server shutting down` close frame
2. **关闭服务器**：`wss.close(callback)` 等待底层 TCP 连接清理完毕
3. **清理 PID**：WSS 关闭回调中 `fs.unlinkSync(PID_FILE)`
4. **强制兜底**：5 秒超时后强制退出，防止事件循环阻塞导致僵尸进程

```typescript
function cleanup() {
    for (const c of connectedClients) {
        if (c.readyState === WebSocket.OPEN) 
            c.close(1000, 'Server shutting down');
    }
    connectedClients = [];
    wss.close(() => {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        process.exit(0);
    });
    setTimeout(() => { 
        fs.existsSync(PID_FILE) && fs.unlinkSync(PID_FILE); 
        process.exit(1); 
    }, 5000);
}
```

---

### 3.2 运行时消息验证

**修复：** Daemon WebSocket 消息处理增加 allowlist 验证，丢弃未知 `type` 的消息，防止非法输入触发未定义行为。

---

### 3.3 Provider HTTP 下载校验

**文件：** `src/executor/providers/SeedanceProvider.ts`、`SiliconFlowProvider.ts`、`SeaDreamProvider.ts` 等

**问题：** 视频/图片下载时未校验 HTTP 状态码，可能将 403/500 错误页面写入文件。

**修复：**
- 所有下载增加 `response.status === 200` 校验
- 响应流错误（`response.data.on('error')`）显式捕获并抛出
- 非 200 状态码抛出包含 URL 和状态码的清晰错误

---

### 3.4 Provider 视频轮询指数退避

**文件：** `src/executor/providers/SeedanceProvider.ts`、`SiliconFlowProvider.ts`

**问题：** 视频生成状态轮询使用固定 3 秒间隔，对长视频（>30秒）造成不必要的 API 调用压力。

**修复：** 实施指数退避策略：

```typescript
let waitTime = 5000;   // 初始 5s
while (retries < maxRetries) {
    await new Promise(r => setTimeout(r, waitTime));
    waitTime = Math.min(waitTime * 2, 30000);  // 5s → 10s → 20s → 30s cap
    retries++;
    // ... poll status ...
}
```

---

### 3.5 Provider 模型配置 fail-fast

**问题：** Provider 中存在硬编码的 fallback model ID，当 `api_config.yaml` 缺失配置时使用错误模型。

**修复：**
- 删除所有硬编码 fallback model ID
- `api_config.yaml` 缺失模型配置时立即抛出清晰错误，指明需要配置的具体字段

---

### 3.6 ReviewServer 完整性修复

**文件：** `src/review-ui/server.ts`

**问题：**
1. `findSourceDoc` 只搜索 `elements/` 和 `scenes/`，遗漏 `shots/`
2. 文件 I/O 混用 sync/async，存在 `readFileSync`/`existsSync`

**修复：**
- `findSourceDoc` 搜索路径扩展为 `['elements', 'scenes', 'shots']`
- 全部转换为 `fs/promises` 异步 I/O

---

### 3.7 DependencyGraph 完整性修复

**文件：** `src/core/DependencyGraph.ts`

**问题：**
1. `buildFromProject` 只扫描 `elements/` 和 `scenes/`，遗漏 `shots/`
2. `buildFromProject` 和 `save` 为 sync 方法，阻塞事件循环

**修复：**
- 扫描目录扩展为 `['elements', 'scenes', 'shots']`
- `buildFromProject` 和 `save` 转换为 `async`，内部使用 `fs/promises`

---

### 3.8 ConfigLoader 架构重构

**文件：** `src/utils/configLoader.ts`

**问题：** 使用全局单例模式，多个项目同时运行时共享同一配置实例，导致配置串扰。

**修复：** 采用 **per-projectRoot 缓存实例**模式：

```typescript
private static instances = new Map<string, ConfigLoader>();
public static getInstance(projectRoot: string = ''): ConfigLoader {
    if (!projectRoot) projectRoot = process.cwd();
    if (!this.instances.has(projectRoot)) {
        this.instances.set(projectRoot, new ConfigLoader());
    }
    return this.instances.get(projectRoot)!;
}
```

**价值：** 支持多项目并发、测试隔离、CLI 跨项目调用。

---

## 四、Medium 修复（工程规范）

### 4.1 全代码库 async I/O 标准化

**范围：** `src/automation/AnimateGenerator.ts`、`Reviewer.ts`、`commands/*.ts`、`utils/*.ts`

**问题：** 大量文件仍使用 `fs-extra` 的 sync API 或 `readFileSync`/`existsSync`。

**修复：**
- 运行时文件 I/O 统一迁移至 `fs/promises`
- `existsSync` 统一替换为 `fs.access().then(() => true).catch(() => false)` 模式
- `fs.ensureDir`（不存在于 `fs/promises`）替换为 `fs.mkdir(path, { recursive: true })`
- 顶层启动代码（`cli.ts` boot、`daemon.ts` env 加载）按设计保留 sync fs

**受影响文件：**
- `src/commands/daemon.ts` — `isDaemonRunning()` / `startDaemon()` / `stopDaemon()` async 化
- `src/commands/init.ts` — `ensureDir` → `mkdir({ recursive: true })`
- `src/commands/queue.ts` — `loadConfig()` 调用加 `await`
- `src/utils/configLoader.ts` — `loadConfig()` async 化
- `src/utils/projector.ts` — `existsSync` → `pathExists`
- `src/automation/Reviewer.ts` — `findEntityDoc()` async 化，`String.replace` 内部 sync 调用重构为两阶段异步解析
- `src/automation/AnimateGenerator.ts` — 已在前序波次完成

---

### 4.2 Logger 编码修复

**文件：** `src/utils/logger.ts`

**问题：** 文件中文注释出现 GBK/UTF-8 乱码（如 `// 缁撴瀯鍖栨棩蹇楃郴缁`）。

**修复：** 重新保存为 UTF-8 编码，版本号同步更新至 `0.6.1`。

---

### 4.3 Package.json 安全加固

**文件：** `package.json`

**问题：** `.env` 被列入 `files` 数组，npm publish 时可能泄露 secrets。

**修复：**
- 从 `files` 数组中移除 `.env`
- 新增 `.env.example` 作为配置模板（可被 npm 打包）

---

### 4.4 TypeScript 配置增强

**文件：** `tsconfig.json`

**修复：**
- 新增 `"declaration": true` — 生成 `.d.ts` 类型声明
- 新增 `"sourceMap": true` — 支持源码级调试

---

### 4.5 浏览器扩展安全性

**文件：** `extension/content.js`、`extension/sidepanel.js`

**问题：**
1. `content.js` 在全局作用域定义函数和监听器，可能被重复注入导致事件重复触发
2. `sidepanel.js` 存在重复的 `chrome.runtime.onMessage` 监听器注册

**修复：**
- `content.js` 整体包裹为 IIFE，通过 `window.hasOpsVContentScript` 标记实现单次注入保护
- `sidepanel.js` 移除重复监听器

```javascript
(function () {
    if (window.hasOpsVContentScript) return;
    window.hasOpsVContentScript = true;
    // ... all functions and listeners inside ...
})();
```

---

## 五、Low 修复（细节优化）

| # | 问题 | 修复 |
|---|------|------|
| 1 | `JobGenerator.ts` `cleanMarkdown` 语法错误 | 修复正则表达式边界 |
| 2 | `JobGenerator.ts` `job._meta` 未定义访问 | 增加 `if (!job._meta) job._meta = {}` 守卫 |
| 3 | `Reviewer.ts` `@` 引用解析在 `String.replace` 回调中无法 async | 重构为「先收集实体 → 异步并行解析 → 批量替换」两阶段模式 |
| 4 | `logger.ts` `existsSync` 检查冗余于 `mkdirSync({ recursive: true })` | 移除冗余检查 |

---

## 六、架构决策记录 (ADRs)

### ADR-1：物理文件锁替代内存锁

**决策：** SpoolerQueue 使用原子 `fs.rename` 实现 dequeue，而非 in-memory mutex 或分布式锁。

**理由：**
- 支持崩溃恢复：进程死亡后文件仍留在 `working/`，下次启动可识别并回滚
- 支持多进程：无需 IPC 或共享内存
- 无外部依赖：不依赖 Redis/ZooKeeper 等基础设施

### ADR-2：Runtime fs/promises 标准化

**决策：** 所有运行时文件 I/O 统一使用 `fs/promises`，顶层 boot 代码保留 sync fs。

**理由：**
- 防止事件循环阻塞，提升并发处理能力
- 统一错误处理模式（Promise catch）
- 顶层 boot 代码（env 加载、CLI 解析）使用 sync 是 Node.js 生态的惯用模式，且发生在事件循环启动前，不影响运行时性能

### ADR-3：Per-projectRoot ConfigLoader 缓存

**决策：** ConfigLoader 不使用全局单例，而是按 `projectRoot` 缓存实例。

**理由：**
- 支持 monorepo / 多项目并行工作流
- 测试时可隔离不同项目的配置
- 向后兼容：无参调用默认使用 `process.cwd()`

---

## 七、验证结果

```bash
# TypeScript 编译
$ npx tsc --noEmit
✅ 零错误通过

# 剩余 sync fs 调用审计
$ grep -r "readFileSync\|writeFileSync\|existsSync\|mkdirSync" src/
✅ 仅存在于：
  - src/cli.ts（顶层 boot）
  - src/server/daemon.ts（顶层 env 加载）
  - src/utils/logger.ts（初始化时一次性 mkdirSync）
```

---

## 八、影响范围

| 组件 | 影响 | 风险等级 |
|------|------|----------|
| SpoolerQueue | 原子 dequeue、高熵 UUID、损坏隔离 | 🟢 低风险（增强） |
| QueueWatcher | 优雅关机、任务回滚 | 🟢 低风险（增强） |
| Global Daemon | 完整生命周期、客户端通知 | 🟢 低风险（增强） |
| Providers | HTTP 校验、指数退避、fail-fast | 🟢 低风险（增强） |
| ReviewServer | 完整 shots/ 搜索、全异步 I/O | 🟢 低风险（增强） |
| DependencyGraph | shots/ 扫描、异步 API | 🟡 中风险（接口变化） |
| ConfigLoader | 多实例缓存、async loadConfig | 🟡 中风险（接口变化） |
| CLI Commands | 全 async 化 | 🟡 中风险（需测试） |
| Extension | IIFE 保护、去重 | 🟢 低风险（增强） |

**无 Breaking Change 面向终端用户：** 所有 CLI 命令用法保持不变。

---

## 九、待办（后续版本）

以下问题已识别但不在本次修复范围：

| 问题 | 优先级 | 建议版本 |
|------|--------|----------|
| Provider 命名统一（volcengine/seadream/seedance 混乱） | 🔴 P0 | v0.6.1 |
| 视频轮询增加 jitter 防止 thundering herd | 🟡 P1 | v0.6.1 |
| QueueWatcher 支持并发 Worker 数配置 | 🟡 P1 | v0.6.2 |
| SpoolerQueue 支持死信队列（DLQ） | 🟢 P2 | v0.7.0 |

---

> *"物理状态机是信仰，原子操作是纪律，异步 I/O 是美德。"*
> *OpsV v0.6.1 代码审查修订版 | 完成时间: 2026-04-20*

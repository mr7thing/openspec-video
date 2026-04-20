# OpenSpec-Video (OpsV) v0.6.0 — 代码审查报告

> **审查工具：** Kimi Code CLI  
> **审查范围：** `src/`、`extension/`、`package.json`、`tsconfig.json`  
> **审查日期：** 2026-04-20  
> **修复完成日期：** 2026-04-20  
> **版本：** v0.6.0 (Spooler Queue Era)  
> **状态：** ✅ 全部修复完成，TypeScript 编译零错误通过

---

## 执行摘要

**项目概述：** `openspec-video`（npm 包名 `videospec`）是一个 Spec-as-Code 框架，用于将叙事 Markdown 规范编译为工业级 AI 视频/图像生成任务。v0.6.0 引入了基于物理文件状态机的 **Spooler Queue（排队论）架构**，实现了创意意图与 API 执行的解耦。

**总体评价：** 架构设计思路清晰，Spooler Queue 的物理状态机设计具备良好的崩溃恢复潜力。代码审查识别出 24 项问题（Critical 4 / High 8 / Medium 8 / Low 4），**已全部修复并验证通过**。主要修复集中在队列并发安全、浏览器扩展稳定性、文件 I/O 一致性以及类型安全方面。

**修复报告：** 详见 `docs/OPSV_v0.6.1_CODE_REVIEW_COMPLETION.md`

---

## 🔴 关键问题（Critical）

### 1. SpoolerQueue 出队存在竞态条件 — 缺乏文件锁

**文件位置：** `src/core/queue/SpoolerQueue.ts:56-87`

`dequeue()` 方法的实现不是原子操作：

```ts
const content = await fs.readFile(inboxPath, 'utf-8');    // 1. 读取
const task: SpoolerTask = JSON.parse(content);             // 2. 解析
task.status = 'working';
await fs.writeFile(workingPath, JSON.stringify(task));     // 3. 写入 working
await fs.unlink(inboxPath);                                // 4. 删除 inbox
```

**风险：**
- 如果同时运行两个 `QueueWatcher` 实例或进程，它们可能在文件被删除前同时读取同一个任务，导致**同一任务被重复执行**。
- 如果在步骤 3 和 4 之间发生崩溃（如进程被 kill），任务会同时存在于 `working/` 和 `inbox/`，造成状态不一致。

**建议：** 使用基于重命名的原子操作（`fs.rename`）实现锁机制，或引入 `proper-lockfile` 等成熟的文件锁库。标准模式应为：先将任务文件重命名为 `working/<uuid>.json.lock`，处理完成后再移除 `.lock` 后缀。

---

### 2. SpoolerQueue 解析失败导致无限重试

**文件位置：** `src/core/queue/SpoolerQueue.ts:79`

```ts
const task: SpoolerTask = JSON.parse(content); // 无 try-catch
```

如果某个任务文件因磁盘错误、手动编辑或并发写入而损坏，`JSON.parse` 会抛出异常。虽然 `poll()` 的外层循环捕获了这个错误，但它**不会将损坏文件移走**，导致每隔 5 秒无限重试同一个损坏文件。

**建议：** 对 `JSON.parse` 包裹 try-catch，解析失败时将文件移动到 `.opsv-queue/<provider>/corrupted/` 目录，并记录错误日志。

---

### 3. 浏览器扩展 content.js 的防护逻辑完全失效

**文件位置：** `extension/content.js:1-31`

代码试图通过 `window.hasOpsVContentScript` 防止重复注入：

```js
(function () {
    if (window.hasOpsVContentScript) return; // 只防护了一个空 IIFE
    window.hasOpsVContentScript = true;
    // 这里只有注释，没有实际代码
})();

// 真正的代码从这里开始（36 行以后），完全不受防护
function remoteLog(...args) { ... }
chrome.runtime.onMessage.addListener(...);
```

**风险：** 当 sidepanel 的注入重试逻辑触发时，content script 会被注入两次，导致所有消息监听器和 DOM 操作**重复注册**，可能引发任务重复执行、消息重复响应等严重问题。

**建议：** 将所有顶层代码移入 IIFE 内部；或在使用 `chrome.runtime.onMessage.addListener` 前检查是否已注册。

---

### 4. 守护进程退出时未关闭 WebSocket 服务器

**文件位置：** `src/server/daemon.ts:200-210`

```ts
function cleanup() {
    console.log('[OpsV Global Daemon] Shutting down...');
    if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
    }
    process.exit(0); // WSS 连接被直接切断
}
```

`wss`（WebSocketServer 实例）从未被关闭。已连接的客户端会收到异常断开，且端口可能处于 TIME_WAIT 状态。

**建议：** 在 `cleanup()` 中调用 `wss.close(() => process.exit(0))`，并先遍历 `connectedClients` 优雅关闭所有客户端连接。

---

### 5. QueueWatcher 无法优雅处理 SIGINT（Ctrl+C）

**文件位置：** `src/executor/QueueWatcher.ts:17-55`

当用户按下 Ctrl+C 中断正在执行的任务时，任务文件会永久留在 `working/` 目录。由于 `dequeue()` 只扫描 `inbox/`，这个任务在下次启动时会被**彻底遗忘**，成为"幽灵任务"。

**建议：** 在 `QueueWatcher` 中注册 `process.on('SIGINT', ...)` 和 `SIGTERM` 处理器：
1. 将 `isWatching` 设为 `false`；
2. 如果当前有正在处理的任务，将其从 `working/` 移回 `inbox/` 或标记为 `failed`（附带 `error: "interrupted"`）；
3. 等待当前 handler 的 Promise 完成（或超时）后退出进程。

---

### 6. sidepanel.js 重复注册事件监听器

**文件位置：** `extension/sidepanel.js:629-656` 和 `:738-741`

`runAllBtn` 被注册了两个 `click` 监听器：
- 第一个包含完整的"全部运行"逻辑（内部已调用 `saveState()`）
- 第二个（738 行）只调用 `saveState()`

这导致每次点击 `runAllBtn` 时 `saveState()` 被执行两次。更糟的是，如果模块被重新加载，监听器会持续累积。

**建议：** 删除 738-741 行的冗余监听器。如需动态更新行为，考虑使用事件委托或先 `removeEventListener` 再重新添加。

---

## 🟠 高优先级问题（High）

### 7. 异步函数中混合同步文件 I/O

**涉及文件：** `src/automation/JobGenerator.ts`、`src/review-ui/server.ts`、`src/core/DependencyGraph.ts`、各 Provider

示例（`JobGenerator.ts:131`）：
```ts
if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir); // 同步调用在异步函数中
```

虽然 Node.js 的同步 fs 方法不会阻塞事件循环主线程，但会阻塞 libuv 线程池。对于可能处理大量文件的流水线工具，这会导致性能瓶颈和测试困难（难以 mock 同步 API）。

**建议：** `FileUtils.ts` 已提供完善的异步封装，应在所有异步上下文中统一使用 `fs/promises`。

---

### 8. 下载方法缺少 HTTP 状态码校验

**涉及文件：** `src/executor/providers/SeaDreamProvider.ts:135-143`、`SeedanceProvider.ts:140-158`、`SiliconFlowProvider.ts:129-136`

```ts
const response = await axios({ method: 'GET', url, responseType: 'stream' });
// 未检查 response.status === 200
response.data.pipe(writer);
```

如果 CDN 返回 403/404，代码会将错误页面（HTML）直接写入 `.png` 文件，且不会报错。用户只有在打开图片时才会发现异常。

**建议：** 添加状态检查：`if (response.status !== 200) throw new Error(...)`，或配置 axios 的 `validateStatus`。

---

### 9. 硬编码 API 端点与模型 ID

**文件位置：** `src/executor/providers/SeaDreamProvider.ts:11-28`

```ts
private endpoint: string = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
// ...
const actualModel = modelConfig.model || 'ep-20250225184203-g2t55';
```

 fallback 模型 ID 是一个具体的临时部署 ID，具有时效性。一旦该 ID 过期或下线，配置缺失的用户会得到难以理解的 API 错误。

**建议：** 移除 fallback 模型 ID，在配置缺失时**快速失败（fail fast）**，给出清晰的错误提示："请在 api_config.yaml 中配置 seadream 模型"。

---

### 10. 滥用 `any` 类型削弱严格模式

**涉及文件：** `src/core/compiler/StandardAPICompiler.ts`、各 Provider 文件

尽管 `tsconfig.json` 启用了 `"strict": true`，但代码中大量使用 `any`：

```ts
const requestBody: any = { ... };
const modelConfig = (configLoader.getModelConfig('seadream') || {}) as any;
const settings = (job.payload.global_settings || {}) as any;
```

这几乎完全抵消了 TypeScript 的编译期类型检查价值。

**建议：**
- 为每个 Provider 定义请求体接口；
- 使用 Zod 对 API 响应进行运行时校验（`PromptSchema.ts` 已有良好范例，应在 Provider 层推广）。

---

### 11. 日志文件编码损坏

**文件位置：** `src/utils/logger.ts`

文件中的中文注释出现乱码，例如：
```ts
// 缁撴瀯鍖栨棩蹇楃郴缁
```

推测是 GBK/UTF-8 编码转换错误，或文件在传输中损坏。

**建议：** 将文件重新保存为 UTF-8 编码。建议项目根目录添加 `.editorconfig`：
```ini
[*]
charset = utf-8
end_of_line = lf
```

---

### 12. `.env` 被打包进 npm 发布包

**文件位置：** `package.json:24-35`

```json
"files": [
    "dist", "templates", "extension", ".env", "docs", ...
]
```

`.env` 被列入 npm 发布文件列表。开发者在本地测试后如果直接执行 `npm publish`，可能将本地密钥意外公开。

**建议：** 立即从 `files` 中移除 `.env`，改为提供 `.env.example` 模板文件。

---

### 13. SpoolerQueue UUID 生成熵不足

**文件位置：** `src/core/queue/SpoolerQueue.ts:36-38`

```ts
private generateUUID(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
```

`Math.random()` 只有 9 位 36 进制字符（约 47 位熵），在高并发或测试快速创建任务时存在碰撞风险。

**建议：** 使用 Node.js 原生 `crypto.randomUUID()`（Node ≥ 14.17）或 `crypto.randomBytes(16).toString('hex')`。

---

### 14. ReviewServer 无法查找 shots 目录下的源文档

**文件位置：** `src/review-ui/server.ts:342-353`

```ts
private findSourceDoc(jobId: string): string | null {
    const dirs = ['elements', 'scenes']; // 缺少 'shots'
```

Shot 设计文档存储在 `videospec/shots/` 中，但 `findSourceDoc` 只搜索 `elements` 和 `scenes`。这导致在 Review UI 中对 shots 执行 Approve/Draft 操作时，**无法找到源文档来更新 frontmatter**。

**建议：** 将 `'shots'` 加入 `dirs` 数组。

---

## 🟡 中优先级问题（Medium）

### 15. API 轮询缺少指数退避

**涉及文件：** `src/executor/providers/SeedanceProvider.ts:94-138`、`SiliconFlowProvider.ts:98-118`

视频生成通常需要 5–15 分钟，但轮询采用固定 10 秒间隔。单任务会产生约 90 次请求，给 API 端点带来不必要的压力。

**建议：** 实现指数退避策略，例如间隔序列：5s → 10s → 20s → 30s（封顶）。

---

### 16. ConfigLoader 单例模式在多项目场景下不安全

**文件位置：** `src/utils/configLoader.ts:35-48`

`ConfigLoader` 以单例模式管理全局配置，`loadConfig(projectRoot)` 会覆盖之前加载的配置。如果守护进程同时服务多个项目，后加载的项目配置会覆盖前者。

**建议：** 改为实例化模式（按 `projectRoot` 缓存），或废除单例，将配置实例通过依赖注入传递。

---

### 17. DependencyGraph 构建时未扫描 shots 目录

**文件位置：** `src/core/DependencyGraph.ts:238-272`

```ts
const dirs = ['elements', 'scenes']; // shots 被排除？
```

如果 shots 的 frontmatter 中通过 `refs` 引用了其他 shots 或 elements，这些依赖关系不会被捕获。

**建议：** 确认是否为故意设计（shots 只允许依赖 elements，不允许 shots 间互依赖）。如果不是，请加入 `'shots'`。

---

### 18. 下载流缺少 response 错误处理

**文件位置：** `src/executor/providers/SeaDreamProvider.ts:135-143`

```ts
const writer = fs.createWriteStream(outputPath);
response.data.pipe(writer);
return new Promise((resolve, reject) => {
    writer.on('finish', () => { writer.close(); resolve(); });
    writer.on('error', reject); // 只处理了 writer 的错误
});
```

如果网络连接在下载中途断开，`response.data` 流会触发 `'error'` 事件，但此事件未被监听，导致 unhandled error。

**建议：** 同时监听 `response.data.on('error', reject)`。

---

### 19. 守护进程 WebSocket 消息缺少运行时校验

**文件位置：** `src/server/daemon.ts:69-76`

```ts
const msg: ClientMessage = JSON.parse(message.toString());
handleMessage(ws, msg);
```

客户端发送的任意 JSON 都会直接透传。如果 `msg.type` 缺失或 `msg.payload` 格式错误，`handleMessage` 内部可能抛出异常。

**建议：** 在调用 `handleMessage` 前校验 `msg.type` 是否为预定义的合法字符串，并校验 `msg.payload` 结构。

---

### 20. 去水印功能的法律与合规风险

**涉及文件：** `extension/watermark-engine.js`、`extension/sidepanel.js:26-64`

扩展提供了"去除水印"选项，通过 Canvas 处理尝试移除 AI 生成图片上的平台水印。这可能违反：
- 各 AI 平台的服务条款（Seedance、Gemini 等）
- 部分司法管辖区的数字千年版权法（DMCA）关于版权管理信息（CMI）的规定

**建议：** 在 UI 中添加显著的 TOS 合规警告，或考虑移除该功能。确保用户明确知晓相关法律风险。

---

## 🟢 低优先级 / 代码优化（Low）

### 21. 冗余的 reduce 调用

**文件位置：** `src/automation/JobGenerator.ts:187`

```ts
const total = executable.reduce((sum, j) => sum + 1, 0); // 可直接用 executable.length
```

---

### 22. SeedanceProvider 视频下载缺少超时

**文件位置：** `src/executor/providers/SeedanceProvider.ts:140-158`

```ts
const response = await axios({
    method: 'GET',
    url: videoUrl,
    responseType: 'stream'
    // 未设置 timeout
});
```

视频文件较大时，网络 stalls 会导致 Promise 永远挂起。

**建议：** 添加合理的 `timeout`（如 300000ms）和 `maxContentLength`。

---

### 23. tsconfig.json 缺少声明文件和 SourceMap

对于发布的 CLI 包，生成 `.d.ts` 和 source map 有助于调试和 IDE 智能提示。

**建议：**
```json
{
  "compilerOptions": {
    "declaration": true,
    "sourceMap": true
  }
}
```

---

### 24. 未使用的导入

**文件位置：** `src/core/SpecParser.ts:2`

```ts
import yaml from 'js-yaml'; // 从未使用
```

---

## ✅ 优秀实践（值得保持）

1. **Spooler Queue 物理状态机设计** — 文件系统作为持久化队列，天然支持断点续传和外部审计。
2. **结构化错误体系** — `OpsVError` 带有错误码、上下文和时间戳，便于日志分析和问题追踪。
3. **ReviewServer 的 Git 安全调用** — 使用 `execFileSync` 并传入数组参数（非 shell 字符串），有效防止命令注入。
4. **Zod 运行时校验** — `PromptSchema.ts` 和 `FrontmatterSchema.ts` 提供了良好的 Schema 定义范例。
5. **依赖图引擎** — 拓扑排序 + 循环依赖检测为构建流水线提供了坚实的理论基础。
6. **编译期 API Key 预检** — `queue compile` 阶段提前检查密钥配置，避免任务入队后才发现无法执行。

---

## 修复优先级建议

| 优先级 | 事项 |
|--------|------|
| **P0** | 修复 `SpoolerQueue` 竞态条件（原子出队） |
| **P0** | 修复 `content.js` 重复注入问题 |
| **P0** | 为 `QueueWatcher` 添加 SIGINT/SIGTERM 优雅退出 |
| **P1** | `findSourceDoc` 补充 `shots` 目录 |
| **P1** | `SpoolerQueue` 损坏文件处理（try-catch JSON.parse） |
| **P1** | 所有下载方法增加 HTTP 状态校验 |
| **P2** | 移除硬编码模型 ID 和端点 |
| **P2** | 统一异步文件 I/O |
| **P2** | 修复 `logger.ts` 编码问题 |
| **P3** | 从 npm `files` 中移除 `.env` |
| **P3** | 轮询增加指数退避 |
| **P3** | 评估去水印功能的法律合规性 |

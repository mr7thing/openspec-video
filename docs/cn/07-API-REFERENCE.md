# OpsV Provider 接口规范（v0.6.3�?
> 本文件记录所有图�?视频生成 Provider 必须遵守的接口契约与 Spooler Queue 接入规范�?
---

## 1. 架构革命（v0.6.0�?
**v0.6.0 彻底废除�?Dispatcher 调度模式�?* 旧版 `ImageModelDispatcher` / `VideoModelDispatcher` 已被删除，取而代之的是基于物理文件的 **Spooler Queue** 架构�?
```
之前（已废弃 �?Dispatcher 模式�?
  CLI �?Dispatcher.dispatch(jobs) �?provider.generateAndDownload(job, model, apiKey, path)
  问题：Dispatcher 必须知道所�?Provider 的注册关�?�?中心化瓶�?
之后（现�?�?Spooler Queue 模式�?
  opsv generate �?jobs.json (纯意�?
  opsv queue compile �?.opsv-queue/pending/{provider}/UUID.json (原子载荷)
  opsv queue run {provider} �?QueueWatcher �?provider.processTask(task)
  优势：物理解耦，新增 Provider 零侵入，支持断点恢复
```

---

## 2. 接口定义

### 2.1 Provider 通用接口

所�?Provider 必须实现 `processTask` 方法，由 QueueWatcher 逐一调用�?
```typescript
// Provider 接口契约（v0.6.0�?interface SpoolerProvider {
    /** 处理从物理信箱中取出的单个原子任�?*/
    processTask(task: SpoolerTask): Promise<any>;
}

// SpoolerTask 结构
interface SpoolerTask {
    uuid: string;          // 任务唯一 ID
    payload: any;          // 编译器产出的 API 特定载荷
    metadata: {
        provider: string;  // 来源 Provider 标识
        createdAt: string; // 创建时间
    };
}
```

### 2.2 QueueWatcher 调用协议

```typescript
// QueueWatcher 逐一消费 �?�?instanceof，无分支
const task = await queue.dequeue();
const result = await provider.processTask(task);
await queue.markCompleted(task.uuid, result);
// 失败�?
await queue.markFailed(task.uuid, error);
```

---

## 3. 现有 Provider 一�?
### 图像 Provider

| Provider �?| 文件 | 供应�?| 队列 Provider �?|
|-------------|------|--------|------------------|
| `SeaDreamProvider` | providers/SeaDreamProvider.ts | 火山引擎 | `seadream` |
| `SiliconFlowProvider` | providers/SiliconFlowProvider.ts | SiliconFlow | `siliconflow` |
| `MinimaxImageProvider` | providers/MinimaxImageProvider.ts | MiniMax | `minimax` |

### 视频 Provider

| Provider �?| 文件 | 供应�?| 队列 Provider �?|
|-------------|------|--------|------------------|
| `SeedanceProvider` | providers/SeedanceProvider.ts | 火山引擎 | `seedance` |
| `SiliconFlowProvider` | providers/SiliconFlowProvider.ts | SiliconFlow | `siliconflow` |
| `MinimaxVideoProvider` | providers/MinimaxVideoProvider.ts | MiniMax | `minimax` |

### ComfyUI Provider

| Provider �?| 文件 | 说明 | 队列 Provider �?|
|-------------|------|------|------------------|
| `ComfyUILocalProvider` | providers/ComfyUILocalProvider.ts | 本地 ComfyUI 实例 | `comfyui_local` |
| `RunningHubProvider` | providers/RunningHubProvider.ts | RunningHub 云端 | `runninghub` |

---

## 4. 新增 Provider 强制规范

### 4.1 三条铁律（继承自防御�?API 协议�?
1. **深度穿透解�?*：不假设响应体结构唯一。兼�?`data.id`、`data.data.id` 多种变体，使用防御性代码�?2. **强力证据式日�?*：任何非 2xx 或格式异常必�?`JSON.stringify(rawResponse)` 记录完整载荷，禁止模�?`undefined` 输出�?3. **Axios 防空逻辑**：必须区�?`error.response`（API 业务错误）和 `error.code`（如 `ETIMEDOUT`，网络中断）�?
### 4.2 接入步骤清单 (v0.6.0 流程)

```
需要实现：
  �?创建 Provider 类文�? src/executor/providers/YourProvider.ts
  �?实现 processTask(task: SpoolerTask): Promise<any>
  
  �?processTask 内部实现�?     1. �?task.payload 读取参数
     2. POST 提交生成请求（按官方 API 格式�?     3. 轮询直到完成（建议间�?3-5 秒，超时抛异常）
     4. 下载图片/视频 Buffer，写入目标路�?     5. 返回结果对象

需要注册：
  �?�?src/commands/queue.ts �?run 命令中添�?provider 分支
  �?�?api_config.yaml 中配�?provider �?type 字段

禁止�?  �?创建新的 Dispatcher（Dispatcher 模式已废弃）
  �?�?Provider 内部使用 instanceof 检测其�?Provider
  �?�?Provider 内部假设载荷结构（从 task.payload 读取�?```

### 4.3 超时与退避约�?
```typescript
// Provider 内部应自行管理超�?const TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const deadline = Date.now() + TIMEOUT_MS;
let waitTime = 5000;  // 初始轮询间隔 5 �?
while (Date.now() < deadline) {
    const status = await pollStatus(requestId);
    if (status === 'completed') break;
    await sleep(waitTime);
    waitTime = Math.min(waitTime * 2, 30000);  // 指数退避，上限 30 �?}

if (Date.now() >= deadline) {
    throw new Error(`生成超时 (${TIMEOUT_MS / 1000}s): ${task.uuid}`);
}
```

**指数退避策略：** 视频生成 Provider（Seedance、SiliconFlow）采用指数退避轮询，降低长视频生成时�?API 压力�?- �?1 次：5 �?- �?2 次：10 �?- �?3 次：20 �?- �?4 次及以后�?0 秒（封顶�?
---

## 5. Spooler Queue 物理状态机

```
.opsv-queue/
├── inbox/{provider}/        # 待执�?�?compile 投递的原子 JSON
├── working/{provider}/      # 执行�?�?QueueWatcher 原子提取
├── done/{provider}/         # 已完�?失败 �?归档含结果或错误
└── corrupted/{provider}/    # 已损�?�?JSON 解析失败时隔�?```

### 状态流�?
```mermaid
stateDiagram-v2
    [*] --> inbox: queue compile
    inbox --> working: QueueWatcher.dequeue() [原子 fs.rename]
    working --> done: processTask 成功
    working --> inbox: SIGINT/SIGTERM 回滚
    working --> corrupted: JSON 解析失败
```

### 原子性保�?
`dequeue()` 使用 `fs.rename(inboxPath, workingPath)` 实现原子状态转移：
- POSIX `rename` 保证同一时刻只有一个消费者能成功移动文件
- `ENOENT` 优雅处理：文件已被其他进程取走时返回 `null`
- 无需内存锁或外部依赖（Redis/ZooKeeper�?
---

## 6. 编译器协�?
### StandardAPICompiler
- �?`Job` 对象序列化为 UUID.json 原子文件
- 注入 provider 元数�?- 适用于所有原�?HTTP API（SeaDream, Minimax, SiliconFlow�?
### ComfyUITaskCompiler
- 加载 Addon 中的 JSON 工作流模�?- 通过节点标题约定（`input-prompt`, `input-image1`）进行参数注�?- 适用�?ComfyUI 类执行环境（Local / RunningHub�?
---

> *「物理状态机替代内存调度，文件即证据，目录即状态。�?
> *OpsV v0.6.3 | 更新时间: 2026-04-22*

# OpsV 插件技术内幕：给柒叔的报告

柒叔，这篇文档深度解析 OpenSpec-Video (OpsV) 插件的核心机制，回答您关于**内容关联**、**队列状态**、**测试验证**及**Debug完善度**的疑问。

## 1. 插件如何识别页面内容与任务关联？(The "Association" Logic)

目前，Gemini 的 Web 界面并没有提供官方 API 来告诉我们"这张图属于刚才的哪个 Prompt"。因此，我们采用了一种**启发式（Heuristic）的时序关联机制**。

**核心逻辑：**
1.  **动作触发**：插件自动化脚本 (`content.js`)把 Prompt 填入输入框并点击 "Send" 按钮。
2.  **快照基准**：在点击发送前，脚本会记录当前页面上已有的 `<img>` 标签数量 (`initialImgCount`)。
3.  **增量监听**：使用 `MutationObserver` 监听 DOM 树的变化。
4.  **关联判定**：
    *   当页面上出现的 `<img>` 数量大于 `initialImgCount` 时，只要这张新图满足特定条件（如：尺寸大于 200x200，且 src 是 HTTP 链接或 Base64 数据），我们就**认定**这是当前任务生成的图片。
    *   **"断点续传"补充机制 (`CHECK_LAST_IMAGE`)**：如果在自动运行过程中页面刷新了，插件重连后会触发 `CHECK_LAST_IMAGE`。它会扫描页面上**最后一张**符合条件的大图，并将其视为当前任务的结果。这是一种"兜底"策略。

**局限性与哲学思考：**
这种方式本质上是"基于对现象的观察"而非"基于对本质 ID 的追踪"。如果 Gemini 一次生成多张图，或者是网络延迟导致顺序错乱，理论上存在误判风险。但在单线程顺序执行（Run All）的场景下，这种**"发令枪响后抓到的第一个新东西就是猎物"**的逻辑是目前最实用且低侵入的方案。

---

## 2. 队列状态查询机制的设计 (State Management)

队列状态采用了**双重来源（Dual Source of Truth）**的设计，兼顾了持久性与实时性。

### A. 静态真理：Server (File System)
*   **存储**：`jobs.json` 文件。
*   **角色**：这是任务的**总账本**。不论浏览器如何刷新，服务器上的文件始终记录了完整的任务列表和内容。
*   **通信**：Extension 通过 WebSocket 发送 `GET_JOBS`，Server 读取文件并返回 `JOBS_LIST`。

### B. 动态现场：Extension (Local Storage)
*   **存储**：`chrome.storage.local` 中的 `queueState` 对象 `{ isRunningAll: boolean, currentJobIndex: number, timestamp: number }`。
*   **角色**：这是**执行现场的快照**。它记录了"如果刚才没断电，我现在应该干什么"。
*   **持久化时机**：每次任务开始 (`runJob`) 或任务完成 (`ASSET_SAVED`) 时，都会立即写入这个快照。
*   **恢复机制**：
    *   插件初始化 (`restoreState`) 时读取快照。
    *   如果发现 flag 是 `isRunningAll: true` 且时间戳在 24 小时内，它会立即进入"战斗状态"，恢复 UI 的"Stop"按钮，并尝试去 Gemini 页面"查岗" (`checkRecovery`)。

**哲学意涵：**
Server 负责**"应然"**（有哪些任务需要做），Extension 负责**"实然"**（我现在做到哪一步了）。两者结合，确保系统即便是"失忆"（刷新页面）也能找回自我。

---

## 3. 如何进行测试验证？(Verification Strategy)

验证这套机制需要模拟"非正常"场景，因为正常场景（一直开着页面不动）太简单了。

**测试剧本：**

1.  **基础链路测试**：
    *   运行 `Run All`。
    *   观察第一张图生成 -> 自动保存 -> 第二个任务自动开始。
    *   *预期：流程顺滑，无需人工干预。*

2.  **"断电"测试（Persistence）**：
    *   在任务运行中（例如第 3 个任务正在生成时），**关闭 Sidepanel** 或 **切换到此时不相关的 Tab**。
    *   重新打开 Sidepanel。
    *   *预期：UI 依然显示"Stop"按钮（表示运行中），且通过日志可以看到它记住了当前是第 3 个任务。*

3.  **"失忆"恢复测试（Recovery）**：
    *   在任务运行中，**手动刷新 Gemini 网页**。
    *   此时连接断开，Sidepanel 变灰。需等待网页加载完成。
    *   网页加载完后，Sidepanel 自动重连。
    *   *预期：插件自动检测到页面上已存在的图（或者是新生成的图），抓取回来，然后像没事人一样继续运行第 4 个任务。*

---

## 4. Debug 的断点代码是否完善？

目前的 Debug 代码采用了**"高可视性日志"（High-Visibility Logging）**策略，而非传统的 IDE 断点（因为在 Chrome Extension 环境下，Console Log 往往比断点更直观且不阻断异步流）。

**已覆盖的关键节点（Checkpoints）：**

*   **[OpsV]** 前缀：所有关键日志都加了统一前缀，方便在 Console 中过滤。
*   **通信层**：WebSocket 的连接、断开、重连都有日志。
*   **决策层**：`sidepanel.js` 中 `saveState` 和 `restoreState` 会打印完整的状态对象，方便查看到底存了什么、读了什么。
*   **执行层**：`content.js` 中：
    *   找不到输入框？-> 打印 Warning 并 Alert。
    *   找不到发送按钮？-> 打印 Error 并 Alert。
    *   找到疑似结果图？-> 打印图片的 URL 和尺寸。
*   **容错层**：`checkRecovery` 会明确打印"Asking content script to check..."以及后续的重试日志。

**评价：**
目前的日志覆盖度对于**逻辑流（Flow Logic）**的排查是完善的。我们能清楚知道"卡在哪一步"。
*   **待优化点**：目前对于 DOM 结构的日志是基于"当前 Gemini 版本"的。如果 Google 改了 class 名，日志会报错找不到元素，但可能无法直接告诉我们"新的 class 名是什么"。这通常需要人工介入 inspect 页面。

**总结：**
这套系统已经从一个"单纯的脚本"进化为一个**具备自我恢复能力的 Agent**。它不再假设世界是完美的，而是假设世界随时会崩塌（刷新、断网、误触），并为此做好了准备。

## 5. 实战指南：如何读取日志埋点？(How to Read Logs)

柒叔，要像外科医生一样查看系统的"心电图"，你需要打开以下三个窗口：

### A. 扩展逻辑日志 (Sidepanel Console)
这里能看到：**任务调度、状态保存/恢复、WebSocket 通信**。
1.  在 Sidepanel 任意空白处 -> **右键** -> **Inspect (检查)**。
2.  点击顶部标签栏的 **Console**。
3.  **关键日志**：
    *   `OpsV state saved: {isRunningAll: true, ...}` -> 证明状态存住了。
    *   `Restoring queue state: ...` -> 证明页面重开后读档成功。
    *   `Resuming queue at index: 3` -> 证明它知道该继续干第 4 个活了。
    *   `Asking content script to check for result...` -> 证明它正在去页面"查岗"。

### B. 页面执行日志 (Content Script Console)
这里能看到：**DOM 操作、图片检测、页面交互**。
1.  在 Gemini 网页任意空白处 -> **右键** -> **Inspect (检查)**。
2.  点击 **Console**。
3.  **关键日志**：
    *   `OpsV Content: Received Job ...` -> 收到了干活指令。
    *   `OpsV: Clicking send button` -> 点击了发送。
    *   `Monitoring generation...` -> 开始盯着屏幕等图。
    *   `New image detected: https://...` -> 抓到了新生成的图！
    *   `OpsV: Found potential existing result: ...` -> 刷新后恢复时，发现了之前生成的图。

### C. 服务器日志 (Terminal)
这里能看到：**文件读写、资产保存**。
1.  就是你运行 `opsv serve` 的那个黑框框。
2.  **关键日志**：
    *   `[OpsV Daemon] Client connected` -> 插件连上了。
    *   `[OpsV Daemon] Saved asset: videospec/assets/...` -> 图片成功存入硬盘！

**Debug 顺口溜：**
*   **不动了？** 看 Sidepanel Console，是不是还没发指令。
*   **没反应？** 看 Gemini Console，是不是找不到按钮 (报错 `OpsV Error`)。
*   **没存图？** 看 Terminal，是不是文件权限或路径问题。

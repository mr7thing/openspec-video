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

---

## 6. 核心工作流详解 (Core Workflow Explained)

OpsV 已经从简单的 Prompt 搬运工进化为**配置驱动 (Configuration-Driven)** 的自动化导演系统。

### A. 大脑：workflow.json

你的项目现在有一个 `videospec/workflow.json` 文件，它是整个生成的指挥棒。它定义了三个核心阶段：

1.  **Characters (角色设计)**
    *   **输入**：扫描 `videospec/assets/characters/*.md`。
    *   **动作**：读取 MarkDown，提取 `id`, `name`, `description`，以及**Markdown 图片链接**。
    *   **输出**：生成角色三视图，存入 `artifacts/characters/`。
2.  **Scenes (场景设计)**
    *   **输入**：扫描 `videospec/assets/scenes/*.md`。
    *   **输出**：生成环境概念图，存入 `artifacts/scenes/`。
3.  **Story (分镜绘制)**
    *   **输入**：读取 `videospec/stories/Script.md`。
    *   **智能关联**：当脚本里写 `[Momo]` 时，系统会自动去 `artifacts/characters/` 找有没有已生成的 `momo.png`。如果有，它会**把这张图作为参考图（Reference Image）上传给 Gemini**，并告诉它 "Draw this character via uploaded reference"。

### B. 执行命令 (CLI Modes)

不再是无脑生成，而是分阶段执行：

```bash
# 1. 先搞定角色
opsv generate --mode characters

# 2. 再搞定场景
opsv generate --mode scenes

# 3. 最后画分镜 (此时系统会自动引用前两步生成的图)
opsv generate --mode story
```

### C. 参考图机制 (Reference Injection)

这是最酷的部分。你可以在 `.md` 文件里直接贴本地图片链接：

```markdown
# assets/characters/momo.md
name: Momo
...
![参考图](./ref_images/momo_sketch.png) 
<-- 系统会自动识别这个链接，读取文件，并在生成时上传给 Gemini！
```

**Prompt 变化：**
一旦检测到图片，发给 Gemini 的 Prompt 会自动追加：
> **Reference Images**: 1 images provided. Please use them in order as visual references.

配合插件的自动上传功能，Gemini 就能看着你给的参考图（或者是上一轮生成的角色图）来画分镜，从而最大限度保持角色一致性。

---

## 7. 命令行完全手册 (CLI Reference)

以下是 OpsV 提供的所有命令及其详细说明。

### 核心命令

#### `opsv init [projectName]`
**功能**：初始化一个新的视频策划项目。
*   **作用**：
    *   创建标准目录结构 (`videospec/`, `artifacts/`)。
    *   提供以 `_sample.md` 结尾的模板文件（如 `project_sample.md`）。这强制要求您在修改确认后重命名为正式标准文件。

#### `opsv new <type> [name] [options]`
**功能**：AI 驱动的文档起草向导。
*   **参数**：
    *   `-f, --from <file>`: 指定背景文档（例如 `--from videospec/project.md`）。
    *   `-t, --target <file>`: 指定要生成的最终输出文件路径（例如 `--target videospec/shotslist.md`）。
    *   `-v, --variants <number>`: 生成的候选方案数量，默认是 1。
*   **工作流 (Document-Driven Pipeline)**：
    当带上这些参数时，CLI 会给您的 Agent（Director）发布起草任务。Agent 会先将所有 `<n>` 份草图写在 `artifacts/scripts/` 隔离区。等您在聊天中确认了其中一个方案，Agent 才会正式把它 Promote（晋升）到指定的 `--target` 路径。

#### `opsv generate [options]`
**功能**：读取项目配置，生成 AI 生图/生视频任务队列。
*   **快捷参数**（不再需要手写原先啰嗦的 `--mode`）：
    *   `-c, --charactor`: 批量生成所有角色概念图。
    *   `-s, --scene`: 批量生成所有场景概念图。
    *   `-S, --shotlist`: 读取剧本和分镜表，生成分镜任务。
    *   `-p, --preview`: 预览模式（只挑重点生成）。
    *   `--shots <list>`: 精确生成指点镜头（比如 `--shots 1,5,10`）。
*   **副作用**：
    *   分镜生图生成的产物，现在会**被强制放入隔离区** `artifacts/assets/shots/<ShotID>/`。
    *   您可以在这里查看这三个文件：`prompt.txt`、`ref.png`、`output.mp4`。如果满意，可以将其剪切到正式区 `videospec/assets/shots/<ShotID>/` 永久保存。
    *   生成任务会自动唤醒后台 Server，您直接去浏览器点插件即可。
#### `opsv review <type>` (New)
**功能**：交互式审阅并归档生成的资产。
*   **参数**：
    *   `<type>`: `characters` 或 `scenes`。
*   **交互流程**：
    1.  系统列出 `Project-mv/artifacts/<type>/` 下所有未归档的图片。
    2.  对于每一张图，询问：
        *   `✅ Approve`: 将图片移动到 `videospec/assets/<type>/<id>_ref.png`，并自动更新对应的 markdown 文件，插入引用链接。
        *   `📝 Feedback`: 输入简短的修改意见。意见会被追加到 `videospec/changes/YYYY-MM-DD-Review-Feedback.md`，用于后续迭代。
        *   `❌ Discard`: 删除该图片。
        *   `⏭️ Skip`: 跳过不处理。
*   **用途**：这是连接"生成"与"使用"的关键一步。通过 Review 的图片会自动成为后续生成的参考图。

### F. AI 智能引擎 (Agent AI) (Updated)

OpsV 2.0 采用 **Skill-Driven** 架构。CLI 工具保持纯粹，复杂的思考和决策交由您的 AI Agent（如 Antigravity, Gemini Code Assist）通过 "Skills" 来完成。

**核心理念**：
*   **不依赖 API Key**：`opsv` binary 不需要内置 API Key。
*   **Agent 驱动**：AI Agent 读取 `SKILL.md`，根据您的指令（如 "生成预览"），分析剧本，然后调用 `opsv generate --shots "1,5,10"`。

**功能实现**：
1.  **AI 编剧 (Skill: `opsv-director`)**：Agent 根据您的 Logline，直接编辑 `stories/Script.md`。
2.  **AI 选片 (Skill: `opsv-producer`)**：Agent 分析剧本，挑选关键镜头，运行 `opsv generate --shots`。

### D. 预览模式 (Preview Mode) (Updated)

您可以手动指定要生成的镜头，或者让 Agent 帮您选：

```bash
# 手动生成 Shot 1, 5, 10
opsv generate --shots 1,5,10
```

或者直接告诉 Agent："帮我生成几个预览镜头。" (Agent 会自动分析并执行上述命令)。

如果你不想一次性生成所有图片，或者想快速查看效果，可以使用自动预览模式：

```bash
opsv generate --preview
```

**功能**：
*   **角色/场景**：每个 Asset 只生成 1 张图（通常是 Character Sheet）。
*   **故事**：只生成每场戏的第一个镜头 (Key Shot)。

### E. 智能引用 (@Reference) (New)

在 Script 中，现在支持更灵活的引用方式：

```markdown
**Shot 1**: @Momo walks into the @Kitchen.
```

系统会自动：
1.  解析 `@Momo` -> 找到 `assets/characters/momo.md`。
2.  查找 `momo_ref.png` (已审核的参考图)。
3.  如果没有审核图，尝试找 `Project-mv/artifacts/characters/momo.png` (刚生成的草图)。
4.  将找到的图片作为 Reference Image 注入 Prompt。
**功能**：启动后台服务。
*   **说明**：通常不需要手动运行，`opsv generate` 会自动拉起它。但如果你想确保持续运行，可以手动执行。
*   **日志**：服务启动后会在后台运行，不会阻塞当前终端。

#### `opsv stop`
**功能**：停止后台服务。
*   **说明**：当你不需要再生成图片，或者需要重启服务（例如更新了代码）时使用。

#### `opsv status`
**功能**：检查后台服务状态。
*   **输出示例**：
    *   `✅ OpsV Server is RUNNING (PID: 12345)`
    *   `🔴 OpsV Server is STOPPED`

### 辅助命令

#### `opsv proposal <title>`
**功能**：创建一个新的变更提案 (RFC)。
*   **用法**：`opsv proposal "Add New Character"`
*   **作用**：在 `videospec/changes/` 下创建一个带日期的 Markdown 文件，用于记录设计变更思路。这是"代码即文档"理念的体现。

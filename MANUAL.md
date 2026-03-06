# OpenSpec-Video (OpsV) 用户手册

本文档详细说明 `opsv` 命令行工具的使用方法，以及 V2 迭代式视频创作工作流的最佳实践。

## 1. 快速开始 (Quick Start)

### 安装
```bash
# 全局安装 (推荐)
npm install -g openspec-video-0.1.1.tgz
```

### 初始化项目
```bash
# 在当前目录初始化 (推荐)
opsv init

# 或者指定新目录
opsv init MyNewMovie
```
*执行后，当前目录将包含 `.agent`, `.antigravity`, `videospec` 等核心结构。*

---

## 2. CLI 命令详解

### `opsv init [path]`
初始化一个新的 OpenSpec-Video 项目结构。
- **参数**: `[path]` (可选) - 默认为当前目录 (`.`)。
- **作用**: 释放标准模板 (Templates) 到目标目录。

### `opsv proposal <title>`
创建一个新的变更提案 (RFC)。
- **参数**: `<title>` - 提案标题 (如 "Add Cyberpunk Theme")。
- **作用**: 在 `videospec/changes/` 下生成 `YYYY-MM-DD-title.md` 模板文件。
- **用途**: 用于团队协作中记录对由 AI 生成的 Spec 的修改建议。

### `opsv generate`
**核心核心**: 将 `stories/Script.md` 编译为自动化任务队列。
- **作用**: 
    1. 读取 `videospec/project.md` (全局配置)。
    2. 检查 `videospec/elements` 和 `videospec/scenes` 中的文档结构。
    3. 解析 `videospec/shots` (分镜文档)。
    4. 只有资产文档中通过 `![Draft](path)` 挂载过且真实存在的图片，才会被当作最终合规的 `reference_images`。
    5. 生成 `queue/jobs.json` 和对应的历史备份 `artifacts/drafts_X/`。
- **产物**: `queue/jobs.json` 是浏览器自动化 Agent (Executor) 的直接输入源。

### `opsv review [target.md]`
这是一个基于“文档驱动 (Document-Driven)”的参考图确认工具。你的文档将成为受控图集的唯一真理域 (Source of Truth)。
- **作用**: 它会自动向 Markdown 文档底部的正文区域，写入指向生成草图的引用图片语法 `![Draft](...)`。当且仅当文档中保留的链接，在后续的 `generate` 时才会被视为参考图送给图像模型。你可以肉眼确认并在 Markdown 里删撤掉不想要的变体链接。
- **模式 1 (默认追加最新)**: `opsv review`，自动扫描所有资产与分镜，为其在 `drafts_N` 中自动检索最新的一次生成图片，并写入到对应的 `.md` 中。
- **模式 2 (全量草稿挂载)**: `opsv review --alldrafts`，把历史生成的 `drafts_1`..`drafts_15` 里的同名切图，一股脑按降序写入到 `.md` 作为备选池，供导演手动删减。
- **模式 3 (聚焦单文件)**: `opsv review videospec/elements/Momo.md [--alldrafts]`，只对指定的单一角色或分镜文档进行上述刷写操作。

### `opsv serve` (或 `start`)
启动后台自动化服务 (Daemon)。
- **作用**: 
    - 启动 WebSocket 服务器 (默认端口 3000)。
    - 监听 Chrome 插件的连接。
    - 接收插件回传的图片/视频并自动归档。
- **状态检查**: `opsv status`
- **停止**: `opsv stop`

---

## 3. Chrome 插件 (OpsV Companion) 使用指南

OpsV Companion 是连接本地文件系统与云端 AI (Gemini) 的桥梁。

### 3.1 安装插件 (初次使用)
由于这是一个开发者工具，目前需要通过"加载已解压扩展"的方式安装。

1.  **找到插件目录**: 确认你的项目目录中包含 `extension/` 文件夹 (例如 `C:\Gemini\mv-momo\extension`).
2.  **打开扩展管理页**: 在 Chrome 地址栏输入 `chrome://extensions/` 并回车。
3.  **开启开发者模式**: 点击页面右上角的 **"开发者模式" (Developer mode)** 开关，使其变蓝。
4.  **加载扩展**:
    - 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)** 按钮。
    - 在弹出的文件选择框中，导航并选中项目的 `extension/` 文件夹。
5.  **固定图标**: 安装后，点击浏览器右上角的"拼图"图标，找到 "OpenSpec-Video Companion" 并点击"图钉"📌将其固定在工具栏，方便使用。

### 3.2 启动与连接
插件需要配合本地 `opsv` 服务才能工作。

1.  **启动本地服务**:
    在终端中运行生成命令（会自动启动服务）：
    ```bash
    opsv generate
    ```
    或者手动启动：
    ```bash
    opsv start
    ```
    *成功标志: 终端显示 `✅ OpsV Server is RUNNING`*

2.  **打开侧边栏**:
    - 点击浏览器工具栏上的 OpsV 图标，或使用快捷键打开侧边栏。
    - 在侧边栏的下拉菜单中选择 "OpenSpec-Video Companion"。

3.  **检查连接状态**:
    - 观察侧边栏顶部的 **状态指示灯**：
        - 🟢 **绿色 (Connected)**: 连接成功！你可以开始执行任务。
        - 🔴 **红色 (Disconnected)**: 连接断开。请检查 `opsv start` 是否运行，或点击 "Refresh" 按钮重试。

### 3.3 执行批量生成
1.  **准备环境**: 在 Chrome 中打开 [Gemini (gemini.google.com)](https://gemini.google.com)。
2.  **接收任务**: 侧边栏会自动显示来自 `jobs.json` 的任务列表 (例如 "Generate Character: Neo")。
3.  **开始生成**:
    - 点击任务条目右侧的 **"Run"** 按钮。
    - **自动化过程**:
        1.  插件自动将 Prompt 填入 Gemini 对话框。
        2.  自动点击发送。
        3.  等待图片生成完毕。
        4.  **自动抓取**: 插件检测到生成的图片后，会自动将其发送回本地服务器。
    - *观察终端*: 你会看到 `[OpsV Daemon] Saved asset: videospec/assets/characters/neo.png` 的提示。

### 3.4 故障排查
- **连不上 (红色状态)**:
    - 运行 `opsv status` 检查服务是否存活。
    - 确保端口 `3000` 未被占用。
- **不填入 Prompt**:
    - 确保当前标签页是 `gemini.google.com`。
    - 刷新页面后重试。

---

## 4. V2 迭代式工作流指南

我们推荐采用 **"概念先行 -> 逐步细化"** 的创作模式。

### 阶段一：故事开发 (Story Development)
> **Goal**: 确定剧本。

1.  **AI 提案**: 告诉 Agent 你的核心点子，让它在 `videospec/stories/concepts.md` 中生成 3 个不同方向的故事梗概。
    *   *Prompt 示例*: "Create 3 sci-fi mystery concepts about a lost robot."
2.  **选定与撰写**: 选中一个方案，让 Agent 撰写 `Script_Draft_v1.md`。
3.  **定稿**: 修改满意后，重命名为 `videospec/stories/Script.md`。

### 阶段二：概念设计 (Concept Design)
> **Goal**: 确定视觉风格与角色形象。

1.  **Casting Call**: 让 Agent 分析剧本，在 `assets/characters/casting_call.md` 中列出所有角色小传。
2.  **群像定调 (Group Shot)**: 
    *   不要急着生成单人图！先生成一张**包含主角团的群像图**。
    *   *用途*: 确认画风 (Art Style)、角色身高差、服装统一性。
    *   *产物*: `assets/concepts/group_protagonists.png`。
3.  **独立定妆**: 
    *   风格确认后，基于群像图生成每个角色的 **三视图 (Character Sheet)**。
    *   *产物*: `assets/characters/[id]_sheet.png`。
    *   *操作*: 在 `assets/characters/[id].md` 中引用该图片。

### 阶段三：自动化拍摄 (Production)
> **Goal**: 批量生产分镜与视频。

1.  **生成任务队列**:
    ```bash
    opsv generate
    ```
    *系统会自动检查并启动后台服务 (OpsV Server)。*

2.  **执行拍摄 (Browser Companion)**:
    - 打开 Gemini (gemini.google.com)。
    - 打开 Chrome 侧边栏 (OpsV Companion)。
    - **连接状态**: 确认指示灯为 🟢 (Green)。
    - **执行**: 点击任务列表中的 "Run" 按钮。
    - **自动归档**: 观察插件自动填入 Prompt -> 生成 -> 回传。
    - *控制台*: 你会在 CLI 看到 `[OpsV Daemon] Saved asset: ...` 的日志。

---

## 5. 目录结构参考

```text
/
├── .antigravity/       # [系统] 规则与工作流
├── videospec/
│   ├── project.md      # 项目总控
│   ├── assets/         # 资产库
│   │   ├── characters/ # 角色 (Markdown + Images)
│   │   ├── scenes/     # 场景
│   │   └── concepts/   # [V2] 概念图/群像
│   ├── stories/        # 剧本
│   │   ├── Script.md   # **主剧本**
│   │   └── concepts/   # 废弃/备选案
│   └── changes/        # 变更记录
└── queue/
    └── jobs.json       # 机器可读的任务文件
```

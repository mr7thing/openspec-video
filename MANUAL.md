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
    2. 解析 `videospec/stories/Script.md` (剧本)。
    3. 验证 `videospec/assets` 中的角色/场景引用。
    4. 生成 `queue/jobs.json`。
- **产物**: `queue/jobs.json` 是浏览器自动化 Agent (Executor) 的直接输入源。

### `opsv serve` (或 `start`)
启动后台自动化服务 (Daemon)。
- **作用**: 
    - 启动 WebSocket 服务器 (默认端口 3000)。
    - 监听 Chrome 插件的连接。
    - 接收插件回传的图片/视频并自动归档。
- **状态检查**: `opsv status`
- **停止**: `opsv stop`

---

## 3. Chrome 插件安装与配置

OpsV 配套了一个强大的浏览器插件，用于自动化 Gemini 操作。

### 安装步骤
1.  打开 Chrome 浏览器，访问 `chrome://extensions/`。
2.  开启右上角的 **"开发者模式" (Developer mode)**。
3.  点击 **"加载已解压的扩展程序" (Load unpacked)**。
4.  选择项目目录下的 `extension/` 文件夹。
5.  插件安装成功后，点击浏览器工具栏的侧边栏图标，选择 "OpsV Companion"。

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

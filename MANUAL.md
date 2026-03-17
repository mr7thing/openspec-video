# Videospec (OpsV) 用户手册

本文档详细说明 `opsv` 命令行工具的使用方法，以及 0.3.x 视频创作工作流的最佳实践。

## 1. 快速开始 (Quick Start)

### 安装
```bash
# 从 NPM 全局安装 (推荐)
npm install -g videospec

# 或者从本地包安装
npm install -g ./videospec-0.3.1.tgz
```

### 初始化项目
```bash
# 在当前目录初始化
opsv init
```
*执行后，CLI 会提示您选择要支持的 AI 助手（Gemini / OpenCode / Trae）。*

---

## 2. CLI 命令详解

### `opsv init [projectName]`
初始化一个新的 Videospec 项目结构。
- **参数**: `[projectName]` (可选) - 若提供则创建新目录。
- **交互选型**: 支持勾选集成 `Gemini`, `OpenCode`, 和 `Trae` 的配置。

### `opsv generate [targets...]`
**核心编译**: 将分镜脚本和资产编译为自动化任务队列。
- **作用**: 
    1. 读取 `videospec/project.md` (全局配置)。
    2. 检查 `videospec/elements` 和 `videospec/scenes` 中的文档结构。
    3. 解析 `videospec/shots/Script.md` (静态分镜)。
    4. 生成 `queue/jobs.json` 供 Executor 执行。
- **过滤选项**:
    - `--preview`: 仅生成标注为预览的镜头。
    - `--shots 1,5`: 仅生成指定序号的镜头。

### `opsv review [路径]`
文档驱动的参考图确认工具。
- **默认行为** (0.3.2+): 只扫描最新一批 `artifacts/drafts_N/`，读取其 `jobs.json`，将图片精准回写至对应的 Script.md 或 Element 文档。
- **参数**:
    - `[路径]`：指定任意 `drafts_N/` 目录或 `jobs.json` 文件进行定点审阅。
    - `--all`: 全量扫描所有历史 `drafts_*/` 目录。

### `opsv animate`
**动态编译**: 将 `shots/Shotlist.md` 编译为视频生成队列 `video_jobs.json`。此时引擎还会把包含的所有图片路径转化为绝对环境路径。

### `opsv execute-image`
**图像生成执行器** (0.3.3 新增): 执行队列中所有 `image_generation` 类型的任务。
- **默认模型**: `seadream-5.0-lite` (由 SeaDream 5.0 提供动力)。
- **选项**:
    - `-m, --model <model>`: 切换目标模型。
    - `-c, --concurrency <num>`: 设置并发数（默认 1）。
    - `--skip-failed`: 跳过失败任务继续执行。
    - `--dry-run`: 仅验证任务参数，不实际调用接口。
  ### 2. 关键配置
由于 SeaDream 5.0 运行在火山引擎（Volcengine）之上，您需要：
1. **配置文件**：将 `.env/secrets.env` 复制并重命名为项目根目录下的 `.env`。
2. **填入密钥**：在 `.env` 中设置 `VOLCENGINE_API_KEY=您的密钥`。

### `opsv serve`
启动本地 WebSocket 守护进程。
- **默认端口**: `3061`
- **作用**: 监听并接收来自浏览器自动化环境（如 Extension）的任务或结果推送。

---

## 3. AI 助手适配指南

OpsV 0.2.28+ 实现了真正的多辅助工具支持。

### 3.1 Gemini (Legacy)
使用 `GEMINI.md` 作为核心指令。直接在 Gemini 侧边栏开启对话即可识别项目规则。

### 3.2 OpenCode
自动识别 `.opencode/` 目录和 `AGENTS.md`。适合需要深度集成代码能力的场景。

### 3.3 Trae (手动模式)
由于 Trae 暂不支持自动加载本地工程级指令，需执行以下操作：
1. **复制**: 打开项目根目录的 `AGENTS.md`，复制其全文。
2. **粘贴**: 在 Trae 中创建新智能体，将内容粘贴到“自定指令”中。
3. **生效**: 创建后，Trae 会自动读取 `.trae/rules/` 下的 `opsv_core.md` 和 `opsv_workflow.md`。

---

## 4. 规范目录结构

```text
/
├── .agent/skills/      # AI 技能包
├── .antigravity/       # 核心规则与工作流
├── videospec/          # 唯一真相源
│   ├── project.md      # 项目全局配置
│   ├── elements/       # 角色、道具 (.md)
│   ├── scenes/     # 场景设定 (.md)
│   └── shots/
│       ├── Script.md   # 静态美术分镜
│       └── Shotlist.md # 动态视频台本
├── artifacts/      # 产物沙盒
│   └── drafts/     # 生成的草图
└── queue/          # 任务队列
```

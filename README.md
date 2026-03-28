# Videospec (OpsV) 0.4.3 — 工业级电影感流水线 (Cinematic Workflow Evolution)

> 纪元：`0.3` → `0.4.3` | 从“创作实验”向“工业级资产编译器”的终极跃迁

## 0.4.x 核心使命
0.4 系列版本通过引入 **d-ref (Design) / a-ref (Approved)** 双通道参考体系和**级联式环境校验 (Cascading Config)**，彻底解决了大模型创作中“风格飘移”和“配置混乱”的痛点。这是一个为“AI 导演”量身定制的基石版本。

---

## 安装与部署 (Installation)

### 1. 全局安装 (推荐)
直接从 npm 官方仓库安装，一键获取 `opsv` 全局指令：
```bash
npm install -g videospec
```
安装完成后，在任意终端输入：
```bash
opsv --version  # 返回 0.4.3
```

### 2. 本地开发安装
如果您需要深度定制或参与开发：
```bash
git clone https://github.com/mr7thing/openspec-video.git
npm install
npm run build
```

---

## 0.4.3 重大特性 (Major Highlights)

### 1. Minimax 深度集成 (Minimax Integration)
*   **文生图 (MiniMax-Image-01)**: 高质量 base64 图像流处理，支持创意性强的艺术渲染。
*   **Hailuo 视频生成 (MiniMax-Hailuo-2.3)**: 工业级长视频（约 6s）生成，支持高动态物理特性模拟。
*   **异步轮询防空体系**: 针对视频生成任务，实装了具各“深度穿透解析”与“自动化网络抖动恢复（Max Retries 120）”的 Provider。

### 2. 多模型“多宇宙”调度架构 (Parallel Multi-Model Dispatching)
*   **一键全模态巡游**: CLI 支持通过 `-m all`（默认）同时激活 `api_config.yaml` 中所有 `enable: true` 的模型。
*   **资产防撞车 (Subdirectory Output)**: 不同模型生成的资产会自动落盘至 `artifacts/drafts_N/[provider_name]/` 独立子目录，解决多机位/多方案竞争下的文件覆盖痛点。
*   **Gemini 网页原生流**: 如果模型定义为 `gemini` 类型，资产仍保留在 `drafts_N/` 根目录，平滑兼容网页端手动拖拽创作习惯。

### 3. 品味至上的架构简化 (Architectural Refinement)
*   **鉴权收束 (Auth Unity)**: 移除了零散的 API Key 环境变量，通用的火山引擎（Seadream/Seedance）统一使用 `VOLCENGINE_API_KEY`，Minimax 使用 `MINIMAX_API_KEY`。
*   **配置即逻辑**: 通过 `api_config.yaml` 的 `type` (image/video) 与 `enable` 字段，实现静态配置驱动动态执行逻辑，无需再硬编码 CLI 分支。

---

## 真相源 (Source of Truth) 目录结构

```text
/
├── .env/                   # 本地唯一环境配置
│   ├── api_config.yaml     # 【核心】配置模型启用状态与参数
│   └── secrets.env         # API 密钥存放区
├── .agent/                 # OpsV 认知心智层 (Agent Specs & Skills)
├── docs/schema/            # 0.4.x 工业级协议规范
├── videospec/              # 剧本/分镜/资产定义
└── artifacts/              # 编译产出目录
    └── drafts_N/           # 第 N 次小样编译结果
        ├── minimax/        # Minimax 宇宙资产
        ├── seadream/       # Seadream 宇宙资产
        └── ...
```

---

## 核心编译器指令 (CLI)

| 命令             | 描述                                     | 0.4.3 亮点                                       |
| ---------------- | ---------------------------------------- | ------------------------------------------------ |
| `opsv gen-image` | 【高频】执行全局绘图任务                 | 支持 `--model all` 自动并发/串行多引擎任务派发   |
| `opsv gen-video` | 【高频】执行全局视频生成任务             | 内置 10s 间隔轮询保护，支持长视频任务            |
| `opsv init`      | 环境初始化与脚手架部署                   | 自动重置 0.4.3 版本的 `api_config` 模板          |
| `opsv review`    | 资产回显评审                             | 能够识别子文件夹中的模型资产并进行渲染回缩       |

---

> *“代码是写给人看的，只是顺便让机器运行。”*   
> *“—— OpsV，让创作像编译代码一样精准。”*  
> *“—— 柒叔 & Antigravity”*

# OpsV 项目全景 (Project Overview)

> **OpenSpec-Video (OpsV) 0.6.4** — 将 Markdown 叙事规范编译为视频/图像生成任务的自动化框架

---

## 1. OpsV 是什么？

OpsV 是一套 **Spec-as-Code** 视频制作管线。它允许创作者（导演/PM/艺术总监）用 Markdown 撰写故事、独立定义资产（角色/场景/道具）、设计分镜，然后通过 CLI 命令将这些文本规范"编译"为可执行的 JSON 任务队列。

经过 v0.6.4 架构演进，OpsV 实现了 **Circle（环）驱动的依赖分层**：

- **ZeroCircle**：无依赖的基础资产（角色、道具、场景设计图）
- **FirstCircle**：依赖 ZeroCircle 的次级资产（带角色引用的场景、组合资产）
- **SecondCircle**：依赖 FirstCircle 的三级资产（分镜视频、动画，依赖已批准的 shot 图片）
- **ThirdCircle / ...**：依此类推（复杂组合、后处理）

**核心信条**：
- **文档即代码**：`.md` 文件是唯一的真相源，图像和视频仅仅是它的编译产物
- **Circle 依赖驱动**：基于 `## Approved References` 建立实体间的因果律约束，高 Circle 资产必须等待低 Circle 依赖完成并 **Approve** 后才能生成
- **意图与执行分离**：`opsv imagen / animate / comfy` 只产生意图（`jobs.json`），`opsv queue compile` 翻译为特定 API 指令，`opsv queue run` 被动消费
- **物理状态机**：任务以原子文件流转，批次命名 `queue_{N}`，每次 compile 独立递增
- **动静分离**：图像生成和视频生成是两条独立管线，互不干扰

---

## 2. 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 语言 | TypeScript | 核心代码 |
| CLI 框架 | Commander.js | 命令行界面 |
| 通讯 | WebSocket (ws) | 后台守护进程 ↔ 浏览器插件 |
| 配置 | dotenv + js-yaml | 环境变量 + YAML 配置 |
| 校验 | Zod | Job 任务结构校验 |
| 日志 | Winston | 统一日志系统 |
| 解析 | unified + remark | Markdown/YAML 解析 |
| HTTP | Axios | API 请求 |

---

## 3. 标准目录结构

`opsv init` 创建的项目骨架：

```
project/
├── .agent/                     # AI Agent 配置
│   ├── Creative-Agent.md       # 创世代理：脑暴 + 创意落盘
│   ├── Guardian-Agent.md       # 同步守卫：校验 + 反射同步
│   ├── Runner-Agent.md         # 疾走特遣：编译 + 渲染执行
│   └── skills/                 # 技能手册库
│       ├── opsv-architect/
│       ├── opsv-asset-designer/
│       ├── opsv-script-designer/
│       ├── opsv-animator/
│       ├── opsv-brainstorming/
│       ├── opsv-pregen-review/
│       ├── opsv-ops-mastery/
│       ├── opsv-enlightenment/
│       └── animation-director/
├── .env/                       # 项目环境配置（git 忽略）
│   ├── secrets.env             # API 密钥
│   └── api_config.yaml         # 引擎参数配置
├── .opsv/                      # 内部元数据（git 忽略）
│   └── dependency-graph.json   # 依赖图缓存
├── opsv-queue/                 # 任务队列与资产落盘目录（git 忽略）
│   ├── circle_manifest.json    # Circle 状态清单
│   ├── zerocircle_1/
│   │   ├── imagen_jobs.json    # 图像任务列表
│   │   ├── video_jobs.json     # 视频任务列表
│   │   ├── comfy_jobs.json     # ComfyUI 任务列表
│   │   ├── volcengine/
│   │   │   └── queue_1/        # Provider 批次队列
│   │   │       ├── queue.json
│   │   │       ├── shot_01_1.png
│   │   │       └── shot_02_1.png
│   │   └── siliconflow/
│   │       └── queue_1/
│   ├── firstcircle_1/
│   ├── secondcircle_1/
│   └── frames/                 # 帧提取（@FRAME 引用解析落盘）
├── videospec/                  # 核心叙事资产（真相源）
│   ├── project.md              # 项目全局配置与资产花名册
│   ├── stories/                # 故事大纲
│   │   └── story.md
│   ├── elements/               # 角色/道具资产定义
│   │   ├── elder_brother.md
│   │   └── prop_sword.md
│   ├── scenes/                 # 场景资产定义
│   │   └── classroom.md
│   └── shots/                  # 分镜与动画台本
│       ├── Script.md           # 静态构图分镜
│       └── Shotlist.md         # 动态运镜台本
└── AGENTS.md                   # OpenCode/Trae 统一协议
```

**资产命名规则**：
- 全局唯一序号：`{jobId}_{seq}.{ext}`（如 `shot_01_1.png`, `hero_3.png`）
- `SequenceCounter` 递归扫描整个 `opsv-queue/` 树来确定下一个序号

---

## 4. 核心概念词典

| 概念 | 含义 |
|------|------|
| **Spec-as-Code** | 用结构化 Markdown 作为视频制作的源代码 |
| **Circle（环）** | `v0.6.4 引入`，基于 DND 五环施法的资产生成依赖层次，由 DependencyGraph 拓扑排序自动计算 |
| **Dependency Graph** | `v0.5 引入`，在编译期进行拓扑解析，如果前置资产没有 Approved 会被阻断 |
| **Review UI** | `v0.5 引入`，本地 Express Web 页面，实现可视化的图像筛选、命名、和元数据写回 |
| **@ 引用语法** | 以 `@role_K`、`@scene_bar` 或 `@asset:variant` 等标签调用已 approved 的资产变体 |
| **动静分离** | 图像管线（Script.md + imagen）与视频管线（Shotlist.md + animate）互相独立 |
| **意图与执行分离** | `v0.6 引入`，Generate 产出纯意图 JSON，Compile 翻译 API 指令，Run 被动消费 |
| **frame_ref** | `v0.5 引入`，向模型传递首/尾帧参考图像（first/last）的标准数据结构 |
| **全局唯一序号** | `v0.6.4 引入`，`{jobId}_{seq}.{ext}` 取代旧的覆盖式命名 |
| **queue_{N} 批次** | `v0.6.4 引入`，每次 compile 新建 batch，不会追加到已有 batch |

---

## 5. 快速开始

```bash
# 1. 全局安装
npm install -g videospec

# 2. 创建新项目
opsv init my-mv-project

# 3. 配置 API 密钥
echo "VOLCENGINE_API_KEY=your_key_here" > .env/secrets.env

# 4. 编写资产和分镜（参考工作流文档）

# 5. 依赖图检查
opsv deps

# 6. 查看当前该做哪一环
opsv circle status

# 7. 生成图像任务列表
opsv imagen

# 8. 编译入队
opsv queue compile opsv-queue/zerocircle_1/imagen_jobs.json --model volcengine.seadream-5.0-lite

# 9. 执行任务
opsv queue run --model volcengine.seadream-5.0-lite

# 10. Web 模式审阅
opsv review
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [工作流程说明](./02-WORKFLOW.md) | 三角色循环完整流程 |
| [CLI 命令参考](./03-CLI-REFERENCE.md) | 全部命令的详细用法 |
| [Agent & Skill 体系](./04-AGENTS-AND-SKILLS.md) | 3 个角色 + 9 个技能 |
| [文档格式规范](./05-DOCUMENT-STANDARDS.md) | 四层架构、YAML 模板、@ 语法 |
| [配置体系](./06-CONFIGURATION.md) | .env 目录与引擎参数 |
| [API 接口规范](./07-API-REFERENCE.md) | Provider 协议与队列状态机 |
| [Addon 开发指南](./08-ADDONS-DEVELOPMENT.md) | 插件包开发规范 |

---

> *"代码是写给人看的，只是顺便让机器运行。"*
> *OpsV 0.6.4 | 最后更新 2026-04-22*

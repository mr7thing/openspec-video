# OpsV 项目全景 (Project Overview)

> **OpenSpec-Video (OpsV) 0.4.3** — 将 Markdown 叙事规范编译为视频/图像生成任务的自动化框架

---

## 1. OpsV 是什么

OpsV 是一套 **Spec-as-Code** 视频制作管线。它允许创作者（导演/PM/艺术总监）用 Markdown 撰写故事、定义资产、设计分镜，然后通过 CLI 命令将这些文本规范"编译"为可执行的 JSON 任务队列，最终驱动 AI 模型（SeaDream、Seedance、Minimax、SiliconFlow 等）并发批量生成图像与视频。

**核心信条**：

- **代码即规范**：`.md` 文件是唯一的真相源，图像和视频是其编译产物
- **资产先行**：角色/场景/道具必须先独立建档，分镜中只允许引用（`@` 语法）
- **动静分离**：图像生成和视频生成是两条独立管线，互不干扰
- **Markdown 驱动**：YAML Frontmatter 存元数据，Markdown Body 存参考图引用和人类审阅内容，两者协同

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
│   ├── Architect.md            # 架构师角色定义
│   ├── Screenwriter.md         # 编剧角色定义
│   ├── AssetDesigner.md        # 资产设计师角色定义
│   ├── ScriptDesigner.md       # 分镜设计师角色定义
│   ├── Animator.md             # 动画编导角色定义
│   ├── Supervisor.md           # 质检监制角色定义
│   └── skills/                 # 技能手册库（10 个 Skill）
├── .antigravity/               # Antigravity 工具配置
│   ├── rules/                  # 行为规则
│   └── workflows/              # 工作流模板（8 个）
├── .env/                       # 环境配置（git 忽略）
│   ├── secrets.env             # API 密钥
│   └── api_config.yaml         # 引擎参数配置
├── videospec/                  # 核心叙事资产（真相源）
│   ├── project.md              # 项目全局配置与资产花名册
│   ├── stories/                # 故事大纲
│   │   └── story.md
│   ├── elements/               # 角色/道具资产定义
│   │   ├── @role_hero.md
│   │   └── @prop_sword.md
│   ├── scenes/                 # 场景资产定义
│   │   └── @scene_forest.md
│   └── shots/                  # 分镜与动画台本
│       ├── Script.md           # 静态构图分镜
│       └── Shotlist.md         # 动态运镜台本
├── artifacts/                  # 生成产物
│   └── drafts_N/               # 第 N 批渲染草图
├── queue/                      # 任务队列
│   ├── jobs.json               # 图像生成任务
│   └── video_jobs.json         # 视频生成任务
├── GEMINI.md                   # Gemini 专用全局人格配置
└── AGENTS.md                   # OpenCode/Trae 统一协议
```

---

## 4. 核心概念词典

| 概念 | 含义 |
|------|------|
| **平行宇宙沙箱** | 0.4.3 引入，根据 `api_config.yaml` 启用的多模型并发执行，不同引擎的结果被严格隔离在 `artifacts/drafts_N/[引擎名]/` 中 |
| **Spec-as-Code** | 用结构化 Markdown 作为视频制作的源代码 |
| **Asset-First** | 资产先于分镜存在，分镜只引用不描述 |
| **d-ref (Design References)** | 生成输入参考图。`opsv generate` 生成本实体时作为 img2img 输入 |
| **a-ref (Approved References)** | 定档输出参考图。其他实体通过 `@` 引用时，提供此参考图 |
| **变体链** | 将 A 的 a-ref 作为 B 的 d-ref，生成基于 A 的新变体（如老年版、卡通版） |
| **@ 引用语法** | 用 `@role_K`、`@scene_bar` 等标签引用独立的资产文件 |
| **global_style_postfix** | 在 `project.md` 中定义的全局渲染风格后缀，编译器自动注入每个任务 |
| **动静分离** | 图像管线（Script.md → jobs.json）与视频管线（Shotlist.md → video_jobs.json）互相独立 |
| **关键帧塌缩** | `@FRAME:<shot_id>_last` 延迟指针，后一镜头首帧自动继承前一镜头尾帧 |
| **特征泄漏 (Concept Bleeding)** | 分镜中不慎描述了角色外貌细节，导致渲染冲突 |

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

# 5. 编译并生成图像
opsv generate
opsv gen-image

# 6. 将结果回写文档并审阅
opsv review

# 7. 编译并生成视频
opsv animate
opsv gen-video
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [工作流程说明](./02-WORKFLOW.md) | 五步循环完整流程 |
| [CLI 命令参考](./03-CLI-REFERENCE.md) | 全部 8 个命令的详细用法 |
| [Agent 与 Skill 体系](./04-AGENTS-AND-SKILLS.md) | 6 个角色 + 10 个技能 |
| [文档格式规范](./05-DOCUMENT-STANDARDS.md) | YAML 模板、@ 语法、命名约定 |
| [配置体系](./06-CONFIGURATION.md) | .env 目录与引擎参数 |
| [API 接口规范](./07-API-REFERENCE.md) | 多模型接口协议 |
| [Schema 速查表](./schema/QUICK_REFERENCE.md) | 字段与枚举值速查 |

---

> *"代码是写给人看的，只是顺便让机器运行。"*
> *OpsV 0.4.3 | 最后更新: 2026-03-28*

# OpsV 项目全景 (Project Overview)

> **OpenSpec-Video (OpsV) 0.5.19** — 将 Markdown 叙事规范编译为视频/图像生成任务的自动化框架

---

## 1. OpsV 是什么

OpsV 是一套 **Spec-as-Code** 视频制作管线。它允许创作者（导演/PM/艺术总监）用 Markdown 撰写故事、独立定义资产（角色/场景/道具）、设计分镜，然后通过 CLI 命令将这些文本规范"编译"为可执行的 JSON 任务队列。
经过 v0.5 重构，OpsV 完全步入 **Spec-First** 时代，通过 **依赖图拓扑排序** 和 **执行期双阶段校验** 构建了坚若磐石的自动化生成引擎。

**核心信条**：

- **文档即代码**：`.md` 文件是唯一的真相源，图像和视频仅仅是它的编译产物
- **依赖驱动**：依靠 `## Approved References` 建立实体间的因果律约束
- **格式审查**：通过 Review UI 保障元数据与产物的 100% 同步
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
│   └── skills/                 # 技能手册库（9 个 Skill）
│       ├── opsv-architect/
│       ├── opsv-asset-designer/
│       ├── opsv-script-designer/
│       ├── opsv-animator/
│       ├── opsv-brainstorming/
│       ├── opsv-pregen-review/
│       ├── opsv-ops-mastery/
│       ├── opsv-enlightenment/
│       └── animation-director/
├── .antigravity/               # Antigravity 工具配置
│   ├── rules/                  # 行为规则
│   └── workflows/              # 工作流模板
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
| **Spec-as-Code** | 用结构化 Markdown 作为视频制作的源代码。 |
| **Dependency Graph** | `v0.5 引入`，在编译期进行拓扑解析，如果前置资产没有被 Approved 会被阻断。 |
| **Review UI** | `v0.5 引入`，本地 Express Web 页面（取代旧 CLI 逻辑），实现可视化的图像筛选、命名、和元数据写回。 |
| **@ 引用语法** | 用 `@role_K`、`@scene_bar` 或 `@asset:variant` 等标签调用已 approved 的资产变体。 |
| **动静分离** | 图像管线（Script.md + Generator）与视频管线（Shotlist.md + Animator）互相独立。 |
| **frame_ref** | `v0.5 引入`，取代 schema_0_3。向模型传递首/尾帧参考图像（first/last）的标准数据结构。 |
| **两阶段校验** | `v0.5 引入`，编译期格式检查，加上执行期的宽限/拒绝等硬约束（像素、宽高、模型参数上限）。 |
| **优雅降级** | `v0.5.14 引入`，调度器在派发前动态检测模型能力边界，自动剔除不支持的参数并发出警告。 |

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

# 6. 编译任务
opsv generate

# 7. 执行图像生成
opsv gen-image

# 8. Web 模式审阅
opsv review

# 9. 编译并生成视频
opsv animate
opsv gen-video
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [工作流程说明](./02-WORKFLOW.md) | 三角色循环完整流程 |
| [CLI 命令参考](./03-CLI-REFERENCE.md) | 全部 9 个命令的详细用法 |
| [Agent 与 Skill 体系](./04-AGENTS-AND-SKILLS.md) | 3 个角色 + 9 个技能 |
| [文档格式规范](./05-DOCUMENT-STANDARDS.md) | 四层架构、YAML 模板、@ 语法（v0.5） |
| [配置体系](./06-CONFIGURATION.md) | .env 目录与引擎参数 |
| [API 接口规范](./07-API-REFERENCE.md) | 多模型接口协议 |

---

> *"代码是写给人看的，只是顺便让机器运行。"*
> *OpsV 0.5.19 | 最后更新: 2026-04-17*

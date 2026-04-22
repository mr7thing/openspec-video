# OpsV 项目全景 (Project Overview)

> **OpenSpec-Video (OpsV) 0.6.3** �?�?Markdown 叙事规范编译为视�?图像生成任务的自动化框架

---

## 1. OpsV 是什�?
OpsV 是一�?**Spec-as-Code** 视频制作管线。它允许创作者（导演/PM/艺术总监）用 Markdown 撰写故事、独立定义资产（角色/场景/道具）、设计分镜，然后通过 CLI 命令将这些文本规�?编译"为可执行�?JSON 任务队列�?
经过 v0.6.0 架构革命，OpsV 彻底实现�?**意图与执行的物理隔离**�?- `opsv generate` 仅输出纯意图大纲 (`jobs.json`)
- `opsv queue compile` 将意图编译为 API 特定的原子任务卡�?- `opsv queue run` 逐一消费任务卡片，实现单线程安全执行

**核心信条**�?
- **文档即代�?*：`.md` 文件是唯一的真相源，图像和视频仅仅是它的编译产�?- **依赖驱动**：依�?`## Approved References` 建立实体间的因果律约�?- **意图与执行分�?*：Generate 只产生意图，Compile 翻译为特�?API 指令，Run 被动消费
- **物理状态机**：任务以原子文件流转�?`pending �?processing �?completed/failed` 目录
- **动静分离**：图像生成和视频生成是两条独立管线，互不干扰

---

## 2. 技术栈

| 层级 | 技�?| 用�?|
|------|------|------|
| 语言 | TypeScript | 核心代码 |
| CLI 框架 | Commander.js | 命令行界�?|
| 通讯 | WebSocket (ws) | 后台守护进程 �?浏览器插�?|
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
�?  ├── Creative-Agent.md       # 创世代理：脑�?+ 创意落盘
�?  ├── Guardian-Agent.md       # 同步守卫：校�?+ 反射同步
�?  ├── Runner-Agent.md         # 疾走特遣：编�?+ 渲染执行
�?  └── skills/                 # 技能手册库
�?      ├── opsv-architect/
�?      ├── opsv-asset-designer/
�?      ├── opsv-script-designer/
�?      ├── opsv-animator/
�?      ├── opsv-brainstorming/
�?      ├── opsv-pregen-review/
�?      ├── opsv-ops-mastery/
�?      ├── opsv-enlightenment/
�?      └── animation-director/
├── .env                        # 服务管理配置（端口等�?├── .env/                       # 项目环境配置（git 忽略�?�?  ├── secrets.env             # API 密钥
�?  └── api_config.yaml         # 引擎参数配置
├── .opsv/                      # 运行时状态（git 忽略�?�?  └── dependency-graph.json   # 依赖图快�?├── .opsv-queue/                # Spooler 物理信箱（git 忽略�?�?  ├── inbox/{provider}/       # 待执行任�?�?  ├── working/{provider}/     # 执行中任�?�?  ├── done/{provider}/        # 已完�?失败任务
�?  └── corrupted/{provider}/   # 损坏任务（JSON 解析失败时隔离）
├── videospec/                  # 核心叙事资产（真相源�?�?  ├── project.md              # 项目全局配置与资产花名册
�?  ├── stories/                # 故事大纲
�?  �?  └── story.md
�?  ├── elements/               # 角色/道具资产定义
�?  �?  ├── @role_hero.md
�?  �?  └── @prop_sword.md
�?  ├── scenes/                 # 场景资产定义
�?  �?  └── @scene_forest.md
�?  └── shots/                  # 分镜与动画台�?�?      ├── Script.md           # 静态构图分�?�?      └── Shotlist.md         # 动态运镜台�?├── artifacts/                  # 生成产物
�?  └── drafts_N/               # �?N 批渲染草�?├── queue/                      # 意图队列
�?  └── jobs.json               # generate 输出的意图大�?└── AGENTS.md                   # OpenCode/Trae 统一协议
```

---

## 4. 核心概念词典

| 概念 | 含义 |
|------|------|
| **Spec-as-Code** | 用结构化 Markdown 作为视频制作的源代码�?|
| **Spooler Queue** | `v0.6 引入`，基于物理文件状态机的任务调度系统，原子 `fs.rename` dequeue，取代旧版内�?Dispatcher�?|
| **Dependency Graph** | `v0.5 引入`，在编译期进行拓扑解析，如果前置资产没有�?Approved 会被阻断�?|
| **Review UI** | `v0.5 引入`，本�?Express Web 页面，实现可视化的图像筛选、命名、和元数据写回�?|
| **@ 引用语法** | �?`@role_K`、`@scene_bar` �?`@asset:variant` 等标签调用已 approved 的资产变体�?|
| **动静分离** | 图像管线（Script.md + Generator）与视频管线（Shotlist.md + Animator）互相独立�?|
| **意图与执行分�?* | `v0.6 引入`，Generate 产出纯意�?JSON，Compile 翻译 API 指令，Run 被动消费�?|
| **frame_ref** | `v0.5 引入`，向模型传递首/尾帧参考图像（first/last）的标准数据结构�?|
| **服务拓扑** | `v0.6 引入`，Global Daemon / Local Review / Task Worker 三层服务分类协议�?|

---

## 5. 快速开�?
```bash
# 1. 全局安装
npm install -g videospec

# 2. 创建新项�?opsv init my-mv-project

# 3. 配置 API 密钥
echo "VOLCENGINE_API_KEY=your_key_here" > .env/secrets.env

# 4. 编写资产和分镜（参考工作流文档�?
# 5. 依赖图检�?opsv deps

# 6. 编译意图大纲
opsv generate

# 7. 编译为特�?API 的原子任�?opsv queue compile queue/jobs.json --provider seadream

# 8. 执行任务（单线程顺序消费�?opsv queue run seadream

# 9. Web 模式审阅
opsv review
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [工作流程说明](./02-WORKFLOW.md) | 三角色循环完整流�?|
| [CLI 命令参考](./03-CLI-REFERENCE.md) | 全部命令的详细用�?|
| [Agent �?Skill 体系](./04-AGENTS-AND-SKILLS.md) | 3 个角�?+ 9 个技�?|
| [文档格式规范](./05-DOCUMENT-STANDARDS.md) | 四层架构、YAML 模板、@ 语法 |
| [配置体系](./06-CONFIGURATION.md) | .env 目录与引擎参�?|
| [API 接口规范](./07-API-REFERENCE.md) | Spooler Queue Provider 协议 |
| [Addon 开发指南](./08-ADDONS-DEVELOPMENT.md) | 插件包开发规�?|
| [服务架构规范](../Server-Architecture.md) | 服务拓扑与生命周期管�?|

---

> *"代码是写给人看的，只是顺便让机器运行�?*
> *OpsV 0.6.3 | 最后更�? 2026-04-22*

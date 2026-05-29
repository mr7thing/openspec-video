# OpsV

> **Spec-to-screen pipeline.** Write Markdown specs. OpsV compiles them into images and video across multiple AI providers, with dependency management and visual review built in.

---

## At a Glance

| 你要做什么 | 对应的 OpsV 命令 |
|-----------|-----------------|
| 初始化项目 | `opsv init` |
| 写角色/场景/分镜文档 | 直接写 `.md` 文件 |
| 校验文档规范 | `opsv validate` |
| 生成图像 | `opsv imagen --model <m>` |
| 生成视频 | `opsv animate --model <m>` |
| 执行渲染 | `opsv run <path>` |
| 可视化审查 | `opsv review` |
| 修改重试 | `opsv iterate <path>` |

---

## How It Works

```
你写的 Markdown          OpsV 处理管线              产出
─────────────           ────────────────           ──────
elements/@hero.md  →   依赖图 → Circle 分层   →   @hero_1.png
scenes/@temple.md  →   编译为任务 JSON        →   @temple_1.png
shots/shot_01.md   →   并发调用 AI API        →   shot_01_1.mp4
                   →   可视化审查 → 批准/驳回  →   [下轮迭代]
```

**三个核心概念**：

- **Circle** — 依赖层级。角色和场景先画（ZeroCircle），基于它们的分镜后画（FirstCircle），视频最后（EndCircle）。层级之间有严格的先后顺序。
- **Document 即真相** — Markdown 的 YAML frontmatter 是资产状态的唯一权威。审查通过写回 `status: approved`，驳回写回 `status: drafting`。没有数据库。
- **增量不删除** — `opsv-queue/` 下的所有产物只增不删。每次编译生成新目录，每次迭代生成新序号。所有历史版本随时可回溯。

---

## 生产管线

```
opsv circle create          # 分析依赖，创建 Circle 目录
opsv imagen --model <m>     # 编译图像任务
opsv run <path>             # 执行 → 产出 PNG
opsv review                 # 审查 → 批准 / 驳回
opsv circle refresh         # 刷新状态 → 解锁下一 Circle
opsv animate --model <m>    # 编译视频任务
opsv run <path>             # 执行 → 产出 MP4
```

---

## 支持的 AI 提供商

| 提供商 | 图像 | 视频 | ComfyUI |
|--------|:----:|:----:|:-------:|
| 火山引擎 (豆包) | ✅ | ✅ | — |
| MiniMax | ✅ | ✅ | — |
| 硅基流动 (SiliconFlow) | ✅ | ✅ | — |
| RunningHub | — | — | ✅ |
| ComfyUI Local | — | — | ✅ |

完整配置见 `.opsv/api_config.yaml`。

---

## 安装

```bash
npm install -g videospec
opsv init my-project
cd my-project
```

## 项目结构

```
videospec/                  # 你的创作区
  project.md                # 全局配置 + 资产花名册
  stories/story.md          # 故事大纲
  elements/@hero.md         # 角色（文件名即 @id）
  scenes/@temple.md         # 场景
  shots/shot_01.md          # 分镜
  shots/shotlist.md         # 视频工程图纸

opsv-queue/                 # OpsV 生成区（只增不删）
  videospec_circle1/        # 一个 Circle 批次包含所有层级
    _manifest.json          # 记录全部 Layer: zerocircle→firstcircle→...
    volcengine.seadream_001/  # ZeroCircle 编译产出
    volcengine.seedance_001/  # FirstCircle 编译产出（同一目录）
  videospec_circle2/        # 仅当依赖层级变化时新建批次
    _manifest.json
```

## 完整运行流程

→ 详见 [docs/PIPELINE.md](docs/PIPELINE.md) — 含端到端管线图、Circle 依赖层级、状态流转、Agent 协作时序、Cloud 审查专有流。

## Cloud 审查（远程协作）

```bash
opsv login                              # OAuth 登录
opsv review --cloud                     # 公网审查（自动隧道）
opsv review --cloud --status <sid>      # 查看会话
opsv review --cloud --close <sid>       # 关闭会话
```

审查 URL 通过安全隧道暴露，支持 QR 码扫码在手机上查看。

---

## 文档

- [设计哲学](docs/en/DESIGN-PHILOSOPHY.md)
- [架构总览](docs/ARCHITECTURE.md) — 完整的分层架构、数据流、云端集成
- [Agent 技能体系评估](docs/AGENT_SKILL_ASSESSMENT.md) — AI Agent 如何使用 OpsV 创作
- [Agent 系统入口](templates/.agent/AGENTS.md) — 角色三元组 + 交接协议
- [Cloud 审查报告](docs/audit/phase1-3-cloud-lifecycle-review.md)

## License

MIT

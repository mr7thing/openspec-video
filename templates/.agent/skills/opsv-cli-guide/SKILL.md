---
name: opsv-cli-guide
description: 指导如何在视频制作流程中使用 OpsV CLI 命令进行自动化编排。理解 opsv generate, gen-image, animate, gen-video 之间的流水线逻辑及其调用最佳实践。
---

# OpsV CLI 命令使用指南

该技能作为 OpenSpec-Video (OpsV) 的核心 CLI 架构使用手册，任何涉及生成（图像/视频）和管线编排的 Agent，在调用前此技能作为首选参考。

## 核心管线生命周期

 OpsV 的生成采用 **"变异-执行-反写" (Compile -> Execute -> Review)** 工作流，彻底解耦人类的创意设计与 AI 的批量执行。所有的渲染指令并不是直接由 Agent 调用的 API 发起，而是：

1. Agent 修改 `.md` 声明文件。
2. 调度 CLI 把 `.md` "编译"成 `jobs.json` 队列文件。
3. 执行专用的 CLI 调度 AI 批量渲染队列并落盘。
4. Review 将资源路径回写到 `.md`。

## 🎯 关键命令详解

### 1. OpsV 初始化与后台
- **`opsv init`**: 在一个空目录执行以搭建规范文件体系结构。
- **`opsv serve`**: 启动 WebSocket 监听，守护进程驻存后台 (在任何执行生成的机器前置确保它运行)。

### 2. 图像生成管线 (Image Pipeline)

图像生成贯穿元素、场景设定图的设计过程。

- **编译**: `opsv generate [目标路径]`
  - 解析所有的 `.md`，将 Frontmatter 里的参数转化成具体的 Job JSON 队列 (存入 `queue/jobs.json`)。
  - *技巧*: `opsv generate --preview` 只生成极简视图，节省资源。
- **执行**: `opsv gen-image` 
  - (替代了旧版的 `execute-image`) 批量调用 `queue/jobs.json` 中的任务并把图下载倒 `artifacts/drafts_X/`。
  - 参数支持 `-m <model>` 及并发 `-c`。
- **反写**: `opsv review`
  - 此命令非常关键。图像生成后，该命令会查找到对应资产的 `Script.md` 或 `.md` 中，寻找画廊位甚至替换，以便在代码编辑器直接展现出预览图像。导演随后可在 `## Approved References` 手动贴入看中的路径实现“定档”。

### 3. 视频生成管线 (Video Pipeline)

视频生成发生在剧本、分镜的定级、图片资产完备之后。主要解析 `videospec/shots/Shotlist.md`。

- **编排**: `opsv animate`
  - 提取每一个镜头 (Shot) 中的 `motion_prompt_en` 动作提示词，及首帧、尾帧和延时帧锁定引用(`@FRAME`)的关系链，输出到 `queue/video_jobs.json`。
- **执行**: `opsv gen-video`
  - 读取上述的队列并串行喂送给核心视效模型（如 Seedance 1.5 Pro）。
  - 因为长镜头的连续性依赖于由前一镜头的尾帧生成的，因此不支持 `--skip-failed` 时跳过后绪强相关任务。

## 🛠️ 在工作流中的协同示例 

**场景 1：设计角色生成三视图**
当你（Agent）写完了 `videospec/elements/CharacterA.md`。
- 执行 `opsv generate videospec/elements/CharacterA.md`。
- 执行 `opsv gen-image -m seadream-5.0-lite -c 3`。
- 执行 `opsv review`。
- 请导演进 IDE 看图。

**场景 2：生成视频最终成片**
导演已经确认完成了 `videospec/shots/Script.md` 并在 IDE 中指定了所有的定档参考图 (`a-ref`)。
- 执行 `opsv animate` 锁定分镜动作和时间帧。
- 执行 `opsv gen-video -m seedance-1.5-pro`。

## ⚠️ 防错注意事项

1. **不可跨级调用**：切勿直接跳过 `generate`/`animate` 而执行 `gen-image`/`gen-video`，因为 CLI 设计严格读取在 `queue` 里最新编译的任务。
2. **密钥缺失拦截**：如果在执行 `gen-image`/`gen-video` 时提示 API 错误或缺少 Key，须引导用户检查 `templates/.env/api_config.yaml` 或其对应的 `secrets.env` 设置。

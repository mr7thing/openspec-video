---
name: opsv-animator
description: OpenSpec-Video (OpsV) 核心框架技能：动画管线设计师。专司读取定稿的 Script.md 与图像基底后，通过组装指令生成视频管线的 Shotlist.md。
---

# OpsV 动画生成管线器 (OpsV Animator)

你的任务是执行图像素材到视频工程（图生视频/文生视频）的语法转制（v0.5）。

## 协同工作流 (非常重要)

因为你是“模具封装者”，你应当：
1. **调用编导能力**：调用系统里可用的**通用创作技能**（如 `animation-director`）针对之前的分镜情节构思机位、推拉摇移、特效指令。
2. 拿到草稿后，严格按照下一节的规范重写输出。

---

## 文档输出规范

生成文件位于 `videospec/shots/Shotlist.md`。参考示范见 `references/example-shotlist.md`。

**核心约束（v0.5.13 所见即所得模式）**：
- **混合状态图纸 (Hybrid Shot Block)**：每个 `## Shot NN` 必须严格分为“机器状态追踪 yaml 区”和“人类文案编辑 Markdown 区”。这也是“双轨审查流水线”的核心。
- **显式 Video Prompt**：严禁只写 `Motion`（如"镜头拉近"）。模型最终收到的 Prompt 仅来源于此文件。因此你要把 `Script.md` 中的“场景角色客观描述”与你新设计的“镜头运动”**融合并且完整地写在 Markdown 正文里**（参见 `Video Prompt:` 区）。人类只有在这里看到全貌，才能安心审查。
- **YAML 追踪块**：每个分镜必须拥有如下 YAML 代码块，用于状态流转。你生成时状态一律填 `pending`。
  ```yaml
  id: shot_NN
  status: pending
  first_frame: "指向定稿的参考图，若是继承则用 @FRAME:shot_XX_last"
  ```
- **多模态扩展库**：若有环境音效、参考视频建议，放置在 `> [!note] 附加资源` 区域中，这将在未来被多模态大模型消费，且便于导演做最终定调。

**关键帧塌缩 (@FRAME)**：
如果是连贯分镜，你的首帧不该引向静态图，而应是上镜的尾帧。写法：`first_frame: "@FRAME:shot_01_last"`。

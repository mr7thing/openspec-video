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

生成文件位于 `videospec/shots/Shotlist.md`。参考示范见 `references/shotlist_template.md`。

**核心约束（v0.5）**：
- **废除 YAML 数组！** v0.5 阶段也已废除 `Shotlist.md` 的 YAML 列表模式。采用 `## Shot NN` 章节级纯 Markdown。
- **纯粹的动作提取**：把剧本的情节，转写为纯英文的机位运镜语录，如 `**Motion Prompt:** Camera Dolly in, protagonist slowly turns back...`。这行文本会被引擎提取喂给 AI 视频大模型。如果你不会写，你应该交给 `animation-director` 来写。
- **参考图链路引用**：每个镜头段落必须明确指明“这镜视频是用哪张首帧/尾帧起版的”。格式强制为无序列表，链接的文本为 `首帧`（first）或 `尾帧`（last），链接的路径指向确切的图片或帧指针。

**关键帧塌缩 (@FRAME)**：
这是 OpsV 特有的长镜头无缝机制。如果是连续的镜头，后续镜头的首帧无需去渲染，而是应当重用上一个镜头的尾帧。写法：`- [首帧](@FRAME:shot_01_last)`。

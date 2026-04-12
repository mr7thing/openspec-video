# OpsV 标准工作流 (Standard Workflow) - v0.5.1

## 1. 创意启动 (Initialization)
- 引导大导演建立 `videospec/project.md`（定义画幅 aspect_ratio、渲染引擎配置及提供商信息）。
- 通过激情的探讨，产出结构性故事大纲 (`stories/story.md`)。

## 2. 资产先行 (Elements & Scenes)
- 在编写分镜前，确保所有出场元素在 `videospec/elements/` 已有对应的独立 `.md` 定义。
- 运行 `npx opsv parse` 提取引用关系和生成 Job json 队列。
- 随后运行 `npx opsv gen --model <目标模型>` 生成实体和场景图像。

## 3. 分镜到动画 (Script to Video)
- 阶段一：在 `videospec/shots/Script.md` 中完成分镜美术构思。确保无脑依赖 `@实体名`。并使用 `npx opsv gen` 为所有分镜生成底层概念图。
- 阶段二：使用 `videospec/shots/Shotlist.md` 定义运镜指令（Motion Prompt）。
- 阶段三：执行 `npx opsv video --model <目标模型>` 进行视频生成。如果部分任务失败，加上 `--skip-failed` 继续剩余任务。

## 4. 质量审查 (QA)
- 任何阶段变更后，推荐使用 OpsV CLI 命令查看进度并排查错误，例如运行 `npx opsv init` (或 parse) 打印控制台依赖图状态树，或者借助对应的质检 Prompt 扫描死链和特征污染。

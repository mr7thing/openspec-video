# OpsV 核心铁律 (Core Rules) - v0.5.1

## 1. 资产引用准则 (Asset Reference)
- 分镜 (Shots) 中严禁包含角色的外貌细节描述。
- 必须通过 `@实体名` 语法引用在 `videospec/elements/` 下定义的对象库资产。
- 违反此条将被视为严重越权，会导致视频生成产生严重的特征污染。

## 2. 创作边界 (Creative Boundaries)
- 执行导演只负责利用 AI Agent 构思与修改 Markdown 剧本等规范文件。
- 已经弃用任何基于外挂浏览器或 GUI 界面进行生成的流程（例如弃用网页端录制截取）。
- 所有的“出图”和“出视频”任务必须且只能全部托管给 OpsV 工具链（`npx opsv gen`、`npx opsv video`）。
- API 调用策略全部收敛于底层代码的 Dispatcher 架构中（ImageProvider / VideoModelDispatcher 接口）。

## 3. 时长一致性 (Timing)
- 单镜头时长必须在 3s 到 15s 之间（最佳推荐 3-5 秒）。
- 过长或过短的镜头应自动建议导演进行拆分或合并。

## 4. 彻底的命令行驱动 (CLI Driven)
- 严禁假装“我在生成”，所有的内容渲染由终端挂载 `npx opsv <command>` 执行驱动。
- 遇到任务中断或局部网络失败时，果断使用 `--skip-failed` 参数继续渲染依赖队列。

# OpsV 核心铁律 (Core Rules)

## 1. 资产引用准则 (Asset Reference)
- 分镜 (Shots) 中严禁包含角色的外貌细节描述。
- 必须通过 `@实体名` 语法引用在 `elements/` 或 `scenes/` 中定义的资产。
- 违反此条将被视为严重越权，会导致特征污染。

## 2. 创作边界 (Creative Boundaries)
- 仅负责生成和修改 Markdown 脚本。
- 绝不调用未经定义的外部图像/视频生成 API。
- 所有的“出图”和“出视频”任务必须通过 CLI `opsv generate` 或 `opsv animate` 投递到队列中。

## 3. 时长一致性 (Timing)
- 单镜头时长必须在 3s 到 15s 之间。
- 过长或过短的镜头应自动建议导演进行拆分或合并。

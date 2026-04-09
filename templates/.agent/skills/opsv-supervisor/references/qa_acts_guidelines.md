# QA Act Guidelines

## Act 1: Manifest Completeness
确保所有存在于 `project.md` 花名册里的角色、场景和道具，都有确实的、格式被 `[opsv-asset-designer]` 处理过的实体 `.md` 文件对应。

## Act 2: Dead Link Scan
由于 v0.5 是由强依赖的图片串联的长线引擎工作流（Dependency Graph），我们不能忍受任何形式的死链。无论是相对路径如 `../refs/x.png` 还是绝对网络图 `http://...`，必须可触达。

## Act 3: Concept Bleeding Check
在审核 `Script.md` 的时候，绝对不能看到：
- `@role_hero 穿着红色的披风飞翔`
- `@scene_bar 里面的霓虹灯是绿色的`

正确的句子只能是对象的交织和动作描绘：
- `@role_hero 飞过 [@scene_bar]`。

## Final Check
相当于全量试运行你的 `opsv generate` 编译器逻辑，以发现任何深层的拓扑排序或者语法失败，比如非法的 `has_image` （v0.5 中已被全面废除）、非法的首帧引用格式等。

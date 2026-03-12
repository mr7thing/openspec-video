# OpsV 0.2 Project 规范 (OPSV-PROJECT-0.2.md)

本规范定义了 OpenSpec-Video (OpsV) 0.2 工程中唯一的全局配置中枢——`videospec/project.md` 的结构与准则。

## 1. 核心哲学：全局降维 (Global Context Lock)

为了极度压缩底层 Agent 和脚本撰写者的心智负担，彻底消除在每一个镜头 (Shot) 里反复默写“电影光泽、8k分辨率”等冗余行为，我们强制将这些**贯穿始终的上下文**提纯至根目录的 `project.md` 中。

这是唯一一个允许声明全局渲染参数的文件。底层构建器 (`AssetCompiler`) 会无视分镜师的想法，在最终生成 `jobs.json` 的 Payload 时，**强制将此处的参数与后缀垫入每一个镜头的执行上下文中**。

## 2. 文件结构与 YAML 规范

`project.md` 必须存放于工程的 `videospec/` 根目录下，并以 YAML Frontmatter 开头。

### 2.1 YAML Frontmatter

这部分定义所有的环境参数。

```yaml
---
aspect_ratio: "16:9" # 强制的画幅设置 (16:9 横屏，9:16 竖屏短视频)
engine: "nano_banana_pro" # 默认使用的生图/视频模型引擎
global_style_postfix: "cinematic lighting, ultra detailed, masterpiece, arri alexa 65" # 全局强化的风格后缀
resolution: "2K" # 基准分辨率
---
```

### 2.2 正文：资产花名册 (Asset Roster)

在 YAML 块结束之后，是一份 Markdown 格式的清单。
**它的唯一作用是：宣告本工程拥有哪些合法的 `@` 实体资产。**
这既能让人类导演一目了然，又是底层 Agent（例如 `opsv-director`）校验分镜剧本是否出现越界或“无中生有”资产的重要字典。

清单应按以下标准分类列出所有实体（必须与其 `.md` 声明文件中的 YAML `name` 属性保持绝对一致）：

```markdown
# Asset Manifest

## Main Characters (主要角色)
- `@role_K`
- `@role_Emma`

## Extras (群演/次要角色)
- `@role_ThugA`
- `@role_ThugB`

## Scenes (空间场景)
- `@scene_NeonBar`
- `@scene_Wasteland`

## Props (关键道具)
- `@prop_Gun`
- `@prop_Kite`
```

## 3. 设计制约 (Constraints)

1. **唯一性**：一个 OpsV 工程只能有一个激活的 `project.md`。
2. **合法性前哨**：如果某个实体（如 `@prop_Car`）未在这个花名册中登记，那么底层的审查 Agent 理应视为语法违规，予以驳回。
3. **消除冗余**：开发者在编写 `videospec/shots/*.md` 时，如果试图给场景加写 `cinematic lighting`，底层编译器应当视为坏品味，因为这在 `global_style_postfix` 中已经提供了系统级的保障。

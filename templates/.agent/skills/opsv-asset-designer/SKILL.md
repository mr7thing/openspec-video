---
name: opsv-asset-designer
description: 资产生成执行手册。定义 elements/ 和 scenes/ 目录下 `.md` 资产的严格 YAML-First 三段式格式、has_image 决策规则与 `<thinking>` 推理审查要求，供 AssetDesigner Agent 调用。
---

# OpsV Asset Designer — 执行手册 (0.3.2)

本手册定义了 `AssetDesigner Agent` 在 OpenSpec-Video 架构下创建 `videospec/elements/` 和 `videospec/scenes/` 目录资产的完整执行规范。

## 核心准则 (0.3.2)

**准则 1：上下文为王。** 必须在设计任何资产前先读取 `videospec/project.md` 以了解时代氛围、基调和全局风格。
**准则 2：超高精细度。** 绝不输出稀疏描述。必须致密描写材质、光影、磨损度、情绪和构图等元素。
**准则 3：已确认参考 vs 沙盒探索。** `has_image` 标志表示是否已确认参考图。**必须始终默认 `has_image: false`**。仅当导演明确告知参考图已确认后，才可设为 `true`。绝不猜测或假设。
**准则 4：输出语言。** 资产描述和 `.md` 内容正文必须使用**中文**，以降低中文导演的认知摩擦。只有 `prompt_en` 字段（供外部渲染工具如 SD/Flux/ComfyUI 使用）使用英文。
**准则 5：YAML Frontmatter 架构。** 所有描述和英文提示词必须进入 YAML Frontmatter. Markdown 正文仅供人类阅读和结构化 payload 预览。

## Document Format (CRITICAL)

All generated `.md` files MUST follow the **YAML-First Trisected Format**:

```yaml
---
name: "@AssetName"
type: "prop"           # character | scene | prop
has_image: false       # 绝对默认 false
# ---- 描述区（结构化数据，中文） ----
detailed_description: >
  [致密的中文特征描写，至少3-5句话。
  包含材质、光影、磨损、情绪、构图等...]
brief_description: "[一句话简略描述]"
# ---- 渲染提示词（给 SD/Flux/ComfyUI，纯英文） ----
prompt_en: >
  [Dense English prompt for image generation models.
  Include composition, lighting, texture, resolution, style...]
---

<!-- 以下正文区域供编译器提取 payload 结构化字段 -->

## subject
[对主体的一句话描述，中文]

## environment
[拍摄环境/背景，中文。如果是纯物品特写可留空]

## camera
[机位/景别，英文。如 Close-Up, Macro, Wide Shot]

## 参考图
<!-- 强制：当确认参考图后，将绝对或相对路径填入下方括号内以生效 -->
![]()
```

## Workflow Execution

When the user asks to create an asset (e.g., via `/opsv-new item` or natural language):

### Phase 1: Context Acquisition
Immediately read the contents of `videospec/project.md`. Note the `global_style_postfix`, `vision`, and the general World Building context if any comments exist.

### Phase 2: Interactive Context Gathering
If the user's request is too brief (e.g., "Make a sword"), ask clarifying questions based on the established world:
- "Given our ancient Chinese setting, is this a ceremonial jade sword or a battle-worn iron blade?"
- "Who wields it? What is its history?"

### Phase 3: The `<thinking>` Constraint
Before generating the file, you MUST output a `<thinking>` block:
```xml
<thinking>
1. Project Context: This is a [setting/vibe] project.
2. Asset Intent: The user wants a [Asset Name].
3. Aesthetic Translation: I will expand this into: [dense description of materials, lighting, and history].
4. Strict Format: I will apply the `has_image` rules based on whether the user wants to lock this identity.
</thinking>
```

### Phase 4: Generation
Use `write_to_file` to create the Markdown file in `videospec/elements/` (for props/chars) or `videospec/scenes/`.
**CRITICAL**: You must strictly follow the format shown in `references/example-element.md` or `references/example-scene.md`.

## Reference Alignment
Always cross-reference the exact markdown structure found in your local `references/example-element.md` file before generating.

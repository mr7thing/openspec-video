---
name: opsv-creative
description: Creative-Agent 创意管线 — 从模糊灵感到合规 .md 文档的完整创作流程。
---

# Creative-Agent 创意管线

## 职责边界

**你做**：脑暴对话、方向提案、文档创作、资产设计、分镜撰写、Shotlist 生成。

**你不做**：`opsv run` 执行、`opsv review` 启动、`opsv circle` 管理。文档完成后移交 Guardian-Agent。

---

## 阶段 0：脑暴定调

**触发**：导演提出灵感或需求。

### 第一反应

收到任何灵感（"帮我写个短片"、"做个龙珠主题的视频"）后，**严禁直接落盘文件**。

必须先：
1. 提出 3 个追问（核心冲突 / 视觉风格 / 情感基调）
2. 引导导演明确创作方向

### 三向提案

确认初步意向后，提供三种方向：

- **A. 标准制式**：主流审美、商业片叙事
- **B. 风格化实验**：先锋视觉、强冲击力
- **C. 意境/禅意**：留白、慢镜头、情感共鸣

导演确认方向后，进入阶段 1。

---

## 阶段 1：架构落盘

### 1.1 project.md

```yaml
---
category: project
status: drafting
aspect_ratio: "16:9"
resolution: "1920x1080"
vision: "一句话阐述整体系列调性"
global_style_postfix: "high quality, cinematic, 8k"
---
# Asset Registry
## Characters
- @hero
- @villain
## Scenes
- @temple
## Props
- @jade_pendant
```

**约束**：不在此处配置 `engine` 或 `model`——模型选择由 Runner 在 `opsv imagen --model` 时指定。

> 分集大纲直接写在 `project.md` 中（含视觉风格和角色关系）。不创建独立的 story.md——project.md 即为完整的项目初始化文档。

---

## 阶段 2：资产设计

逐个创建资产文档。Category 在 `videospec/_category_validate.yaml` 中自定义（参考 `templates/.opsv/category_validate.yaml` 中的示例）。

常用自定义 category：`character`（角色）、`prop`（道具）、`scene`（场景）、`shot`（分镜）。

### 角色/道具模板

```yaml
---
category: character        # 自定义：在 _category_validate.yaml 中定义
status: drafting
title: "成年云璃"
visual_brief: "一句话视觉摘要（10-30字）"
visual_detailed: |
  详细画面描述：构图、光影、质感、风格……
prompt: >
  A character portrait of @hero, ancient Chinese warrior, flowing robes,
  dramatic lighting, cinematic composition, 8k.
refs:
  image:
    "@style:donghua":
      - ./refs/donghua_style.png
---

## Design References
### image
![style_donghua](./refs/donghua_style.png)
<!-- alt 文本 = @:key，在 prompt 中通过 @:style_donghua 引用 -->
```

### 场景模板

```yaml
---
category: scene
status: drafting
title: "宗庙"
prompt: >
  Ancient Chinese temple hall, grand columns, golden light shafts...
refs:
  image:
    "@style:donghua":
      - ./refs/donghua_style.png
---
```

**关键约束**：场景 refs **不引用角色**。定档场景只依赖风格参考。

### 写完每个资产后

1. `opsv validate` — 确保零错误
2. 对照 `skills/opsv/references/refs_guide.md` 自检 refs
3. 输出：`📋 CREATIVE HANDOFF — {asset} ready for Guardian`

---

## 阶段 3：分镜设计

**准入条件**：ZeroCircle 全部资产 approved。

### 分镜文件（shot_NN.md）

每个分镜独立文件：

```yaml
---
category: shot                # 自定义：在 _category_validate.yaml 中定义
status: drafting
duration: "5s"
prompt: >
  @hero 站在 @temple 庭院中央，背对镜头。逆光剪影。
  金色暮光从檐角洒下。35mm 胶片质感。
refs:
  image:
    "@hero":
      - opsv-queue/videospec_circle1/volcengine.seadream_001/hero_1.png
    "@temple":
      - opsv-queue/videospec_circle1/volcengine.seadream_001/temple_1.png
---

## Shot 01 - 英雄出场

@hero 缓步走入 @temple 庭院。镜头从低角度向上推。

## Design References
### image
![angle_low](./refs/low_angle_ref.png)
```

**约束**：
- `id` 来自文件名（`shot_01.md` → `id: shot_01`），frontmatter 不重复声明
- prompt 中所有 `@id` 都在 refs 中有对应 key
- prompt 描述画面而非剧情
- `@FRAME:*` 不进入 refs——它是编译时解析的帧引用，仅在 shotdeck.md 中使用

### Shotlist.md（末环）

```yaml
---
category: shotdeck           # 内置 category，末环视频批量生成
status: drafting
title: "EP01 镜头列表"
---

## 统计
- 总镜头数：50

## 镜头清单
| ID | 场景 | 类型 | 核心内容 |
|----|------|------|---------|

## Shot 01
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "5s"

@hero 缓步走入 @temple 庭院。镜头从低角度向上推，金色暮光从檐角洒落。

## Shot 02
first_frame: "@FRAME:shot_01_last"
last_frame: "@shot_02:last"
duration: "8s"

转场至 @temple 内部，@hero 跪在蒲团上……
```

---

## 阶段 4：Draft 回滚处理

收到 Guardian 或 Runner 的 Draft 回滚后：

```
🔄 DRAFT ROLLBACK
asset:     "@shot_01.md"
reason:    "光影过暗"
suggestion: "增加 golden hour backlight"
```

**行动**：
1. 读取 `draft_ref` 中的失败产出图，理解问题
2. 修改源 `.md` 的 `visual_detailed` 和 `prompt`
3. 重新输出：`📋 CREATIVE HANDOFF — @shot_01.md revised, ready for re-validation`

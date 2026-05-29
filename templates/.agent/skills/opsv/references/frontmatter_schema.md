# Frontmatter 字段规范

> 所有 OpsV 文档（`.md` 文件）的 YAML frontmatter 字段完整参考。

---

## 内置 Category

OpsV 只有 **两个** 内置 category。其余全部由用户在 `.opsv/category_validate.yaml` 中自定义。

| category | 用途 | 特殊行为 |
|----------|------|---------|
| `project` | 项目级元数据 | 跳过 prompt 检查（无视觉生成） |
| `shotlist` | 批量视频生成图纸，末环 EndCircle | 必含 `status`、`title` |

### project.md — 项目初始化必填

`project` 类型不参与视觉生成，它定义的是**全局创作约束**——所有下游文档应该继承这些设定。

```yaml
---
category: project
status: drafting
title: "女帝登基悔婚，跪求我修复龙脉"
genre: "玄幻/古装"               # 题材类型
aspect_ratio: "16:9"              # 画面比例
resolution: "1920x1080"           # 输出分辨率
vision: |
  古风东方玄幻美学。龙/凤图腾为核心视觉符号。
  金色（龙）与赤红（凤/火）为主色调。
  冷暖色调交替推进情绪节奏。
global_style_postfix: >
  Ancient Eastern fantasy, cinematic, 4K, hyper-detailed
total_episodes: 12
---

## 视觉风格

- **风格方向**：卡通 / 真人 / 老电影 / 赛博朋克 / 水墨...
- **世界观**：中国古代 / 中世纪欧洲 / 仙侠奇幻 / 末日废土...
- **参考作品**：《长安三万里》的古风画卷感...

## 角色关系
- **角色A**：身份、性格、弧光
- **角色B**：...

## 分集大纲
| 集数 | 核心事件 |
|------|---------|
| EP01 | ... |
```

**核心字段说明**：

| 字段 | 说明 |
|------|------|
| `genre` | 题材类型，影响整体风格走向 |
| `aspect_ratio` | 默认 `"16:9"` |
| `resolution` | 默认 `"1920x1080"` |
| `vision` | 整体视觉调性（一段话描述） |
| `global_style_postfix` | 追加到所有生成 prompt 的全局后缀 |
| `total_episodes` | 剧集总数 |

> project.md 不应包含 `prompt` / `visual_detailed` / `refs`——它不参与生成，`skip_prompt_check: true` 是内置默认。

---

### shotlist.md — 末环视频批量生成

`shotlist` 类型位于 Circle 拓扑的最末端（EndCircle），用于 `opsv animate` 编译。这是一个具有**特殊格式**的文档。

```yaml
---
category: shotlist
status: drafting
title: "EP01 镜头列表"
---

## 统计
- 总镜头数：50

## 镜头清单
| ID | 场景 | 类型 | 核心内容 |
|----|------|------|---------|
| 1-1-A | 海底 | establishing | 深海深渊，妖影翻涌 |
| 1-1-B | 海底 | dramatic | 徒手剖胸，龙珠离体 |
| 1-1-C | 海底 | dramatic | 龙珠嵌入婚碑，金光大盛 |

## Shot 01
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "10s"

@hero 站在 @temple 庭院中央...
```

> ⚠️ **shotlist 不是视频生成的唯一途径**。你完全可以在 ComfyUI 工作流（4 帧/9 帧）中基于任意 category 的文档生成视频。`shotlist` 是 OpsV 内置的**批量**视频编排格式，适用于传统 prompt→API 管线。

---

## 用户自定义 Category

除 `project` 和 `shotlist` 外，所有 category 都由用户在项目中定义。项目初始化后的 `templates/.opsv/category_validate.yaml` 提供了注释掉的示例模板。

### 配置位置与优先级

```
1. <project>/videospec/_category_validate.yaml   # 项目级（最高优先级）
2. ~/.opsv/category_validate.yaml                # 用户级
3. 内置默认（project + shotlist）                 # 兜底
```

### 常见自定义 Category 示例

```yaml
# videospec/_category_validate.yaml

element:
  required_fields: [status, title, visual_brief, prompt]
  field_schema:
    prompt:
      min_length: 10
      no_placeholder: true
      refs_in_prompt_must_match_refs: true

scene:
  required_fields: [status, title, prompt]
  field_schema:
    prompt:
      min_length: 10
      refs_in_prompt_must_match_refs: true

shot:
  required_fields: [status, prompt, refs]
  field_schema:
    prompt:
      min_length: 20
      no_placeholder: true
      refs_in_prompt_must_match_refs: true
```

### 验证规则字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `required_fields` | string[] | 必填字段列表 |
| `skip_prompt_check` | boolean | 跳过 prompt 相关检查 |
| `field_schema.<field>.min_length` | number | 字段最小长度 |
| `field_schema.<field>.max_length` | number | 字段最大长度 |
| `field_schema.<field>.no_placeholder` | boolean | 禁止 TODO/FIXME/XXX/TBD |
| `field_schema.<field>.refs_in_prompt_must_match_refs` | boolean | prompt ↔ refs 双向校验 |
| `severity` | error\|warning | 违规级别（默认 error） |

---

## 通用字段（所有 category）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | ✅ | `project` / `shotlist` / 或自定义 |
| `status` | string | ✅ | `drafting` / `syncing` / `approved` |
| `title` | string | 建议 | 文档标题 |
| `reviews` | array | — | 审查记录，由 `opsv review` 自动追加 |

---

## 视觉生成类文档通用字段

（适用于 `element` / `scene` / `shot` 等自定义 category）

| 字段 | 类型 | 说明 |
|------|------|------|
| `visual_brief` | string | 一句话视觉摘要（10-30 字） |
| `visual_detailed` | string | 详细画面描述（构图、光影、质感、风格） |
| `prompt` | string | 提交给生成模型的最终提示词 |
| `negative_prompt` | string | 负向提示词 |
| `refs` | object | 视觉输入依赖（见 `refs_guide.md`） |

### refs 结构

```yaml
refs:
  image:
    "@key":
      - path/1.png
  video:
    "@key":
      - path/video.mp4
  audio:
    "@key":
      - path/audio.mp3
```

- 顶级 key 为 input_type（`image` / `video` / `audio` / `bvh` / `mask` 等）
- input_type 必须在 `.opsv/input_types.yaml` 中注册
- 每个 `@key` 至少有 1 个路径

---

## Reviews 记录格式

由 `opsv review` 自动写入，Agent 只读：

```yaml
reviews:
  - timestamp: "2026-05-28T10:00:00.000Z"
    action: "approved"
    outputFile: "@hero_1.png"
    outputFiles:
      - "@hero_1.png"
    note: "光影效果好，通过"
  - timestamp: "2026-05-28T11:00:00.000Z"
    action: "syncing"
    outputFile: "@hero_2_1.png"
    modifiedTaskPath: "opsv-queue/videospec_circle1/volcengine.seadream_001/@hero_2.json"
```

### action 值

| 值 | 含义 |
|----|------|
| `approved` | 原始任务直接通过 |
| `syncing` | 修改任务通过，Agent 需对齐字段 |
| `design_feedback` | 设计反馈 |
| `revise_prompt` | 需要修改 prompt |

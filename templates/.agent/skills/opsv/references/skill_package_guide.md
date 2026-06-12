# OPSV 技能包开发指南 (Skill Package Development Guide v1.0)

> 作者基于「漫剧制作」技能包（10 子技能、5 阶段管线、9 自定义 category）的开发 + 审计实践凝练而成。
> 本文档面向：为 OPSV 项目创建自定义制式技能包的开发者。

---

## 目录

1. [核心概念](#1-核心概念)
2. [最小技能包结构](#2-最小技能包结构)
3. [Category 设计](#3-category-设计)
4. [验证规则系统](#4-验证规则系统)
5. [管线编排 (Pipeline)](#5-管线编排-pipeline)
6. [文件规范 (File Spec)](#6-文件规范-file-spec)
7. [input_type 扩展](#7-input_type-扩展)
8. [子技能设计原则](#8-子技能设计原则)
9. [审计检查清单](#9-审计检查清单)
10. [反模式](#10-反模式)

---

## 1. 核心概念

### OPSV 是什么

OPSV (OpenSpec Video) 是一个基于 Markdown 文档的媒体资产生成框架。核心理念：

- **文档即源码** — YAML frontmatter + Markdown body 描述一切资产
- **@ 引用语法** — 跨文档依赖通过 `refs` 声明，prompt 中用 `@id` 引用
- **状态机** — `drafting → ready → in_progress → approved` 串行门控
- **Circle 架构** — 按依赖层级分批编译（ZeroCircle → FirstCircle → EndCircle）

### 技能包是什么

一个技能包 = 一组 `.agent/skills/<name>/SKILL.md`，告诉 Agent：

- 该读哪些文档
- 该创建什么 category 的文档
- 该调用哪些 `opsv` 命令
- 产出的文件放在哪里、叫什么名字

**技能包 ≠ 代码。** 它是 Agent 的操作手册，opsv CLI 负责实际编译。

---

## 2. 最小技能包结构

```
project/
├── .opsv/
│   ├── api_config.yaml          # API 密钥（豆包/硅基流动等）
│   └── input_types.yaml         # 自定义输入类型注册
├── videospec/
│   ├── project.md               # 项目元数据（category: xxx_project）
│   └── _category_validate.yaml  # 自定义 category + 验证规则
└── .agent/
    └── skills/
        └── <your-pipeline>/
            ├── SKILL.md         # 管线入口（导航 + 门控规则）
            └── references/      # 规范文档
                ├── file_spec.md           # 产出文件规范（强烈推荐）
                ├── frontmatter_schema.md  # 字段规范（可从 opsv 模板复制）
                ├── refs_guide.md          # @ 引用语法指南
                └── cli_reference.md       # opsv CLI 命令速查
```

### 关键决策点

| 决策 | 建议 |
|------|------|
| 是否需要自定义 category？ | 业务对象 > 3 种时 → 是 |
| 是否需要子技能？ | 单 SKILL.md > 300 行时 → 拆 |
| `_category_validate.yaml` 放哪里？ | `videospec/` 下（项目级覆盖），不是 `~/.opsv/` |
| file_spec.md 放哪里？ | pipeline 的 `references/` 下，所有子技能共同引用 |

---

## 3. Category 设计

### 什么是 Category

Category 是文档的"类型标签"，定义在 frontmatter 中：

```yaml
---
category: comic_character   # ← 这个
status: drafting
title: "云璃 — 女帝概念图"
---
```

### 内置 vs 自定义

OPSV 只有 2 个内置 category：

| category | 用途 | 特殊行为 |
|----------|------|---------|
| `project` | 项目元数据 | `skip_prompt_check: true` |
| `shotlist` | 批量视频分镜 | 触发 EndCircle |

**其余全部自定义。** 用 `_category_validate.yaml` 声明。

### 命名规范

```
<业务域>_<资产类型>
```

- 漫剧：`comic_character`, `comic_storyboard`, `comic_voice`, `comic_episode`
- 广告：`ad_storyboard`, `ad_shot`, `ad_variant`
- 动画：`anim_scene`, `anim_shot`, `anim_voice`

**铁律**：一个业务域用统一前缀，不要混用 `comic_character` 和 `char_concept`。

### 设计原则

1. **一个 category 对应一种产出** — 不要 `comic_asset` 同时产出图片和视频
2. **category 数量 = 业务对象种类** — 漫剧有 9 种对象 = 9 个 category
3. **必填字段 ≠ 所有字段** — `required_fields` 只列"缺了就无法编译"的字段
4. **每种 category 明确产出类型** — 用 `input_type_linked`

---

## 4. 验证规则系统

### 声明位置

`videospec/_category_validate.yaml`，优先级高于 `~/.opsv/category_validate.yaml`。

### 规则类型

```yaml
comic_character:
  # 1. 必填字段 — 缺了直接报错
  required_fields: [status, title, visual_brief, visual_detailed, prompt]

  # 2. 字段约束 — opsv validate 自动检查
  field_schema:
    prompt:
      min_length: 20          # 最少字符数
      no_placeholder: true    # 禁止 "TODO"/"TBD" 等占位符
      refs_in_prompt_must_match_refs: true  # prompt 中的 @id 必须在 refs 中声明
    negative_prompt:
      min_length: 5

  # 3. 产出类型关联
  input_type_linked: image    # 声明此 category 产出的文件类型

  # 4. 验证命令 — opsv validate 不会执行这些，但 Agent 可手动运行
  verify:
    - command: "opsv validate"
      description: "校验文档完整性"
    - command: "opsv refs check {{file}}"
      description: "检查引用完整性"
    - command: "grep -qP 'shot_type:\s*\"(EWS|WS|MS)\"' {{file}}"
      description: "枚举值校验（opsv 原生不支持 enum，用 grep 补）"
```

### 重要限制

`opsv validate` **不支持**：
- `enum` / 枚举值校验
- `regex` / 正则模式匹配
- `max_length`
- 自定义字段间约束（如 "A 存在则 B 必须存在"）

**解决方案**：在 `field_schema` 的 `description` 中写清楚约束，在 `verify` 中用 `grep` 命令补枚举校验。

### CategoryValidator 支持的字段（v0.10.0）

| 字段 | 说明 |
|------|------|
| `min_length` | 字段最少字符数 |
| `max_length` | 字段最多字符数 |
| `no_placeholder` | 禁止 "TODO"/"TBD"/"todo"/"（待定）" |
| `refs_in_prompt_must_match_refs` | prompt 中 `@id` 必须全部在 `refs` 声明 |

### 版本管理

文件头注释标注版本号，每次修改递增：

```yaml
# 漫剧制作 Category 验证规则 (Comic Production v1.1)
```

---

## 5. 管线编排 (Pipeline)

### Pipeline SKILL.md 的职责

Pipeline 是**唯一的总控入口**。它不执行具体操作，而是：

1. **导航** — 告诉 Agent 各个子技能在哪
2. **门控** — 定义阶段间的前置条件
3. **交接协议** — 子技能间的 I/O 契约
4. **检查清单** — 每个阶段完成后的验证命令

### 导航表模板

```markdown
## 导航

| 需要什么 | 去哪里 |
|---------|--------|
| 剧本拆解 + 角色/场景设计 | `skills/<creative>/SKILL.md` |
| 分镜脚本 | `skills/<storyboard>/SKILL.md` |
| 资产生成（ComfyUI） | `skills/<comfyui>/SKILL.md` |
| 文件命名规范 | `skills/<pipeline>/references/file_spec.md` |
| CLI 命令速查 | `skills/opsv/references/cli_reference.md` |
| @ 引用语法 | `skills/opsv/references/refs_guide.md` |
```

### 阶段门控模板

```markdown
## 阶段门控

阶段一 → 阶段二的前提：
- [ ] 所有角色文档 status = approved
- [ ] 所有场景文档 status = approved
- [ ] 分集大纲完整（total_episodes 集全部列出）

阶段二 → 阶段三的前提：
- [ ] 所有分镜文档 status = approved
- [ ] 每镜 shot_type / camera_angle / transition 枚举合法
```

### 子步骤 I/O 契约

```markdown
### 子步骤 3B：角色概念图编译

**输入**：
- comic_character 文档（status: approved）
- 所有 .png 参考图（elements/characters/ 下 0-2 张风格参考）

**输出**：
- elements/characters/<char_id>_concept.png
- comic_character 文档 status → in_progress（编译中）→ approved（编译完成）

**依赖**：comic_character 全部 approved

**Agent 交接**：完成后不要自动进入 3C（场景编译）。
先运行 `opsv circle refresh` 确认依赖状态。
```

---

## 6. 文件规范 (File Spec)

### 为什么需要 file_spec.md

技能包的 5 个子技能各自描述文件命名规则 → Agent 可能读到矛盾信息。需要一个**单一事实来源**。

### file_spec.md 模板

参考 `comic-pipeline/references/file_spec.md`（176 行），核心内容：

```markdown
## 目录结构图
videospec/
├── project.md
├── characters/<id>.md
├── scenes/<id>.md
├── storyboards/<ep>_<scene>.md
├── voices/<char>/<shot>.md
├── sfx/<id>.md
├── shots/<ep>_<scene>_<num>.md
└── episodes/<ep>.md

## 文件类型一览表
| 类型 | 目录 | 命名规则 | 示例 |
|------|------|---------|------|
| 角色概念图 | elements/characters/ | <id>_concept.png | yunli_concept.png |

## Agent 自检命令
find elements/ -name "*.png" | sort
opsv circle status --json | jq '.pending | length'

## input_type ↔ Category 对照
| category | input_type | 产出扩展名 |
| comic_character | image | .png |
| comic_voice | voice | .wav |
```

### 关键原则

- **单一事实来源** — 文件命名规则只在一处定义
- **Agent 可直接执行的自检命令** — 每类资产配一条 shell 验证
- **命名规则可视化** — 用表格，不用散文

---

## 7. input_type 扩展

### 何时需要扩展

默认 input_types：`image`, `video`, `audio`。

当你的资产类型不在这三者中时（如三视图 `contact_sheet`、配音 `voice`、音效 `sfx`），必须在 `.opsv/input_types.yaml` 中注册。

### 注册格式

```yaml
input_types:
  voice:
    description: 配音/人声文件（TTS 生成）
    extensions: [.wav, .mp3, .ogg]

  sfx:
    description: 音效文件（环境音/拟音/打击音）
    extensions: [.wav, .mp3]

  contact_sheet:
    description: 角色多角度展示图（三视图/表情集）
    extensions: [.png, .jpg]
```

### 关联到 category

在 `_category_validate.yaml` 中用 `input_type_linked`：

```yaml
comic_voice:
  input_type_linked: voice   # ← 必须与 input_types.yaml 中的 key 一致
```

**Agent 可用此字段自检**：读取文档的 `category` → 查找 `input_type_linked` → 验证 `refs` 中的目标文档是否产出正确类型。

---

## 8. 子技能设计原则

### 何时拆分

- **单 SKILL.md > 300 行** → 拆
- **一个技能负责 > 3 种 category** → 拆
- **技能间有明确的 I/O 交接** → 拆

### 拆分粒度

漫剧技能包的拆分：

| 子技能 | 行数 | 负责 category | 理由 |
|--------|------|-------------|------|
| comic-creative | 374 | comic_project, comic_character, comic_scene | 创作阶段，纯文本 |
| comic-storyboard | 447 | comic_storyboard | 分镜是独立复杂领域 |
| comic-comfyui | 482 | comic_character_turnaround + 生成 | 技术实现，节点映射 |
| comic-voice | 201 | comic_voice | TTS 独立技术栈 |
| comic-animation | 245 | comic_shot | 视频生成独立引擎 |
| comic-post | 221 | comic_episode | 后期剪辑独立流程 |
| comic-pipeline | 500 | (门控，不生产) | 编排层 |

### 子技能 SKILL.md 模板

```markdown
---
name: comic-creative
description: 一句话说清职责（用于 Agent 匹配技能）
---

# 标题

## 职责边界

**你做**：A、B、C
**你不做**：X、Y、Z（交给 <other-skill>）

## 输入

- 类型 A 文档（status: ready）
- 参考资料路径

## 步骤

### 步骤 1：...

### 步骤 2：...

## 输出

- 类型 B 文档（status: drafting）
- 状态变更通知
```

### 铁律

1. **职责边界必须写在最前面** — Agent 匹配技能时只看 description，但执行时需要清楚边界
2. **不做的事要指明交给谁** — 防止 Agent 越权
3. **每个步骤标注输入/输出** — 方便 Guard 检查

---

## 9. 审计检查清单

技能包完成后，按此清单逐项检查：

### Category 一致性

- [ ] `_category_validate.yaml` 中每个 category 都有 `required_fields`
- [ ] `_category_validate.yaml` 中的 category 名称与所有文档 frontmatter 一致
- [ ] `_category_validate.yaml` 中的 category 名称与 pipeline SKILL.md 中的名称一致
- [ ] `_category_validate.yaml` 中的 category 名称与子技能 SKILL.md 模板中的名称一致

### 必填字段完整性

- [ ] 每个 category 的 `required_fields` 包含 `status` 和 `title`
- [ ] 每个有视觉产出的 category 包含 `prompt`
- [ ] 每个有依赖的 category 包含 `refs`

### 枚举值校验

- [ ] 所有有固定选项的字段在 `description` 中枚举了可选值
- [ ] 枚举值多的字段在 `verify` 中添加了 `grep` 校验命令

### 文件规范

- [ ] `file_spec.md` 覆盖了所有产出文件类型
- [ ] 文件命名规则在 `file_spec.md` 中有示例
- [ ] Pipeline 导航表引用了 `file_spec.md`

### input_type 关联

- [ ] 所有自定义 `input_type` 在 `.opsv/input_types.yaml` 中注册
- [ ] 所有 category 有 `input_type_linked` 字段
- [ ] `input_type_linked` 的值与 `input_types.yaml` 中的 key 一致

### 管线完整性

- [ ] Pipeline 导航表覆盖了所有子技能
- [ ] 每个阶段有门控条件
- [ ] 子技能间有明确的 I/O 交接

### 验证可用性

- [ ] `opsv validate` 运行通过（exit 0）
- [ ] 每个 category 的 `opsv validate --category <cat>` 运行通过
- [ ] `opsv circle refresh` 不报错

---

## 10. 反模式

### ❌ 反模式 1：Category 名称不一致

```yaml
# _category_validate.yaml
comic_project:
  required_fields: [status, title, genre]

# project.md
category: project   # ← 应该是 comic_project！验证规则永远不会生效
```

**修复**：用 `grep -r "category:" videospec/` 和 `_category_validate.yaml` 交叉对比。

### ❌ 反模式 2：验证规则写了但不用

```yaml
comic_character_turnaround:
  required_fields: [status, title, prompt]  # ← 但 category 没在 validate 中定义
```

**修复**：审计时用一个 category 一个 category 地过 `_category_validate.yaml`，确认每一个在文档中都有对应的模板。

### ❌ 反模式 3：文件命名规则散落各处

```
comic-creative/SKILL.md:  "输出 elements/characters/<id>_concept.png"
comic-comfyui/SKILL.md:   "保存到 elements/characters/<id>.png"
comic-pipeline/SKILL.md:  "路径：outputs/<id>_char.png"
```

**修复**：所有命名规则集中到 `file_spec.md`，其他文件只引用。

### ❌ 反模式 4：枚举值只写在散文中

```markdown
shot_type 可选值为：EWS, WS, MS, MCU, CU, ECU, OTS, POV, INSERT
```

Agent 只能"阅读理解"，没有程序化校验。

**修复**：在 `_category_validate.yaml` 中用 `verify` + `grep` 补枚举校验。

### ❌ 反模式 5：input_type 注册了但没关联 category

```yaml
# .opsv/input_types.yaml
voice:
  extensions: [.wav, .mp3]

# _category_validate.yaml
comic_voice:
  required_fields: [status, title]
  # ← 没有 input_type_linked: voice
```

**修复**：每个 category 加 `input_type_linked`。

---

## 附录：漫剧技能包完整架构

```
videospec/
├── project.md                          # comic_project
├── _category_validate.yaml             # 9 个 category 规则
├── characters/                         # comic_character × N
├── scenes/                             # comic_scene × N
├── storyboards/                        # comic_storyboard × N
├── voices/                             # comic_voice × N
├── sfx/                                # comic_sfx × N
├── shots/                              # comic_shot × N
└── episodes/                           # comic_episode × N

.opsv/
├── api_config.yaml
└── input_types.yaml                    # voice, sfx, animatic, contact_sheet

.agent/skills/
├── comic-pipeline/SKILL.md             # 总控：导航 + 门控
│   └── references/
│       └── file_spec.md                # 单一文件规范
├── comic-creative/SKILL.md             # 阶段一：剧本拆解
├── comic-storyboard/SKILL.md           # 阶段二：分镜设计
├── comic-comfyui/SKILL.md              # 阶段三：ComfyUI 生图
├── comic-voice/SKILL.md                # 阶段四：配音
├── comic-animation/SKILL.md            # 阶段四：视频生成
├── comic-post/SKILL.md                 # 阶段五：后期成片
└── opsv/                               # OPSV 框架参考（来自模板）
    ├── SKILL.md
    └── references/
        ├── frontmatter_schema.md
        ├── refs_guide.md
        └── cli_reference.md
```

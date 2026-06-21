# Clacky 技能创建规范 v1.0

> 本规范适用于 Clacky 体系下所有技能（包括 OPSV 技能包）。
> 所有新创建的技能必须符合此规范。

---

## 1. 目录结构

```
<skill-name>/
├── SKILL.md              # 技能主文件（必需）
├── references/           # 参考文档目录（按需）
│   ├── template_xxx.md
│   └── guide_xxx.md
└── scripts/              # 脚本/工具（按需）
    └── helper.sh
```

### 规则

- **每个技能有自己独立的 `references/` 目录**，不允许将所有引用文档集中放到某个统一目录
- 该技能自己用的参考文档放在自己的 `references/` 下
- 跨技能引用的共享文档用相对路径：`../<other-skill>/references/xxx.md`
- `references/` 目录下的文档**必须有实际内容**，不允许空壳

---

## 2. SKILL.md 规范

### 2.1 frontmatter（必需字段）

```yaml
---
name: <skill-name>              # kebab-case，与目录名一致
description: <完整描述>          # 包含：功能说明 + 触发条件（何时使用）
disable-model-invocation: false  # 是否禁止模型直接调用（默认 false）
user-invocable: true             # 用户是否可直接调用（默认 true）
---
```

### 2.2 frontmatter（可选字段）

```yaml
version: "1.0.0"
allowed-tools: Bash(<tool>:*)
metadata:
  requires:
    bins: ["<binary>"]
  author: <author>
```

### 2.3 description 编写规范

`description` 是技能触发匹配的关键，必须包含：

1. **功能说明**：技能做什么
2. **触发关键词**：用户说哪些话会触发此技能（中英文都覆盖）
3. **与相似技能的区分**：避免误匹配

```yaml
# ✅ 好的 description
description: 'Download HuggingFace models to the correct local directory. Use this skill whenever the user wants to download a model from HuggingFace — any URL like huggingface.co/user/repo...'

# ❌ 坏的 description
description: '下载模型'
```

---

## 3. 正文结构规范

### 3.1 标题

```markdown
# <技能名称> — <一句话描述>
```

### 3.2 概述（必需）

开篇用一句话说明技能的核心功能、输入和产出。

```markdown
> **输入**: <上游数据/文档>
> **产出**: <本技能产出的文件/结果>
```

### 3.3 工作流程（必需）

用分步骤或流程图描述技能的核心操作流程。

### 3.4 注意事项（推荐）

记录踩过的坑、常见错误、边界情况。

---

## 4. OPSV 技能附加规范

OPSV 体系下的技能（如 multi-ref-pack 中的 S0-S7），在 §3 正文结构基础上，**必须额外覆盖以下 7 个关切**，作为一个独立章节：

```markdown
## N. 这 7 个关切在本技能如何贯彻

### ① 生产流程
本阶段的输入→处理→产出步骤

### ② 依赖处理
上游依赖、验证规则、任务环 gate

### ③ 提示词生成
prompt 的编写规范和信息来源

### ④ 引用语法
`@id` / `@:key` / `refs` 的使用方式

### ⑤ 任务环编排
在任务环层级中的位置和约束

### ⑥ 迭代与 Review
审阅标准、iterate 路径、syncing 回写

### ⑦ 资产回写
`asset_id` 回写时机和格式
```

---

## 5. 引用文档规范（references/）

### 5.1 文档命名

```
kebab-case.md
```

示例：`script_template.md`、`shot_breakdown_guide.md`

### 5.2 文档内容

每个 reference 文档必须包含：

- 标题和适用阶段说明
- 具体模板/示例/参数表
- 与 skill 主文件的对应关系

### 5.3 引用方式

在 SKILL.md 中用相对路径引用：

```markdown
详见 references/script_template.md
```

跨技能引用：

```markdown
命名规则见 ../multi-ref-production/references/post_review_iteration.md
```

---

## 6. 命名规范

| 层级 | 格式 | 示例 |
|------|------|------|
| 技能目录名 | `kebab-case` | `hf-model-downloader` |
| SKILL.md 中 `name` | 与目录名一致 | `hf-model-downloader` |
| reference 文件名 | `snake_case.md` | `script_template.md` |

---

## 7. 反模式（禁止做法）

| 反模式 | 正确做法 |
|--------|---------|
| 把所有 reference 集中到统一 `references/` 目录 | 每个技能有自己的 `references/` |
| reference 文档为空壳 | 必须填充实际内容 |
| 在 SKILL.md 中写死具体文件名（如 `@LuRan_1.png`） | 用通用描述（如 `{文档id}_{序号}.png`） |
| 描述规则时绑定具体示例值 | 用占位符 + 标注示例 |
| 跨技能引用写绝对路径或假路径 | 用相对路径 `../<other>/references/xxx.md` |

---

## 8. 检查清单（创建新技能时逐项确认）

- [ ] 目录名为 `kebab-case`，与 frontmatter `name` 一致
- [ ] `description` 包含功能说明 + 触发关键词
- [ ] 开篇有概述（输入/产出）
- [ ] 有明确的工作流程描述
- [ ] `references/` 在技能目录内（非集中存放）
- [ ] 所有引用的 reference 文档都存在且有内容
- [ ] 跨技能引用使用正确的相对路径
- [ ] （OPSV 技能）覆盖了 7 个关切
- [ ] 无写死的具体文件名、无空壳文档

---

> 本规范基于 Clacky 现有技能（lark-doc、browser-act、clacky-tts、hf-model-downloader 等）和 OPSV multi-ref-pack 的实践经验总结。

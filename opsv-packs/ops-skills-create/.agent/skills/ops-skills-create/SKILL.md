---
name: ops-skills-create
description: >
  Guide agents on how to create, validate, and maintain OPSV skill packs.
  Use this skill whenever the user wants to create a new OPSV skill pack,
  design a skill following the SKILL_SPEC.md standard, audit an existing
  skill pack, or learn the methodology behind OPSV skill design.
  Trigger on: "create skill", "new skill pack", "design a skill",
  "技能创建", "创建技能包", "设计一个新技能", "审计技能包".
  Distinguishes from other skills by focusing on SKILL DESIGN METHODOLOGY,
  not on video production execution.
disable-model-invocation: false
user-invocable: true
---

# OPSV 技能包创建指南

> **功能**: 指导 Agent 从零创建符合规范的 OPSV 技能包
> **输入**: 用户需求描述（要解决什么问题、在管线中的哪个阶段）
> **产出**: 完整的技能包目录（SKILL.md + references/ + AGENTS.md）

---

## 1. 核心原则

在创建任何技能包之前，牢记用户制定的 **7 条核心设计原则**：

| # | 原则 | 含义 |
|---|------|------|
| 1 | **管线先行** | 先确定技能在整个 S0-S7 管线中的位置，再设计内部细节 |
| 2 | **门控关卡** | 每个技能必须有明确的触发条件和验收标准（`opsv validate`） |
| 3 | **分类驱动** | 使用 `_category_validate.yaml` 定义校验规则，而非硬编码逻辑 |
| 4 | **文档即契约** | SKILL.md 就是技能与用户的契约，必须清晰、完整、可执行 |
| 5 | **引用图谱** | 用 `@id` / `@:key` / `refs` 建立技能间的依赖关系网络 |
| 6 | **技能隔离** | 每个技能只做一件事，职责边界清晰，references 独立存放 |
| 7 | **渐进构建** | 从小技能开始，逐步组合成复杂管线，每次创建后验证 |

---

## 2. 创建流程

```
用户需求描述
     │
     ▼
┌──────────────────────┐
│ Step 1: 定位管线阶段  │  确定 S0-S7 中的哪个阶段，输入/产出是什么
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 2: 定义职责边界  │  明确"你做"和"你不做"，防止职责溢出
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 3: 设计目录结构  │  创建 SKILL.md + references/ 骨架
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 4: 编写 SKILL.md │  按规范填写 frontmatter + 正文（7 个关切）
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 5: 编写 references│  提供模板、示例、指南（不允许空壳）
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 6: 创建 AGENTS.md│  定义 Agent 角色分工（如需要）
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 7: 验证技能包    │  opsv validate --category <skill_name>
└──────────────────────┘
```

---

## 3. 目录结构规范

每个技能包的标准目录：

```
<skill-pack-name>/
├── SKILL_SPEC.md              # 本规范文档（可选，用于记录特定约束）
├── .agent/
│   ├── AGENTS.md              # Agent 角色分工（可选，多 Agent 场景需要）
│   └── skills/
│       └── <skill-name>/
│           ├── SKILL.md       # 技能主文件（必需）
│           └── references/    # 参考文档目录（必需，不允许空壳）
│               ├── template_xxx.md
│               ├── guide_xxx.md
│               └── sample_xxx.md
```

### 关键规则

1. **每个技能有独立的 `references/` 目录**，不允许将所有引用文档集中
2. **references 必须有实际内容**，不允许空壳目录
3. **跨技能引用**使用相对路径：`../<other-skill>/references/xxx.md`
4. **SKILL.md 必须覆盖 7 个关切**（见下文）

---

## 4. SKILL.md 编写规范

### 4.1 Frontmatter（必需）

```yaml
---
name: <kebab-case-skill-name>
description: <完整描述，包含功能 + 触发条件 + 与相似技能的区分>
disable-model-invocation: false
user-invocable: true
---
```

### 4.2 正文结构（必需章节）

每个 SKILL.md 必须包含以下章节：

#### ① 概述
> **阶段**: S<n> · <阶段名称>
> **输入**: <上游数据/文档>
> **产出**: <本技能产出的文件/结果>
> **技能数**: <本技能独占还是共享>

#### ② 职责边界
- **你做**：列出本技能负责的具体事项
- **你不做**：明确排除的职责，防止溢出

#### ③ 触发条件
- 前置依赖必须满足的条件
- 上游文档必须存在的文件

#### ④ 工作流程
- 分步骤的操作流程（可用流程图或编号步骤）
- 每一步的输入、处理、输出

#### ⑤ 这 7 个关切在本技能如何贯彻
| 关切 | 本技能的处理方式 |
|------|-----------------|
| 生产流程 | 输入→处理→产出的具体步骤 |
| 依赖处理 | 上游验证规则、任务环 gate |
| 提示词生成 | prompt 编写规范和信息来源 |
| 引用语法 | `@id` / `@:key` / `refs` 的使用 |
| 任务环编排 | 在 Circle 中的位置和约束 |
| 迭代与 Review | 审阅标准和 iterate 路径 |
| 质量控制 | 验收标准和 validate 规则 |

#### ⑥ 注意事项（踩过的坑）
- 记录常见错误、边界情况、特殊处理

---

## 5. References 编写规范

### 5.1 必备内容

每个技能的 references 应至少包含：

| 文档类型 | 用途 | 示例 |
|----------|------|------|
| **模板** | 标准化的文档模板 | `template_element.md` |
| **示例** | 展示正确格式的样例 | `sample_character.md` |
| **指南** | 专项操作指导 | `guide_prompt_writing.md` |
| **检查清单** | 验收前的自检项 | `quality_checklist.md` |

### 5.2 命名规范

- 模板文件：`template_<type>.md`
- 示例文件：`sample_<type>.md`
- 指南文件：`guide_<topic>.md`
- 检查清单：`<topic>_checklist.md`

### 5.3 内容要求

- 模板必须包含完整的 YAML frontmatter 示例
- 示例必须展示最佳实践
- 指南必须可执行，不能只是理论描述

---

## 6. AGENTS.md 编写规范

当技能涉及多个 Agent 角色协作时，创建 `.agent/AGENTS.md`：

```markdown
# Agent 系统

本技能包定义了以下 Agent 角色的分工：

## 1. <角色名> Agent (<职责>)
- 职责描述
- 具体任务列表
- **不做**：排除事项

## 2. <角色名> Agent (<职责>)
...

## 工作流
```
<Creative> ──[产出文档]──→ <Guardian> ──[validate + approve]──→ <Runner>
    │                              │                              │
    └──────────── [iterate] ←──────┴──────────────────────────────┘
```
```

### 最小 Agent 模型

| 角色 | 职责 | 典型命令 |
|------|------|----------|
| **Creative** | 创意产出、prompt 编写、引用设计 | 文档创建、prompt 编写 |
| **Guardian** | 校验、状态管理、审阅、Circle 管理 | `opsv validate`, `opsv review`, `opsv approved` |
| **Runner** | 纯任务执行、编译、运行 | `opsv imagen`, `opsv animate`, `opsv run` |

---

## 7. 常见技能包模式

### 模式 A：单技能独占阶段

适用于简单阶段，一个 SKILL.md 覆盖全部内容。

```
multi-ref-design/
├── SKILL.md          # 角色/场景/道具定档
└── references/
    ├── template_element.md
    └── sample_character.md
```

### 模式 B：多技能协作阶段

适用于复杂阶段，拆分为多个子技能。

```
opsv-ref-pipeline/
├── SKILL.md          # 管线总览（S0）
├── references/
│   ├── cli_reference.md
│   └── file_spec.md
└── AGENTS.md         # 三 Agent 角色分工
```

### 模式 C：跨技能共享参考

多个技能引用同一份参考文档。

```
# 技能 A
skills/skill-a/
└── references/
    └── prompt_guide.md

# 技能 B 引用技能 A 的参考
skills/skill-b/
└── references/
    └── ../skill-a/references/prompt_guide.md   # 相对路径引用
```

---

## 8. 验证清单

创建技能包后，按以下清单逐项检查：

- [ ] SKILL.md 有完整的 frontmatter（name, description, disable-model-invocation）
- [ ] description 包含功能说明 + 触发条件 + 与相似技能的区分
- [ ] SKILL.md 覆盖了全部 7 个关切
- [ ] references/ 目录有实际内容（非空壳）
- [ ] 模板文件有完整的 YAML frontmatter 示例
- [ ] 职责边界清晰（"你做"和"你不做"）
- [ ] 触发条件列出了前置依赖
- [ ] 工作流程有明确的输入→处理→产出
- [ ] 验收标准包含 `opsv validate` 命令
- [ ] 如有多 Agent 协作，AGENTS.md 定义了角色分工
- [ ] 创建了 Circle 后能成功 `opsv validate`

---

## 9. 创建即验证

**每个创建文档的技能必须在最后一步包含验证命令。**

这是强制要求，不是建议。技能包的创建流程必须以 `opsv validate` 收尾：

```bash
# 验证整个技能包
opsv validate --category <skill_name>

# 或验证指定目录
opsv validate --dir <skill-directory>
```

如果验证不通过，必须修复后再提交。

---

## 10. 参考资源

- **SKILL_SPEC.md**: 技能创建规范（frontmatter、目录结构、7 个关切覆盖要求）
- **multi-ref-pack**: 完整的 OPSV 技能包示例，包含 S0-S7 所有阶段
- **opsv-cli**: 命令行工具参考

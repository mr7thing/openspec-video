---
name: skill-template
description: OPSV 技能包标准模板 — 用于快速创建新的技能 SKILL.md
---

# 技能包模板

> 复制此模板创建新的技能包

---

## SKILL.md 模板

```yaml
---
name: <kebab-case-skill-name>
description: >
  <功能说明>。Use this skill whenever the user wants to <触发场景>。
  Trigger on: <中英文触发词>。
  Distinguishes from similar skills by <区分点>。
disable-model-invocation: false
user-invocable: true
---

# <技能名称>

> **阶段**: S<n> · <阶段名称>
> **输入**: <上游数据/文档>
> **产出**: <本技能产出的文件/结果>
> **技能数**: <独占/共享>

---

## 1. 职责边界

**你做**：
- <职责1>
- <职责2>

**你不做**：
- <排除1>
- <排除2>

---

## 2. 触发条件

- <前置条件1>
- <前置条件2>

---

## 3. 工作流程

```
<输入>
  │
  ▼
┌──────────────────────┐
│ Step 1: <步骤名>      │
│ <描述>                │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Step 2: <步骤名>      │
│ <描述>                │
└──────────┬───────────┘
           ▼
<输出>
```

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
<描述>

### ② 依赖处理
<描述>

### ③ 提示词生成
<描述>

### ④ 引用语法
<描述>

### ⑤ 任务环编排
<描述>

### ⑥ 迭代与 Review
<描述>

### ⑦ 质量控制
<描述>

---

## 5. 注意事项

1. <注意点1>
2. <注意点2>

---

## 6. 验收

```bash
opsv validate --category <skill_name>
```
```

---

## 目录结构模板

```
<skill-name>/
├── SKILL.md
├── references/
│   ├── template_<type>.md
│   ├── sample_<type>.md
│   └── guide_<topic>.md
└── AGENTS.md          # （可选，多 Agent 场景）
```

---

## Frontmatter 字段说明

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | kebab-case，与目录名一致 |
| `description` | 是 | 完整描述，包含功能+触发条件+区分点 |
| `disable-model-invocation` | 否 | 是否禁止模型直接调用（默认 false） |
| `user-invocable` | 否 | 用户是否可直接调用（默认 true） |

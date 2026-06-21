---
name: common-patterns
description: OPSV 技能包常见设计模式 — 展示三种典型的技能包结构和适用场景
---

# 常见技能包设计模式

> 基于 multi-ref-pack 实战总结的三种典型模式

---

## 模式 A：单技能独占阶段

**适用场景**：简单阶段，一个 SKILL.md 覆盖全部内容

**示例**：`multi-ref-design`

```
multi-ref-design/
├── SKILL.md              # 角色/场景/道具定档全流程
└── references/
    ├── template_element.md    # 定档文档模板
    ├── sample_character.md    # 角色定档示例
    └── sample_scene.md        # 场景定档示例
```

**特点**：
- 一个 SKILL.md 包含所有步骤
- references 提供模板和示例
- 适合职责单一、流程清晰的阶段

---

## 模式 B：多技能协作阶段

**适用场景**：复杂管线，需要总览 + 专项技能

**示例**：`opsv-ref-pipeline`

```
opsv-ref-pipeline/
├── SKILL.md              # 管线总览（S0-S7）
└── references/
    ├── cli_reference.md      # CLI 命令速查
    └── file_spec.md          # 文件命名规范
```

**特点**：
- SKILL.md 作为入口点，提供全局视角
- references 提供专项参考
- 适合需要导航、编排的场景

---

## 模式 C：多 Agent 协作

**适用场景**：需要 Creative/Guardian/Runner 分工

**示例**：`multi-ref-pack` 整体

```
multi-ref-pack/
├── SKILL_SPEC.md              # 规范文档
├── .agent/
│   ├── AGENTS.md              # 三 Agent 角色分工
│   └── skills/
│       ├── opsv-ref-pipeline/     # S0 管线总览
│       ├── multi-ref-design/      # S3 定档设计
│       ├── beat-script/           # S2 剧本拆解
│       └── ...
```

**特点**：
- AGENTS.md 定义角色职责和工作流
- 每个技能独立，通过 refs 关联
- 适合复杂的多阶段管线

---

## 选择建议

| 因素 | 选模式 A | 选模式 B | 选模式 C |
|------|----------|----------|----------|
| 阶段复杂度 | 低 | 中 | 高 |
| Agent 数量 | 1 | 1-2 | 3+ |
| 是否需要导航 | 不需要 | 需要 | 需要 |
| 技能数量 | 1 | 1+N | N+ |

---

## 跨技能引用

当多个技能需要共享参考文档时：

```
# 技能 A 拥有参考文档
skills/skill-a/
└── references/
    └── prompt_guide.md

# 技能 B 引用技能 A 的文档
skills/skill-b/
└── references/
    └── ../skill-a/references/prompt_guide.md
```

**注意**：使用相对路径引用，不要复制副本。

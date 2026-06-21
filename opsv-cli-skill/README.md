# opsv-cli-pack — OPSV 命令操作员技能包

> **定位**：教 Agent「如何使用 OPSV 命令」的基础技能。不讲任何生产流程内容。

## 这是什么

`opsv-cli` 是一个**操作员手册**类技能：它告诉 Agent OPSV 提供哪些命令、每个命令要求文档按什么规范写、哪些事绝对不能做。加载这一个技能，Agent 就具备了驱动整个 OPSV 管线的能力。

## 与 multi-ref-pack 的关系

| 包 | 职责 | 回答的问题 |
|----|------|-----------|
| **opsv-cli-pack**（本包） | 命令用法 + 文档规范 | "怎么用？文档要写成什么样？" |
| multi-ref-pack | 生产流程 S0-S7 | "现在做哪一步？这一步产出什么？" |

两个包**互补不重叠**。本包是地基，multi-ref-pack 是流程。

## 目录

```
opsv-cli-pack/
├── README.md                         # 本文件
└── .agent/skills/opsv-cli/
    ├── SKILL.md                      # 操作员手册（单一入口）
    └── references/
        ├── cli_reference.md          # 全量命令手册（18 命令，按组分类）
        ├── lifecycle_and_status.md   # 文档生命周期 + 三状态 + syncing 回写
        ├── refs_syntax.md            # @ 引用语法 + refs 字典规则
        └── validate_and_iterate.md   # validate 加载顺序/类别机制 + iterate 迭代命名
```

## 真相基准

本包所有内容**以 `videospec` NPM 包源码（`src/`）的实际行为为准**。与 `DESIGN_DECISIONS.md` 的分歧已记录在仓库根的 `AUDIT_FINDINGS.md`，文档侧由项目所有者择期对齐。

## 版本基线

对应 `videospec` v0.11.4（见 `package.json`）。

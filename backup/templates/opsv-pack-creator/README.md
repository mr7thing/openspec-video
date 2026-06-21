# OPSV Skills Pack Creator

> 从"想做什么"到"可用的技能包骨架" — 7 步脚手架方法论

## 这是什么

这个技能封装了创建 OPSV 技能包的 **7 条核心原则** 和 **7 步脚手架流程**。它来自 Dragon_Ball 漫剧技能包的创建实战提炼。

它不是模板复制工具，而是设计方法论引擎——帮你从原始想法推演出完整的技能包架构。

## 7 条核心原则

| # | 原则 | 一句话 |
|---|------|--------|
| 1 | **管线先行** (Pipeline-First) | 先定义管线，再写技能 |
| 2 | **门控关卡** (Gate-Controlled) | 不合格产物不允许流入下阶段 |
| 3 | **分类驱动** (Category-Driven) | category 是技能包的骨架 |
| 4 | **文档即契约** (Document-as-Contract) | Frontmatter 是契约，正文是内容 |
| 5 | **引用图谱** (Refs DAG) | refs 双向可追溯、无环 |
| 6 | **技能隔离** (Skill Isolation) | 一个技能只写自己目录的文件 |
| 7 | **渐进构建** (Progressive Build) | 逐层构建，不一口气建完 |

## 7 步脚手架

```
Step 0: 初始化目录
Step 1: 用户画像 (USER.md)
Step 2: 代理人设 (AGENTS.md)
Step 3: 管线定义 (pipeline/SKILL.md)
Step 4: 分类注册 (category_validate.yaml)
Step 5: 技能编写 (skills/*/SKILL.md)
Step 6: 指南编写 (guides/*.md)
Step 7: 验收闭环
```

## 使用方法

```bash
# 1. 切换到 opsv-packs 目录
cd opsv-packs

# 2. 初始化技能包目录
mkdir -p my-pack/.agent/{skills,guides}
mkdir -p my-pack/videospec/directive

# 3. 打开 SKILL.md，遵循 7 步脚手架创建
```

详细步骤参见 `SKILL.md`。

## 目录结构

```
opsv-pack-creator/
├── SKILL.md                          # 核心技能定义（7原则 + 7步脚手架）
├── README.md                         # 本文件
├── references/
│   ├── skill-skeleton.md             # 阶段技能 SKILL.md 骨架参考
│   ├── guardian-skeleton.md          # 守护者技能骨架参考
│   ├── category-validate-skeleton.yaml  # 分类验证规则骨架参考
│   └── checklist.md                  # 创建清单（质量门控）
```

# opsv-cli-skill — OPSV 命令操作员技能（独立包）

> **定位**：教 Agent「如何使用 OPSV 命令」的基础技能。只讲命令用法与文档规范，不讲任何生产流程内容。

## 这是什么

`opsv-cli-skill` 是一个**操作员手册**类技能：它告诉 Agent OPSV 提供哪些命令、每个命令要求文档按什么规范写、哪些事绝对不能做。加载这一个技能，Agent 就具备了驱动整个 OPSV 管线的能力。

## 技能边界

`opsv-cli-skill` 是命令层技能，**只负责**：

- 命令用法与参数解释
- 文档格式规范（frontmatter / refs / category 等）
- 反模式清单（哪些操作不能做）

它**不负责**生产流程的阶段划分（什么阶段做什么事、产出什么）——那是上层流程技能（如短剧管线 multi-ref-pipeline）覆盖的范畴。

两者互补不重叠，但**各自独立安装**：本包是命令地基，不与上层流程技能硬绑定，上层流程技能可独立替换或并存。

## 目录

```
opsv-cli-skill/
├── SKILL.md                      # 操作员手册（单一入口）
└── references/
    ├── cli_reference.md          # 全量命令手册（18 命令，按组分类）
    ├── lifecycle_and_status.md   # 文档生命周期 + 三状态 + syncing 回写
    ├── refs_syntax.md            # @ 引用语法 + refs 字典规则
    └── validate_and_iterate.md   # validate 加载顺序/类别机制 + iterate 迭代命名
```

## 标准框架安装

本技能遵循标准 agent skill 规范（Claude Code / ZCode / OpenClaw 通用）。`SKILL.md` 的 `name` 字段与目录名一致（`opsv-cli-skill`），frontmatter 仅保留 `name` + `description`。

**挂载方式**：将本目录放入项目的 agent skills 发现路径即可被框架自动发现：

```bash
# 项目级（仅当前仓库可用）
cp -r opsv-cli-skill  <project>/.agents/skills/opsv-cli-skill

# 用户级（所有项目可用）
cp -r opsv-cli-skill  ~/.agents/skills/opsv-cli-skill
```

发现优先级（高 → 低）：
- `<project>/.zcode/skills/<name>/SKILL.md`
- `<project>/.agents/skills/<name>/SKILL.md`
- `~/.zcode/skills/<name>/SKILL.md`
- `~/.agents/skills/<name>/SKILL.md`

加载后无需额外配置——Agent 在触发条件命中时（用户说"opsv init""validate""怎么编译/跑这个文档"等）自动读取本技能。

## 真相基准

本包所有内容**以 `videospec` NPM 包源码（`src/`）的实际行为为准**。文档侧由项目所有者择期对齐。

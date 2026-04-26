# OpsV Skill 审计报告 — 2026-04-26

审计对象：`templates/.agent/skills/opsv/` (OpsV v0.7.0 核心技能)
审计方法：skill-creator 框架五维标准（完整性、清晰性、一致性、可测试性、可维护性）+ 源码交叉校验
审计范围：SKILL.md, creative-workflow.md, ops-workflow.md, references/ 全部 8 个文件
交叉比对源码：validate.ts, circle.ts, DependencyGraph.ts, FrontmatterSchema.ts, circleStatus.ts, imagen.ts, animate.ts, queue.ts, AssetManager.ts, AnimateGenerator.ts

---

## 质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **完整性** | 7/10 | 覆盖核心概念与工作流，但缺 `pending` 状态正式定义、`--skip-depend-layer` 文档、shot Schema 与代码不一致 |
| **清晰性** | 8/10 | 结构清晰，阶段划分明确，铁律标注醒目。但 `id` 示例自相矛盾、状态流转图遗漏 `pending` |
| **一致性** | 5/10 | 多处模板与规范矛盾（engine 字段、approved 无图、refs 复制粘贴、pending 未入枚举），最大薄弱项 |
| **可测试性** | 6/10 | 有 `opsv validate` 作校验工具，但部分规则（id↔filename、pending 状态）无程序化校验，依赖 Agent 自律 |
| **可维护性** | 7/10 | 模块化分文件结构好，但版本标注散落（v0.5/v0.6.4/v0.7.0 混杂），迁移注释未清理 |

**综合**: 6.6/10

---

## 🔴 Critical Issues (P0 — 必须修复，直接导致 validate 报错或运行时异常)

### S1: project_template.md 包含已废弃的 `engine` 字段

**位置**: `references/project_template.md:4`

```yaml
engine: "siliconflow"
```

**矛盾**:
- `SKILL.md:69` / `creative-workflow.md:70` 明确铁律："**严禁**在 project.md 中配置 `engine` 等执行流参数，模型选择由 Runner-Agent 在 `opsv queue compile` 时通过 `--model` 指定"
- `FrontmatterSchema.ts:42` 中 `engine` 标记为 `optional()`，源码全局 grep 无任何业务逻辑使用此字段
- 模板文件却包含 `engine: "siliconflow"`，直接违反自身铁律

**修复**: 删除 `references/project_template.md` 中的 `engine: "siliconflow"` 行。

---

### S2: scene_template.md `status: approved` 但无 Approved References 图片

**位置**: `references/scene_template.md:3`

```yaml
status: "approved"
```

**矛盾**:
- SKILL.md 一致性铁律："`status: approved` 的文档**必须**包含至少一张有效的 `## Approved References` 参考图"
- `opsv validate` 会校验此规则（`validate.ts:206-212`），违反直接报错
- `scene_template.md` 的 `## Approved References` 区域仅有 `<!-- 审批回写 -->` 注释，无任何图片
- 用此模板创建的文件**立即被 validate 拒绝**

**修复**: 将 `status` 改为 `"draft"`，与 `element_template.md` 保持一致。

---

### S3: `pending` 状态未入 StatusEnum，SKILL.md 示例会触发校验失败

**位置**: `SKILL.md:107` / `FrontmatterSchema.ts:16` / `references/example-shotlist.md`

**矛盾**:
- `FrontmatterSchema.ts:16` 的 `StatusEnum` 定义：`['drafting', 'draft', 'pending_sync', 'approved']`
- `SKILL.md:107` Shot 文件示例使用 `status: pending`
- `example-shotlist.md` 中 shot 块也使用 `status: pending`
- `pending` 不在 `StatusEnum` 中，`opsv validate` 会报 `"未知的 status"` 错误
- SKILL.md 状态流转图（`SKILL.md:42`）也完全遗漏 `pending`：`drafting → draft → [渲染] → [approve] → pending_sync → [Agent对齐] → approved`

**修复选项**:
- (a) 将 `pending` 加入 `StatusEnum`（需改 `FrontmatterSchema.ts` + `validate.ts`）
- (b) 将 SKILL.md 和 example-shotlist.md 中的 `pending` 统一改为 `draft`（仅改文档）

---

## 🟡 Important Issues (P1 — 应该修复，影响规范正确性)

### S4: 模板文件 refs 复制粘贴残留

**位置**: `references/element_template.md:10-12` / `references/scene_template.md:10-12`

```yaml
refs:                               # 引用必须带 @ 前缀
  - "@elder_brother"                # 引用文档
  - "@classroom:morning"            # 引用文档中的特定变体图片
```

**问题**:
- 两个模板文件的 `refs` 内容完全相同，系复制粘贴
- `element_template.md` 的 `type: "character"`，引用另一个角色+场景变体，对模板而言过于具体
- `example-element.md` 已正确使用 `refs: []`
- 模板应保持最小化，具体依赖由用户按需添加

**修复**: 两个模板的 `refs` 均改为 `refs: []`，加注释 `# 按需添加依赖资产`。

---

### M1: SKILL.md `id` 示例自相矛盾

**位置**: `SKILL.md:99-100`

```yaml
id: shot_01                    # ID 来自文件名，不在 frontmatter 重复
```

**问题**: 注释说"不在 frontmatter 重复"，但示例本身就在 frontmatter 写了 `id: shot_01`。

**修复**: 删除 frontmatter 中的 `id: shot_01` 行，或改为注释 `# id 由文件名推导，frontmatter 无需声明`。

---

### M2: ops-workflow.md 章节编号重复

**位置**: `ops-workflow.md`

- 第 6 节：`## 6. 故障处理 (Emergency)`
- 第 6 节：`## 6. 运维命令速查`

**修复**: 改第二节为 `## 7. 运维命令速查`。

---

### M3: ShotProductionFrontmatterSchema 缺少 shot 关键字段

**位置**: `src/types/FrontmatterSchema.ts:55-62`

SKILL.md 和 `creative-workflow.md` 定义的 shot 文件 frontmatter：

```yaml
id: shot_01
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "5s"
```

但 `ShotProductionFrontmatterSchema` 仅定义了 `title` 和 `frame_ref`，缺少 `id`、`first_frame`、`last_frame`、`duration`。Schema 与规范不同步，`opsv validate` 不会校验这些字段。

**修复**: 在 `ShotProductionFrontmatterSchema` 中补充缺失字段定义。

---

### M4: SKILL.md 声明 `id` 绑定文件名但源码未强制校验

**位置**: `SKILL.md:93,115` / `src/commands/validate.ts`

SKILL.md 铁律："`id` 绑定文件名，改名 = 删除重建"。但源码中无任何逻辑校验 `id` 与文件名的一致性，`FrontmatterSchema.ts` 的 shot schema 也不包含 `id` 字段。当前铁律仅靠 Agent 自律，无强制校验。

**修复**: 在 `validate.ts` 中增加 shot 文件 `id ↔ filename` 一致性校验，或在 SKILL.md 中注明"当前为 Agent 协议约束，非强制校验"。

---

## ⚪ Minor Issues (P2 — 可选修复)

### L1: `--skip-depend-layer` 选项未文档化

**位置**: `src/commands/imagen.ts`

源码中 `imagen` 命令有 `--skip-depend-layer` 选项（跳过依赖层级，产生扁平任务列表），但 SKILL.md、`cli_reference.md`、`ops-workflow.md` 均未提及。

**修复**: 在 `references/cli_reference.md` 的 `opsv imagen` 部分补充 `--skip-depend-layer` 说明。

---

### L2: creative-workflow.md 包含过时的 v0.6.4 迁移说明

**位置**: `creative-workflow.md:243-246`

```
**v0.6.4 CLI 语法变更**：
- 旧语法 `--volcengine.seedance-2.0` 已废弃
- 新语法：`--model volcengine.seedance-2.0` 或别名 `--model volc.sd2`
```

当前版本已到 v0.7.0，v0.6.4 的迁移说明应标注为历史注释或移除。

**修复**: 将标题改为 `**历史变更 (v0.6.4)**` 并折叠，或直接删除。

---

### L3: FrontmatterSchema.ts 版本注释过时

**位置**: `src/types/FrontmatterSchema.ts:5`

```
// OpenSpec-Video v0.5 Frontmatter Schema
```

项目已 v0.7.0，Schema 文件头部仍标注 v0.5。

**修复**: 更新为 `v0.7.0`。

---

### L4: SKILL.md frontmatter `description` 过长

**位置**: `templates/.agent/skills/opsv/SKILL.md:2`

```yaml
description: OpenSpec-Video (OpsV) v0.7.0 核心框架规范。涵盖从创意脑暴到视频渲染的完整管线，包括 Circle 架构、资产定义、Shot 文件系统、多图管理、任务编排与审查协议。
```

作为 skill-creator 自动匹配的元数据，建议精简为 1-2 句关键定位词，便于索引和自动发现。

**修复**: 缩短为 `OpsV v0.7.0 核心框架 — Circle 架构、资产管线、任务编排与审查协议`。

---

### L5: skill-creator/SKILL.md 引用不存在的文件

**位置**: `.agent/skills/skill-creator/SKILL.md:82-85`

```markdown
- [OpsV Agent Architecture](../ARCHITECTURE.md)
- [Skill Template](SKILL.template.md)
- [Best Practices Guide](../BEST_PRACTICES.md)
```

三个链接在仓库中均不存在。

**修复**: 删除无效链接，或创建对应文件。

---

## 修复优先级清单

| # | 优先级 | 问题 | 修复动作 | 影响范围 |
|---|--------|------|----------|----------|
| 1 | **P0** | S1: project_template 含废弃 `engine` | 删除 `engine: "siliconflow"` | references/project_template.md |
| 2 | **P0** | S2: scene_template `status: approved` 无图 | 改为 `status: "draft"` | references/scene_template.md |
| 3 | **P0** | S3: `pending` 状态未入 StatusEnum | 加入枚举或统一改文档为 `draft` | SKILL.md, example-shotlist.md, FrontmatterSchema.ts |
| 4 | **P1** | S4: 模板 refs 复制粘贴残留 | 改为 `refs: []` | element_template.md, scene_template.md |
| 5 | **P1** | M1: id 示例自相矛盾 | 删除 frontmatter 中 `id` 行 | SKILL.md |
| 6 | **P1** | M2: ops-workflow 编号重复 | 改为 `## 7.` | ops-workflow.md |
| 7 | **P1** | M3: ShotProduction Schema 缺字段 | 补充 id/first_frame/last_frame/duration | FrontmatterSchema.ts |
| 8 | **P1** | M4: id↔filename 无程序化校验 | 增加校验或注明为协议约束 | validate.ts, SKILL.md |
| 9 | **P2** | L1: `--skip-depend-layer` 未文档化 | cli_reference 补充 | cli_reference.md |
| 10 | **P2** | L2: v0.6.4 迁移说明过时 | 标注历史或删除 | creative-workflow.md |
| 11 | **P2** | L3: Schema 版本注释过时 | 更新为 v0.7.0 | FrontmatterSchema.ts |
| 12 | **P2** | L4: SKILL.md description 过长 | 精简关键定位词 | SKILL.md |
| 13 | **P2** | L5: skill-creator 引用不存在文件 | 删除或创建 | skill-creator/SKILL.md |

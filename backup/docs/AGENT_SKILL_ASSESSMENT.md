# OpsV Agent 技能体系评估与改进方案

> 基于对 OpsV 源码、模板、Agent 技能及核心架构的深入审查，2026-05-28

---

## 一、现状诊断

### 1.1 现有技能清单

| 技能 | 定位 | 质量 |
|------|------|------|
| `opsv` (SKILL.md) | v0.10.0 核心框架——Circle 架构、@语法、refs、prompt 编译 | ⭐⭐⭐ 最新但信息密度过高 |
| `opsv/creative-workflow.md` | 创意管线——脑暴→架构→资产→剧本→动画 | ⭐⭐ 仍标注 v0.8，部分内容过时 |
| `opsv/ops-workflow.md` | 运维管线——校验→生成→编译→渲染→审查 | ⭐⭐ 仍标注 v0.8.27，含大量 CLI 参考 |
| `opsv-circle` | Circle 生命周期管理 | ⭐⭐ 仅覆盖 create/refresh，缺故障排查 |
| `opsv-produce` | 编译生成任务 | ⭐⭐⭐ 较全面，覆盖所有 produce 命令 |
| `opsv-review` | 审查与审批 | ⭐⭐ 缺 cloud 审查流、缺 reviewApproveController |
| `animation-director` | 动画分镜构思 | ⭐ 外部技能，非 OpsV 原生 |
| `comfyui` | ComfyUI 节点与工作流 | ⭐ 外部技能，非 OpsV 原生 |
| `seedance` / `seedream` | 火山引擎模型专用 | ⭐ 外部技能 |

### 1.2 核心问题

#### 问题 1：版本漂移

同一套模板中存在三个版本引用：`v0.8`（creative-workflow）、`v0.8.27`（ops-workflow）、`v0.10.0`（SKILL.md）。Agent 阅读时无法判断哪个版本是权威来源。

**影响**：`opsv queue compile` 等 v0.8 已废弃命令仍在 creative-workflow.md 中被引用为"替代方案"，Agent 可能尝试调用不存在的命令。

#### 问题 2：信息重复与碎片化

`templates/AGENTS.md` 与 `templates/.agent/AGENTS.md` 内容几乎完全相同。SKILL.md、creative-workflow.md、ops-workflow.md 三份文件大量交叉引用和内容重复（如状态机、Circle 架构在两份文件中分别完整描述）。

**影响**：Agent 阅读 3+ 份文件才能建立完整心智模型，增加 token 消耗和误解概率。

#### 问题 3：Agent 三元组交接协议缺失

Creative-Agent → Guardian-Agent → Runner-Agent 的交接在 AGENTS.md 中用一段话描述，但没有结构化协议：

- Creative 完成后**具体输出什么信号**宣告完成？
- Guardian 校验通过后**如何通知 Runner** 可以开始执行？
- 回滚（Draft → Creative）的触发条件和数据格式是什么？

**影响**：Agent 在三元组模式下容易"各说各话"，缺乏明确的职责边界和交接物。

#### 问题 4：syncing 状态处理过于隐晦

`syncing → approved` 的 Agent 对齐流程是 OpsV 最关键的闭环步骤，但其描述散落在 ops-workflow.md 的三个不同段落中。没有独立的 checklist 或决策树。

**影响**：Agent 可能遗漏对齐步骤（如"忘记同步 refs"、"忘记更新 visual_detailed"），导致下游 Circle 被错误阻断。

#### 问题 5：refs 语义教学不足

v0.10.0 的 `refs` 语义铁律（"视觉输入依赖 ≠ 剧情关系"）是 Circle DAG 能否成立的根本前提，但只有 SKILL.md 中一个段落描述。没有反例教学、没有自检清单、没有常见错误库。

**影响**：这是 Agent 最常出错的领域——把剧情关系塞进 refs 会导致循环依赖，整个 Circle 拓扑崩塌。

#### 问题 6：Cloud 审查流完全缺失

`opsv review --cloud`、`opsv login`、session 管理、review token 轮换——当前分支的核心新功能在模板中完全没有 Agent 技能覆盖。

#### 问题 7：迭代反馈闭环不完整

Draft → 修改 → 重新生成 → 再次审查的闭环中，Agent 如何在 `opsv iterate`、`opsv imagen --no-skip-approved`、手动编辑 task JSON 之间做选择？没有决策指南。

---

## 二、改进方案

### 2.1 技能重组：从"按管线阶段"到"按 Agent 角色"

当前技能按管线阶段组织（creative-workflow / ops-workflow），导致 Guardian 和 Runner 共享一份 ops-workflow。应改为按 Agent 角色拆分，每个角色一份完整的操作手册。

**新结构**：

```
templates/.agent/
  AGENTS.md                          # 精简为入口索引 + 三元组协议
  skills/
    opsv/
      SKILL.md                       # 核心概念（Circle、@语法、refs、状态机）— 唯一权威版本
      references/
        cli_reference.md             # CLI 命令速查表
        frontmatter_schema.md        # Frontmatter 字段完整规范（新增）
        refs_guide.md                # refs 语义详解 + 常见错误 + 自检清单（新增）
        naming_conventions.md         # 命名规范集中管理（新增）
    creative/                         # Creative-Agent 专用（从 creative-workflow 拆分）
      SKILL.md                        # 创意管线全流程
    guardian/                         # Guardian-Agent 专用（新增）
      SKILL.md                        # 校验协议 + syncing 对齐流程
    runner/                           # Runner-Agent 专用（从 ops-workflow 拆分）
      SKILL.md                        # Circle 管理 + 编译 + 执行 + 审查
    cloud/                            # Cloud 工作流（新增）
      SKILL.md                        # login → session → tunnel → review
```

### 2.2 关键新增技能

#### `guardian` — 质量守卫者（新建）

Guardian-Agent 需要一个独立、聚焦的技能。它不应承担 Runner 的编译/执行职责。

**核心内容**：

1. **文档校验协议**：`opsv validate` 的完整操作手册，含每类错误的解释和修复指引
2. **syncing 对齐 checklist**（从 ops-workflow.md 提取并增强）：
   ```
   □ 读取 review 记录中的 modified_task 路径
   □ 加载修改后的 task JSON
   □ 对比 source.md 的 prompt ↔ task JSON 的 content[].text
   □ 翻译 prompt → visual_detailed（英文→中文）
   □ 提炼 visual_detailed → visual_brief（≤120字）
   □ 对齐 refs 与 Design References 中的参考图
   □ status: syncing → approved
   □ opsv validate 确认
   ```
3. **refs 正确性审查**：检查 refs 是否构成有效 DAG，是否违反输入依赖铁律
4. **状态一致性检查**：Approved References ↔ status ↔ refs 三方校验
5. **Circle 阻断决策**：何时阻止下游 Circle 启动

#### `cloud` — 云端工作流（新建）

**核心内容**：

1. `opsv login` 完整流程（OAuth Device Flow）
2. `opsv review --cloud` 启动与监控
3. 会话管理：`--status` / `--rotate-review-token` / `--close`
4. 隧道模式 vs Relay 模式的选择与切换
5. 云端审查的审批操作（与本地审查的差异）
6. 故障排查：401/429/隧道断开/reviewer URL 过期

#### `refs_guide.md` — refs 语义参考（新建，附属于 opsv SKILL.md）

**核心内容**：

1. **判断标准（自问三连）**：画此资产时此参考图是否必须先存在 / 无此图模型是否画不出 / 这是视觉输入还是剧情说明
2. **正确层级示例**（完整 DAG）：
   ```
   第 0 层：风格参考（refs 为空）
   第 1 层：角色定档（refs 仅含第 0 层）
   第 2 层：场景定档（refs 仅含第 0 层）
   第 3 层：分镜画面（refs 含第 1+2 层）
   第 4 层：分镜视频（refs 含第 3 层帧）
   ```
3. **常见错误库**（5+ 个真实错误案例 + 修复方案）
4. **自检清单**：Agent 写完 refs 后必须逐项核对
5. **循环依赖检测指南**：如何发现和修复 refs 循环

### 2.3 三元组交接协议（写入 AGENTS.md）

需要从模糊的"移交"改为结构化协议：

```
Creative-Agent 完成信号：
  → 所有目标文档 status 从 drafting 改为 draft
  → 输出交接摘要：{ created: [...], modified: [...], refs_graph: "DAG valid" }

Guardian-Agent 准入检查：
  → opsv validate 全绿
  → refs 语义审查通过
  → 输出：{ approved: [...], blocked: [...], blockers: "..." }

Runner-Agent 执行条件：
  → Guardian 输出中 blocked 为空
  → opsv circle refresh 显示当前 Circle 状态

Draft 回滚协议：
  → review 标记为 Draft → status: drafting
  → Guardian 输出回滚清单 { asset, reason, suggested_fix }
  → Creative 接收回滚清单进行修订
```

### 2.4 版本统一

- 删除所有文档中的版本后缀标记（`v0.8.27`、`v0.10.0`），改为在 AGENTS.md 顶部统一声明：`当前 OpsV CLI 版本：从 package.json 读取`
- creative-workflow.md 和 ops-workflow.md 中所有已废弃命令引用改为当前有效命令

### 2.5 迭代决策指南（写入 runner SKILL.md）

Draft 后 Agent 面临的选择：

```
情况 A：仅需微调 prompt/seed
  → opsv iterate task.json → 编辑 → opsv run → opsv review

情况 B：需要修改源文档的 visual_detailed
  → 修改 .md → opsv imagen --no-skip-approved → opsv run → opsv review

情况 C：需要修改 refs（改变依赖）
  → 修改 .md refs → opsv circle refresh → opsv imagen → opsv run → opsv review

情况 D：需要批量重试失败任务
  → opsv run dir/ --retry
```

---

## 三、Agent 如何创作合规文档

### 3.1 文档创作的核心约束

Agent 创作 OpsV 文档时必须遵循以下硬性约束，逐条检查：

#### 约束 1：`---` 必须是文件第一行

```markdown
---
category: character
status: drafting
---
正文从此开始...
```

❌ 错误：前置任何标题、注释、空行都会导致 FrontmatterParser 解析失败。

#### 约束 2：`@id` 命名规范

- 全部小写、下划线分隔
- 文件名 = `@id.md`（如 `@hero.md`）
- `@id` 全局唯一，不得重复

#### 约束 3：`category` 必须合法

合法值：`character`、`prop`、`costume`、`scene`、`shot-design`、`shot-production`、`project`、`story-outline`

#### 约束 4：`refs` 只表达视觉输入依赖

见 §2.2 refs_guide.md。这是最常见的 Agent 错误点。

#### 约束 5：`prompt` 描述画面不描述剧情

prompt 中每个 `@id` 都必须是生成结果中能被人看到的对象。不在画面中的元素不应出现在 prompt 的 `@` 引用中。

#### 约束 6：双通道参考图区域

- `## Design References`：输入侧，本文档的参考素材（Agent 可手动编辑）
- `## Approved References`：输出侧，审查通过后由 review 自动写入（Agent **勿手动编辑**）

### 3.2 Agent 创作流程（推荐路径）

```
1. 脑暴阶段
   用户描述需求 → Agent 追问三个细节 → 三向提案 → 用户确认方向

2. 架构落盘
   创建 project.md（资产花名册）→ 创建 story.md（故事大纲）
   → opsv validate

3. 资产设计（逐个资产迭代）
   FOR EACH asset IN manifest:
     a. 撰写 elements/@id.md（含 visual_detailed + prompt + refs）
     b. refs 自检：三连问 → 层级检查 → DAG 检查
     c. opsv validate
     d. opsv circle create → opsv imagen --model <m> → opsv run
     e. opsv review → Approve/Draft
     f. IF Draft: 修改 → 重新生成
     g. IF Approved: Guardian 对齐 syncing → approved
     h. opsv circle refresh

4. 分镜设计
   资产全部 approved 后 → 逐个创建 shots/shot_NN.md
   → 重复步骤 3d-3h

5. 视频生成
   分镜全部 approved 后 → 创建 shotdeck.md
   → opsv animate --model <m> → opsv run → opsv review
```

### 3.3 Agent 最容易犯的 5 个错误及预防

| # | 错误 | 预防机制 |
|---|------|---------|
| 1 | 把剧情关系写进 refs（"分镜 A 引用了角色 B 因为剧情里 B 先出场"） | refs 自检三连问：B 的参考图是画 A 的**视觉输入**吗？ |
| 2 | prompt 中引用不在画面中的资产 | 逐 @id 检查：这个元素在生成结果中能被人**看到**吗？ |
| 3 | 忘记 `---` 必须在第一行 | 模板/脚手架应确保第一行就是 `---` |
| 4 | 将 `opsv review` Approve 后的 syncing 状态理解为"已完成" | syncing = 阻断下游，必须 Agent 对齐后才变 approved |
| 5 | 手动 cp 代替 `opsv iterate` | 铁律：修改任务必须用 `opsv iterate`，自动清除 compiledAt |

---

## 四、优先级建议

| 优先级 | 改动 | 工作量 | 影响 |
|--------|------|--------|------|
| 🔴 P0 | 新建 `guardian` 技能（含 syncing checklist） | 中 | 直接解决 Agent 最常见错误 |
| 🔴 P0 | 新建 `refs_guide.md`（反例教学 + 自检清单） | 小 | 解决 Circle 拓扑崩塌的根本原因 |
| 🔴 P0 | 版本统一（删除所有 v0.8 标记，统一引用当前版本） | 小 | 消除 Agent 指令混淆 |
| 🟡 P1 | 技能按角色重组（creative/guardian/runner 独立） | 大 | 降低 token 消耗，提升 Agent 效率 |
| 🟡 P1 | 新建 `cloud` 技能 | 中 | 解锁 cloud review 功能的 Agent 使用 |
| 🟡 P1 | 三元组交接协议结构化 | 小 | 解决多 Agent 协作混乱 |
| 🟢 P2 | 迭代决策指南（写入 runner SKILL.md） | 小 | 提升 Draft→迭代闭环效率 |
| 🟢 P2 | 合并重复的 AGENTS.md / 删除 creative-workflow 冗余 | 小 | 降低维护负担 |

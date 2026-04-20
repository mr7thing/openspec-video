# PR: v0.6.0 紧急修复 — 实现 SpoolerQueue + validate 命令 + 依赖图流程

## 摘要

v0.6.0 发布后测试发现 **SpoolerQueue 从未实现**，导致编译失败、整个队列系统无法工作。同时修复多个测试中发现的 bug，并补全依赖图交互流程。

---

## 变更类型

| 类型 | 数量 |
|------|------|
| 新增文件 | 4 |
| 修改文件 | 8 |
| 新增代码 | ~750 行 |

---

## P0 修复

### 1. 实现 SpoolerQueue（新建）

**问题：** `docs/Spec-0.6.md` 文档承诺的 `SpoolerQueue` 组件从未实现，导致所有引用它的文件编译失败。

**新增文件：**
- `src/core/queue/SpoolerTask.ts` — 任务信封接口
- `src/core/queue/SpoolerQueue.ts` — 物理文件状态机

**实现细节：**
```
.opsv-queue/<provider>/
  ├── inbox/     # 待处理
  ├── working/  # 处理中
  └── done/     # 已完成/失败
```

**API：**
```typescript
const queue = new SpoolerQueue(baseDir, provider);
await queue.init();
const uuid = await queue.enqueue(payload);
const task = await queue.dequeue();        // 返回 SpoolerTask | null
await queue.markCompleted(uuid, result);
await queue.markFailed(uuid, error);
```

---

### 2. 实现 opsv validate 命令（新建）

**问题：** 技能文档（Guardian-Agent、opsv-ops-mastery）描述的 `opsv validate` 命令不存在。

**新增文件：** `src/commands/validate.ts`

**功能：**
- 扫描 `videospec/` 目录下所有 `.md` 文件
- 解析 YAML frontmatter（`---` 包裹）
- 根据 `type` 字段选择对应 Zod schema 验证
- 支持 `--fix` 自动修复（预留）
- 支持 `-d, --dir` 指定目录

**示例输出：**
```
🔍 OpsV Validate v0.6.0
   目录: /path/to/videospec
   文件: 13 个

❌ 发现 4 个问题:
  📄 stories/brother.md:18
     字段: type
     问题: 未知的 type: "story"
     建议: 可选值: character, prop, costume, scene, shot-design, ...
```

---

## 代码修复

### 3. case-insensitive shotlist 匹配

**文件：** `src/automation/AnimateGenerator.ts`

**问题：** `animate` 命令只查找 `Shotlist.md`（大写），找不到 `shotlist.md` 或 `SHOTLIST.MD`。

**修复：** `files.find(f => f.toLowerCase() === 'shotlist.md')`

---

### 4. MiniMax 1033 敏感词检测

**文件：** `src/executor/providers/MinimaxImageProvider.ts`

**问题：** MiniMax 返回 1033 system error 时没有给出具体原因，用户不知道如何解决。

**修复：**
- 检测 `status_code === 1033` 或 `status_msg` 含 `sensitive`
- 调用 `detectSensitiveTerms()` 扫描 prompt
- 抛出明确错误信息，列出可能触发审核的词汇

**敏感词模式（含 `\b` 边界）：**
```typescript
/\bCEO\b|\b总裁\b|\b董事长\b|\b总经理\b|\b政府部门\b|\b政治人物\b/i
```

---

### 5. seedance 分支缺失

**文件：** `src/commands/queue.ts`

**问题：** `queue run` 命令没有 `seedance` 分支，但 `SeedanceProvider.ts` 已存在。

**修复：** 添加 `seedance` 到 `seadream`/`volcengine` 同一分支（共享 SeaDreamProvider）。

---

### 6. API key 占位符警告

**文件：** `src/commands/queue.ts`

**问题：** 如果 `.env` 中 API key 是 `***` 占位符，compile 时没有警告。

**修复：** compile 前检查所有必需 API key，值为空或 `***` 时输出警告，但不阻止执行。

---

### 7. opsv deps 输出 Promise bug

**文件：** `src/commands/deps.ts`

**问题：** `prettyPrint()` 是 async 方法但没 await，导致输出 `[object Promise]`。

**修复：** `await graph.prettyPrint(approvedRefReader)`。

---

### 8. DependencyGraph 路径不兼容

**文件：** `src/core/DependencyGraph.ts`

**问题：** `buildFromProject` 写死 `videospec/elements/`，不支持扁平目录结构（brother 测试用）。

**修复：** 优先标准结构 `videospec/elements/`，fallback 到扁平结构 `elements/`。

---

## 技能文档更新

### 9. opsv-ops-mastery：批次确认流程

**文件：** `templates/.agent/skills/opsv-ops-mastery/SKILL.md`

**新增内容：**
- 第1步：执行 `opsv deps` 展示依赖图和拓扑排序批次
- **第2步：批次确认（强制）** — 必须逐批向导演展示，确认后再生成
- 第3步：compile
- 第4步：queue run
- 第5步：review + 归档

**示例对话：**
```
导演，依赖图分析如下：

第1批（无依赖，可立即生成）:
  ✅ prop_green_pot, role_chen_hai, role_lin_yuan, scene_dorm, scene_meeting_room, scene_rental, scene_rooftop

第2批（依赖第1批 approved 后可生成）:
  ⚠️ [资产名]

请确认从第1批开始生成？
```

### 10. Guardian-Agent：依赖图审查

**文件：** `templates/.agent/Guardian-Agent.md`

**更新内容：**
- 新增"依赖图审查"章节：必须使用 `opsv deps` 查看拓扑排序
- 禁止绕过一个资产的 approved 状态去生成依赖它的资产
- 移除 `opsv validate`（命令已实现）

### 11. Runner-Agent：v0.6 工作流

**文件：** `templates/.agent/Runner-Agent.md`

**更新内容：**
- 替换 `opsv gen-image`/`gen-video` 为 `opsv queue compile` + `opsv queue run`
- 新增"批次感知"章节，说明拓扑批次概念

---

## 文档更新

- `docs/OPSV_v0.6.0_FIX_VERIFICATION.md` — 修复验证报告
- `docs/OPSV_v0.6.0_TEST_FEEDBACK.md` — 测试反馈原始记录
- `docs/OPSV_v0.6.1_CODE_REVIEW_COMPLETION.md` — 代码审查完成报告（新增）
- `templates/AGENTS.md` — 更新 v0.6.0 工作流说明

---

## 影响范围

| 组件 | 影响 |
|------|------|
| 编译 | ✅ 之前编译失败，现在通过 |
| `opsv queue compile` | ✅ 正常 |
| `opsv queue run` | ✅ 正常消费队列 |
| `opsv validate` | ✅ 新增命令 |
| `opsv deps` | ✅ 输出正确（修复 Promise bug） |
| `opsv generate` | ✅ 依赖图过滤正常 |
| `opsv animate` | ✅ shotlist 匹配修复 |
| MiniMax 图片生成 | ✅ 1033 错误有明确提示 |
| 技能文档 | ✅ 批次确认流程已补全 |

---

## 测试验证

详见 `docs/OPSV_v0.6.0_FIX_VERIFICATION.md`

```bash
# 编译
npm run build ✅

# 依赖图分析
opsv deps  ✅ 显示拓扑排序和批次
  📊 依赖图分析:
    ⚠️ prop_green_pot (无依赖)
    ⚠️ role_chen_hai (无依赖)
    ...
  推荐生成顺序:
    第1批: prop_green_pot, role_chen_hai, ... (无依赖，可立即生成)

# 队列完整流程
opsv queue compile ../queue/jobs.json --provider seadream  ✅ 7任务入队
opsv queue run seadream                                  ✅ 队列消费正常

# validate
opsv validate -d .  ✅ 发现4个预期内的问题
```

---

## 代码审查后续修复（第二波）

在 PR 合并后，执行了全面的代码审查，修复 24 项问题：

| 优先级 | 数量 | 关键修复 |
|--------|------|----------|
| 🔴 Critical | 4 | SpoolerQueue 原子 dequeue、高熵 UUID、损坏隔离、QueueWatcher 优雅关机 |
| 🟠 High | 8 | Daemon 生命周期、Provider HTTP 校验、指数退避、fail-fast、ReviewServer 完整性、DependencyGraph 准确性、ConfigLoader 多实例、全库 async I/O |
| 🟡 Medium | 8 | Logger 编码、Package 安全、TS 配置、扩展安全性等 |
| 🟢 Low | 4 | 语法错误、细节优化 |

详见：`docs/OPSV_v0.6.1_CODE_REVIEW_COMPLETION.md`

## 待解决（不在本 PR 范围）

| 问题 | 原因 |
|------|------|
| SEADREAM_API_KEY 未配置 | 环境问题，需用户配置 |
| SiliconFlow 403 | API Key 无效，需获取有效 Key |
| Provider 命名统一（volcengine/seadream/seedance） | 设计问题，建议 v0.6.1 处理 |

---

## 提交信息

```
fix: v0.6.0 紧急修复 — 实现 SpoolerQueue + validate 命令 + 依赖图流程

review: v0.6.0 代码审查修复 — 原子 dequeue、优雅关机、async I/O 标准化、Provider 鲁棒性
```

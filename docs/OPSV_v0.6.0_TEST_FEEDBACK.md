# OPSV v0.6.0 测试反馈报告

**日期：** 2026-04-19
**版本：** v0.6.0
**项目：** brother（兄弟短剧）

---

## 一、设计问题

**本质：** 系统架构层面的设计缺陷，需要从根本重新考虑。

### 1.1 Provider 命名体系混乱

三个名字混用，没有统一规范：

| CLI 参数 | Provider 类名 | 环境变量 | 端点 |
|---------|--------------|---------|------|
| `seadream` | `SeaDreamProvider` | `SEADREAM_API_KEY` | ark.cn-beijing.volces.com |
| `volcengine` | ❌ 不存在 | `VOLCENGINE_API_KEY`（读不到） | — |
| `seedance` | ❌ 不存在 | — | — |

**具体问题：**
- compile 命令支持 `--provider volcengine`（有 StandardAPICompiler）
- run 命令的 if/else 链只有：comfyui_local / runninghub / seadream / siliconflow / minimax
- `volcengine` 作为 CLI 参数可以传，但 run 时报 "Unhandled provider wrapper yet"
- 代码读 `SEADREAM_API_KEY`，但 .env 配置的是 `VOLCENGINE_API_KEY`

**正确用法：** 用 `seadream`，不是 `volcengine`。

**建议：** 统一命名规范，明确每个 CLI 参数对应的 Provider 类、环境变量、端点和模型能力。

### 1.2 各 Provider 模型能力不透明

没有清晰的文档说明每个 Provider 支持：
- 哪些图像尺寸（如 1920x1080 / 848x480）
- 哪些模型（图片模型、视频模型）
- 配额限制
- 审核策略（敏感词）

**现状：**
- SiliconFlow 的 Qwen/Qwen-Image 可能不支持 1920x1080，导致全失败
- MiniMax 的 System Error 1033 触发词（"CEO"、"商业逻辑同化"等）不透明

**建议：** 每个 Provider 应有清晰的能力清单，包括尺寸支持、审核词库、限流策略。

### 1.3 Key 配置与管理不规范

- `.env` 中 key 显示为 masked 占位符 `***`
- 没有机制在任务执行前验证 key 有效性
- 错误信息不明确：403 可能是 key 无效 / 余额不足 / 分辨率不支持

**建议：** 建立 key 配置规范，包括：
- key 有效性自检（执行前 ping 通性检查）
- 账户余额/配额查询
- 错误信息的精确归因

---

## 二、流程和文档说明的问题

**本质：** 工作流和 Agent 规则没有和代码实现同步，导致执行和预期不符。

### 2.1 命令与文档严重脱节

技能文档（Guardian-Agent.md、opsv-ops-mastery/SKILL.md）描述的命令在代码中不存在：

| 文档描述 | 实际命令 | 备注 |
|---------|---------|------|
| `opsv validate` | 不存在 | validation 在 generate 时隐式执行 |
| `opsv gen-image` | 不存在 | — |
| `opsv gen-video` | 不存在 | — |
| `opsv validate`（Guardian-Agent 依赖） | 不存在 | 导致 Guardian-Agent 流程断链 |

### 2.2 实际工作流（v0.6.0）无文档说明

```
opsv generate        ← 生成 jobs.json
    ↓
opsv queue compile   ← 编译到指定 provider
    ↓
opsv queue run       ← 串行执行
```

这个流程没有任何文档说明，用户和子代理只能靠试错发现。

### 2.3 Guardian-Agent 设计无法生效

Guardian-Agent 依赖 `opsv validate` 和 `opsv-pregen-review` 技能，但：
- `opsv validate` 从未实现
- `opsv-pregen-review` 技能不存在
- "流程宪兵"角色形同虚设

### 2.4 Agent 规则文档（CLAUDE_INSTRUCTIONS.md）与代码脱节

`.cursorrules` 中定义的 Guardian-Agent / Creative-Agent 角色依赖的工作流命令，在 v0.6.0 中已不存在。

### 2.5 子代理执行模式无约束说明

Claude Code 子代理运行时完全自主，不在关键节点暂停汇报。没有文档说明：
- 应该在哪些节点停下来请求确认
- 如何与 Guardian-Agent 协作
- 检查点审批的触发条件

**结果：** 子代理按文档操作会失败，或自主跑完不符合预期。

---

## 三、异常处理问题

**本质：** 异常情况没有预防机制，也没有自动恢复能力，导致任务直接 fail。

### 3.1 key 配置后无连通性检查

key 配置后，在 `queue compile` 或 `queue run` 之前，没有任何检查：
- key 是否有效（masked 值 `***` 没有被检测）
- 账户余额是否充足
- API 端点是否可达

**现象：** SiliconFlow 的 key 配置为 `***` 仍可 compile，直到 run 时才 403 失败。

**建议：** compile 前应做 key 连通性检查，发现无效 key 时立即报错，不进入 pending 队列。

### 3.2 敏感词触发任务失败，无自动修复机制

MiniMax 的 System Error 1033（疑似 "CEO"、"商业逻辑同化" 等词触发）：
- 任务直接 fail
- 没有提示是哪个词触发
- 没有自动改写 prompt 重试的能力

**建议：** 触发敏感词审核后，应：
1. 精确告知哪个词可能有问题
2. 自动生成脱敏版本的 prompt 供用户确认
3. 支持重试

### 3.3 pending 任务卡住无告警

如果 compile 时用了不存在的 provider 名（如 volcengine），任务会静默卡在 `pending/<provider>/`：
- 没有告警
- 没有诊断提示
- 用户不知道任务为什么没有执行

**建议：** 检测 pending 任务数量变化，若超过阈值无进展，触发告警。

### 3.4 MiniMax Invalid Response Format 处理不完善

API 返回非预期结构时直接抛异常：
```javascript
if (!data || !data.data || !data.data.image_base64) {
    throw new Error(`Minimax Invalid response format`);
}
```

**可能场景：**
- API 返回错误响应（HTTP 200 但无 image_base64）
- 内容审核触发后返回错误结构

**建议：** 区分"API 返回格式异常"和"业务错误"，给出精确错误信息。

---

## 问题分类汇总

| 类别 | 问题 | 严重度 |
|------|------|--------|
| 设计 | Provider 命名混乱（volcengine/seadream/seedance） | 🔴 高 |
| 设计 | 各 Provider 模型能力不透明 | 🔴 高 |
| 设计 | key 配置与管理不规范 | 🟡 中 |
| 文档 | `validate`/`gen-image`/`gen-video` 命令不存在 | 🔴 高 |
| 文档 | 实际工作流（v0.6.0）无文档说明 | 🔴 高 |
| 文档 | Guardian-Agent 依赖的命令/技能缺失 | 🔴 高 |
| 文档 | Agent 规则与代码脱节 | 🔴 高 |
| 文档 | 子代理执行模式无约束说明 | 🟡 中 |
| 异常 | key 配置后无连通性检查 | 🔴 高 |
| 异常 | 敏感词触发失败无自动修复 | 🟡 中 |
| 异常 | pending 卡住无告警 | 🟡 中 |
| 异常 | Invalid response format 处理不完善 | 🟡 中 |

---

## 优先级建议

**P0（阻断）：**
1. 统一 Provider 命名规范，补全 queue run 的 volcengine 分支
2. 补全 v0.6.0 实际工作流文档
3. key 配置后增加连通性检查

**P1（重要）：**
4. 各 Provider 模型能力清单（尺寸、审核词库、限流）
5. 实现 `opsv validate`，或更新 Guardian-Agent 设计
6. 敏感词触发的自动提示和重试机制

**P2（改进）：**
7. pending 卡住告警
8. Invalid response format 精确归因

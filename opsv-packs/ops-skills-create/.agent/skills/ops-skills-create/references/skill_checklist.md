---
name: skill-checklist
description: OPSV 技能包验收检查清单 — 创建技能包后逐项核对
---

# 技能包验收检查清单

> 创建技能包后，按以下清单逐项检查

---

## A. 文件结构

- [ ] `SKILL.md` 存在于正确路径
- [ ] `references/` 目录非空（至少有一个有内容的文件）
- [ ] 如有多 Agent 协作，`.agent/AGENTS.md` 存在
- [ ] 目录结构与 SKILL_SPEC.md 一致

## B. Frontmatter

- [ ] `name` 字段为 kebab-case，与目录名一致
- [ ] `description` 包含功能说明
- [ ] `description` 包含触发条件（中英文）
- [ ] `description` 包含与相似技能的区分
- [ ] `disable-model-invocation` 设置为 false（除非特殊需求）
- [ ] `user-invocable` 设置为 true（除非特殊需求）

## C. SKILL.md 正文

### 必需章节
- [ ] 概述（阶段、输入、产出、技能数）
- [ ] 职责边界（你做 / 你不做）
- [ ] 触发条件
- [ ] 工作流程（有明确的输入→处理→产出）
- [ ] 7 个关切覆盖
- [ ] 注意事项（踩过的坑）
- [ ] 验收命令（`opsv validate`）

### 7 个关切检查
- [ ] 生产流程：描述了输入→处理→产出的具体步骤
- [ ] 依赖处理：说明了上游验证规则和任务环 gate
- [ ] 提示词生成：描述了 prompt 编写规范和信息来源
- [ ] 引用语法：说明了 `@id` / `@:key` / `refs` 的使用
- [ ] 任务环编排：说明了在 Circle 中的位置和约束
- [ ] 迭代与 Review：描述了审阅标准和 iterate 路径
- [ ] 质量控制：描述了验收标准和 validate 规则

## D. References 内容

- [ ] 模板文件有完整的 YAML frontmatter 示例
- [ ] 示例文件展示最佳实践
- [ ] 指南文件可执行，不是纯理论描述
- [ ] 文件命名符合规范（template_*, sample_*, guide_*）

## E. 验证测试

- [ ] `opsv validate --category <skill_name>` 通过
- [ ] Circle 创建成功（如适用）
- [ ] 技能包可被正确加载和触发

---

## 快速检查命令

```bash
# 检查文件结构
ls -la .agent/skills/<skill-name>/

# 检查 references 非空
ls -la .agent/skills/<skill-name>/references/

# 运行验证
opsv validate --category <skill-name>
```

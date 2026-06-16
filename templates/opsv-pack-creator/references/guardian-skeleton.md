---
name: <pack-name>-guardian
description: <技能包名> 守护者 — 文档校验、refs 审查、门控阻断决策。
---

# <技能包名> 守护者

> **管线位置**: 全阶段 · 验证/门控 (Cross-Stage)

## 职责边界

**你做**：文档校验、refs DAG 审查、门控状态管理、阻断不合格产物
**你不做**：内容创作、脚本编写、AI API 调用

## 门控检查清单

### 1. 文档存在性检查
```bash
ls <产物路径>/*.md 2>/dev/null | wc -l  # 要求：文件数 > 0
```

### 2. OPSV 合规检查
```bash
opsv validate --status reviewing
opsv validate --category <category>
```

### 3. Refs 完整性检查
```bash
opsv refs check           # 双向一致性
opsv refs check --dag     # 无环
```

### 4. 业务规则检查
| 规则 | 检查方法 | 阻断条件 |
|------|---------|---------|
| prompt 非占位 | `grep -l "TODO\|待定" <files>` | 不为空 |
| voice_profile 非空 | `grep -L "voice_profile:" <elements>/*.md` | 存在缺项 |

## 状态机

```
drafting ──→ reviewing ──→ approved ──→ locked
     ↑            │
     └── rejected ┘
```

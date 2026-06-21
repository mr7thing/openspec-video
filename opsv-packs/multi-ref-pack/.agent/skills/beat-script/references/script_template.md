# Script.md 模板

> 适用阶段：S2 Beat 拆解（beat-script）
> 文件位置：`videospec/Script.md`

---

## 撰写原则

1. **先写正文**（Beat 拆解表），再根据正文填 Frontmatter，最后抽场景清单
2. **Beat 只记录叙事信息**——谁在什么场景做了什么。摄影参数是 S3 的事
3. **核心角色 ID 来自 project.md**（S1 graphify 产出）——不要自己发明角色，引用已有 ID

---

## 角色 ID 来源

核心角色 ID 从 `videospec/project.md` 的「核心角色」表格获取。每个角色有一个固定 ID（PascalCase），Beat 中用 `@ID` 引用：

```
角色: @LuRan                    ← 单角色
角色: @LuRan, @YunLi            ← 多角色
```

> project.md 只列核心角色。龙套（禁军、官员甲等）不在其中——S3 根据跨 Shot 复用判断是否需建资产。

## 场景 ID 格式

场景 ID 由 beat-script 根据 Beat 内容定名（详见 SKILL.md §场景定名），格式 `{地点英文}-{时段/变体}`：

| 场景 ID | 含义 |
|---------|------|
| @Temple-Day | 宗庙禁地·白日室外 |
| @Temple-InsideLight | 宗庙禁地·光幕内（闪回画面） |
| @Beach-Dawn | 东海之滨·晨光 |

---

## 正文结构

```markdown
## Beat 拆解表

### Sequence 1: <序列名>

#### Beat S01-Beat01
- **场景**: @Temple-Day
- **角色**: @LuRan
- **动作**: 婚碑矗立，禁军阵列肃立碑前
- **对话**: —
- **情绪**: neutral
- **时长**: 6s

#### Beat S01-Beat02
- **场景**: @Temple-Day
- **角色**: @LuRan
- **动作**: 踏前一步，袖袍鼓荡，凝视婚碑
- **对话**: —
- **情绪**: tense
- **时长**: 4s

#### Beat S01-Beat03
- **场景**: @Temple-Day
- **角色**: @LuRan
- **动作**: 目光凝重，缓缓开口
- **对话**: "此碑之下，镇的是海底万妖。碑碎，则妖出、水患滔天。"
- **情绪**: tense
- **时长**: 8s

#### Beat S01-Beat04
- **场景**: @Temple-Day
- **角色**: @YunLi
- **动作**: 冷笑，手中珠帘晃动
- **对话**: "你终于来了。我等这一日，等了百年。"
- **情绪**: cold
- **时长**: 6s
```

---

## 场景清单（从正文提取）

```markdown
## 场景清单

| 编号 | ID | 描述 |
|------|----|------|
| Scene-01 | @Temple-Day | 宗庙禁地，婚碑矗立，白日室外 |
| Scene-02 | @Temple-InsideLight | 宗庙禁地·光幕内（闪回画面） |
| Scene-03 | @Beach-Dawn | 东海之滨，礁石嶙峋，晨光 |
```

---

## Frontmatter（根据正文反推）

```yaml
---
category: multi_ref_breakdown
status: drafting
title: "<项目名> Beat 拆解"
id: Script-<项目>
sequence_count: 3        # ← 从正文数
scene_count: 3           # ← 从场景清单数
beat_count: 24           # ← 从正文数
style: anime
created: "<YYYY-MM-DD>"
---
```

## Beat 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| 场景 | ✅ | `@场景ID`，从场景清单引用。场景ID 由 beat-script 根据 Beat 内容命名 |
| 角色 | ✅ | `@角色ID`，核心角色 ID 来自 project.md。多人用 `@LuRan, @YunLi` |
| 动作 | ✅ | 画面中发生的动作，一句话描述 |
| 对话 | — | 有台词才填，无则 `—` |
| 情绪 | ✅ | neutral / tense / cold / angry / sad / joyful / mysterious / shocked |
| 时长 | ✅ | 自然时长（秒），如实标注。有台词按字数÷3 + 停顿估算，纯动作/环境按实际耗时估算。不强制拉长，不人为注水。详见 SKILL.md §2.2 |
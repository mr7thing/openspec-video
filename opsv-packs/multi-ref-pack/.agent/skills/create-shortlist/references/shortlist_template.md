# Shortlist 模板

> 适用阶段：S3 Shortlist
> 文件位置：`videospec/shortlist.md`

---

## 撰写原则

1. **先合并 Beat → 再做镜头语言 → 再排台词时间轴 → 再配音效 → 最后抽资产清单**
2. **每个 Shot 必须能用一句话概括**——概括不了说明跨节拍了
3. **台词逐句排时间**——按 3 字/秒计算，不能跳过任何一句
4. **音效不可省略**——每个 Shot 至少标注环境音

---

## 正文结构（按板块顺序）

### 1. Shot 场记表

```markdown
## Shot 场记表

| Shot | Beats | Duration | Scene | Characters | Props | Summary |
|------|-------|----------|-------|------------|-------|---------|
| 1 | S01-Beat01~02 | 12s | @Temple-Day | @LuRan, @Guard | — | 禁军列阵，陆然入场 |
| 2 | S01-Beat03~06 | 13s | @Temple-Day | @LuRan, @YunLi | @Stele | 陆然走向婚碑，云璃质问 |
| 3 | S01-Beat07~09 | 10s | @Temple-Day | @YunLi | @BeadCurtain | 云璃情绪突变，珠帘落地 |
| 4 | S02-Beat01~03 | 14s | @Seashore-Night | @YunLi, @LuRan | — | 东海之滨对话 |
```

### 2. Shot 镜头语言

```markdown
## Shot 镜头语言

### Shot 1: 禁军列阵，陆然入场

- **景别**: wide
- **运镜**: dolly（缓慢推近婚碑）
- **机位**: low-angle（婚碑巍峨感）
- **光影**: 白日室外，阳光照射婚碑，龙纹反射金光
- **时长**: 12s

> prompt: WIDE SHOT, low-angle, dolly in. Sunlight streams through temple courtyard, illuminating a towering wedding stele with dragon reliefs glowing gold. One hundred armored guards stand in formation before the stele. LuRan enters from the courtyard gate, red robes billowing. Cinematic composition, 3D render, Unreal Engine quality.

### Shot 2: 陆然走向婚碑，云璃质问

- **景别**: medium → close-up
- **运镜**: static（正反打对切）
- **机位**: eye-level
- **光影**: 白日室外，柔和顶光，面部清晰
- **时长**: 13s

> prompt: MEDIUM SHOT to CLOSE-UP, eye-level, static. LuRan steps forward before the wedding stele, his expression grave. YunLi watches from behind, black imperial robes, a cold smirk on her face. Bead curtain sways slightly in her hand. Tense atmosphere, 3D render, Unreal Engine quality.
```

### 3. 台词时间轴

```markdown
## 台词时间轴

### Shot 1 时间轴（总长 12s）

| 时间 | 角色 | 台词 |
|------|------|------|
| 0:00-0:05 | — | （纯画面：禁军列阵，陆然入场） |
| 0:05-0:09 | 陆然 | "臣，陆然，受命于天。"（12字 ÷ 3 = 4s） |
| 0:09-0:12 | — | （陆然走向婚碑，3s 纯动作） |

### Shot 2 时间轴（总长 14s）

| 时间 | 角色 | 台词 |
|------|------|------|
| 0:00-0:03 | — | （云璃从暗处走出） |
| 0:03-0:07 | 云璃 | "陆然，你当真以为，这婚约是恩赐？"（15字 ÷ 3 = 5s，含停顿取 4s） |
| 0:07-0:08 | 陆然 | "臣不敢。"（3字 ÷ 3 = 1s） |
| 0:07-0:14 | 云璃 | "不敢？我看你敢得很。"（8字 ÷ 3 ≈ 3s，紧接陆然话音） |
```

> **注意**：
> - 3 字/秒为基础速率，句间停顿 +1s，情绪转折 +2s
> - 重叠对话分别标注起止时间，允许时间重叠（如 Shot 2 中 0:07 起两人同时说话）
> - 纯画面无台词的行标注 `—`，说明画面内容

### 4. 音效清单

```markdown
## 音效清单

### Shot 1 音效

| 类型 | 时间 | 音效 | 说明 |
|------|------|------|------|
| 环境 | 全程 | 风啸声 | 宗庙高地，风声低沉 |
| 环境 | 全程 | 铠甲摩擦 | 禁军阵列，金属轻微碰撞 |
| 动作 | 0:02 | 重步落地 | 陆然踏步入场 |
| 动作 | 0:05 | 衣袍拂动 | 陆然红袍转身 |

### Shot 2 音效

| 类型 | 时间 | 音效 | 说明 |
|------|------|------|------|
| 环境 | 全程 | 风啸声（减弱） | 镜头推近，风声渐远 |
| 动作 | 0:01 | 轻步声 | 云璃从暗处走出，鞋跟触地 |
| 动作 | 0:03 | 珠帘轻响 | 云璃手中珠帘微晃 |
```

> **必须覆盖**：
> - 每个 Shot 至少 1 条环境音（无环境音的场景标注"寂静"）
> - 有动作的 Shot 必须有对应的动作音
> - 环境音从 Shot 1 到 Shot N 保持连贯（同一场景不重复描述相同环境音，标注"同 Shot X"）

### 5. 资产需求清单

```markdown
## 资产需求

### 角色

| ID | 复用（Shot） | 频次 | 说明 |
|----|-------------|------|------|
| @LuRan | Shot 1/2/4 | 高频 | 需多角度 |
| @YunLi | Shot 2/3/4 | 高频 | 需多角度 |
| @Guard | Shot 1 | 单镜头 | 龙套 |

### 场景

| ID | 复用（Shot） | 频次 | 说明 |
|----|-------------|------|------|
| @Temple-Day | Shot 1/2/3 | 高频 | 宗庙日景 |
| @Seashore-Night | Shot 4 | 单镜头 | 东海夜 |

### 道具

| ID | 复用（Shot） | 说明 |
|----|-------------|------|
| @Stele | Shot 2 | 龙纹婚碑 |
| @BeadCurtain | Shot 3 | 云璃手中珠帘 |
```

---

## Frontmatter（下游确定性合同）

> **原则**: Frontmatter 是下游阶段的确定性输入合同。S4/S5/S6/S7 只从这里拿结构化数据就能开工，不需要解析正文表格。

```yaml
---
category: shortlist
status: drafting
id: Shortlist-<项目>
title: "<项目名> Shortlist"
source_script: Script-<项目>
episode: "EP01"
beat_range: "S01-Beat01~S02-Beat03"
shot_count: 4
shots:
  - id: "S01-Shot01"
    duration: 12
    scene: "Temple-Day"
    characters: ["LuRan", "Guard"]
    props: []
  - id: "S01-Shot02"
    duration: 13
    scene: "Temple-Day"
    characters: ["LuRan", "YunLi"]
    props: ["Stele"]
  - id: "S01-Shot03"
    duration: 10
    scene: "Temple-Day"
    characters: ["YunLi"]
    props: ["BeadCurtain"]
  - id: "S02-Shot01"
    duration: 14
    scene: "Seashore-Night"
    characters: ["YunLi", "LuRan"]
    props: []
characters:
  - id: "LuRan"
    frequency: "high"
  - id: "YunLi"
    frequency: "high"
  - id: "Guard"
    frequency: "single"
scenes:
  - id: "Temple-Day"
    frequency: "high"
  - id: "Seashore-Night"
    frequency: "single"
props:
  - id: "Stele"
  - id: "BeadCurtain"
created: "<YYYY-MM-DD>"
---
```

### Frontmatter 字段说明（谁消费什么）

| 字段 | 类型 | 消费方 | 用途 |
|------|------|--------|------|
| `shots[].id` | string | S5 分镜, S6 视频 | 每个 Shot 生成一个分镜文档 + 一个视频片段 |
| `shots[].duration` | int | S6 视频 | 视频时长参数 |
| `shots[].scene` | string | S4 资产, S5 分镜 | 场景定档引用 |
| `shots[].characters` | array | S4 资产 | 该 Shot 出场角色（汇总统筹） |
| `shots[].props` | array | S4 资产 | 该 Shot 使用道具 |
| `characters[].id` | string | S4 定档文档, S7 配音 | 创建 `elements/{id}.md`，高频优先 |
| `characters[].frequency` | enum | S4 | `high`=3+Shot, `medium`=2 Shot, `single`=1 Shot |
| `scenes[].id` | string | S4 定档文档 | 创建 `scenes/{id}.md` |
| `scenes[].frequency` | enum | S4 | 同上 |
| `props[].id` | string | S4 资产 | 创建道具资产 |
| `beat_range` | string | validator | 校验 Beat 覆盖完整性 |
| `episode` | string | 归档 | EP 编号

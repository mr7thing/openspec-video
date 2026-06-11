# Refs 编写指南

> refs 是 Circle DAG 的骨架。写错 refs = Circle 拓扑崩塌 = 整个管线瘫痪。
> 这是 Agent 最高频的错误点，请在每次撰写和审查 refs 时使用本指南。

---

## 核心原则

**refs 只表达「生成此资产所需的视觉输入依赖」。**

不是剧情关系。不是上下文关系。不是归属关系。

---

## 自检流程

### 第一步：逐个 @id 三连问

对 refs 中的每一个 `@id`，回答：

| # | 问题 | 你的答案 |
|---|------|---------|
| 1 | 生成此资产时，**这张参考图必须先存在**吗？ | 是 / 否 |
| 2 | 没有这张图，模型**画不出/画错**当前资产吗？ | 是 / 否 |
| 3 | 这个引用是**视觉输入**，还是**剧情说明**？ | 视觉输入 / 剧情说明 |

**判定**：三个都答「是 / 是 / 视觉输入」→ 进 refs。任何一个答「否」或「剧情说明」→ 不进 refs。

### 第二步：层级归属检查

对照下表，检查每个 @id 是否属于当前资产应该依赖的层级：

| 当前资产层级 | 应该依赖 | 不应依赖 |
|------------|---------|---------|
| 风格参考（第 0 层） | 空 / 外部素材 | 任何角色 / 场景 / 分镜 |
| 角色定档（第 1 层） | 第 0 层风格参考 | 其他角色、场景、分镜 |
| 场景定档（第 2 层） | 第 0 层风格参考 | 角色（即使该场景有角色出现！） |
| 分镜画面（第 3 层） | 用到的角色 + 场景 | 其他分镜 |
| 分镜视频（第 4 层） | 对应分镜的帧 | — |

### 第三步：DAG 检查

检查整个项目的 refs 图是否存在循环：

```
@hero → @style:anime  ← 单向，OK
@temple → @style:anime  ← 单向，OK
@shot_01 → @hero, @temple  ← 单向，OK

@hero → @brother → @hero  ← 循环！❌
@shot_01 → @shot_02 → @shot_01  ← 循环！❌
```

---

## 常见错误库

### 错误 1：场景定档引用了角色

```yaml
# scenes/temple.md
refs:
  image:
    "@hero": [path]    # ❌ 画庙宇时不需要先有英雄
```

**为什么错**：定档庙宇只需要风格参考，不需要知道谁会出现在里面。角色的视觉形象不会影响庙宇的绘制。

**正确**：
```yaml
# scenes/temple.md
refs:
  image:
    "@style:donghua": [path]    # ✅ 仅依赖风格
```

### 错误 2：角色定档引用了场景

```yaml
# elements/yun_li_adult.md
refs:
  image:
    "@temple": [path]    # ❌ 画云力时需要先有庙宇？
```

**为什么错**：定档角色是画"这个人长什么样"，与他在什么场景出现无关。

### 错误 3：两个独立角色互相引用

```yaml
# elements/sister.md
refs:
  image:
    "@brother": [path]    # ❌ 画妹妹时需要先有哥哥的图？

# elements/brother.md
refs:
  image:
    "@sister": [path]     # ❌ 循环依赖
```

**为什么错**：两个角色是独立个体，各自定档。他们的关系应该在分镜 prompt 中体现（`@sister 站在 @brother 身旁`），而不是在 refs 中。

### 错误 4：分镜引用了不在画面中的资产

```yaml
# shots/shot_01.md
# prompt: "@hero 独自站在 @temple 庭院中"
refs:
  image:
    "@hero": [path]
    "@temple": [path]
    "@villain": [path]    # ❌ villain 根本不在画面里
    "@sword": [path]      # ❌ sword 也不在画面里——这是分镜 03 才出现的
```

**为什么错**：prompt 不包含 `@villain` 也不包含 `@sword`。这些图不会被用到，但会被计入 DAG，可能产生虚假依赖。

### 错误 5：把剧情前置当依赖

```yaml
# shots/shot_03.md — "这是 @hero 和 @villain 的最终对决"
refs:
  image:
    "@hero": [path]
    "@villain": [path]
    "@shot_02": [path]    # ❌ "因为上一镜发生了什么所以需要引用它"
```

**为什么错**：`@shot_02` 的视觉内容不会作为当前画面的输入。「剧情前置」≠「视觉输入依赖」。`@shot_02` 的产出（帧）如果是本镜的首帧，应该用 `@FRAME:shot_02_last` —— 但那是在 shotlist.md 的 `first_frame` 里写，不是 refs。

---

## 验收 check-list

完成所有文档的 refs 后，执行以下检查：

```
□ opsv validate — 零错误
□ opsv refs check <每个文件> — 双向校验通过
□ 逐个 @id 三连问 — 全部通过
□ 层级归属检查 — 无越级依赖
□ DAG 检查 — 无循环
□ prompt 中的每个 @-token 都在 refs 中有对应 key
□ refs 中的每个 key 都在 prompt 中被引用
□ 没有"为防万一先写上"的冗余 refs
```

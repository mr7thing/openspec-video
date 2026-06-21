---
project: openspec-video
pack: multi-ref-pack
version: 1.0.0
---

# 用户画像

本技能包的使用者是 OPSV 项目 Agent。通过本包，Agent 应从"拿到一个创意想法"到"产出最终视频资产"完成全流程。

## 用户期望

- **无冗余对话**：Agent 应直接执行，减少不必要的确认
- **遵守 OPSV 规范**：所有文档必须符合 frontmatter schema 和 category 校验规则
- **文档即源码**：不要手动修改 `opsv-queue/` 下的任何文件
## 核心工作流：三层生命周期

OPSV 管线中存在三层相互关联的生命周期。Agent 必须理解它们的关系。

```
文档                      任务                       产物
────                      ──                        ──
drafting                  (不存在)                   (不存在)
   │                         │                         │
   │  opsv compile           │                         │
   ├────────────────────────→│                         │
   │                    task JSON                      │
   │                         │                         │
   │                    opsv run                       │
   │                         ├────────────────────────→│
   │                         │                    {json基名}_1.png
   │                         │                         │
   │                    opsv iterate                   │
   │                         ├──→ 复制出 {json基名}_m1.json
   │                         │    修改 prompt/refs      │
   │                    opsv run                       │
   │                         ├────────────────────────→│
   │                         │                    {json基名}_m1_1.png
   │                         │                         │
 review（动作）←──────────────┤                         │
   │                         │                         │
   ├── 无修改 ──→ approved   │                         │
   │                         │                         │
   ├── 有修改 ──→ syncing ←──┘  (从 task JSON 回写)    │
   │                │                                   │
   │                └──→ approved                       │
```

### 2.1 文档生命周期

文档只有三个状态：

```
drafting ──→ approved              （无修改，review 直接通过）
drafting ──→ syncing ──→ approved  （任务有修改，review 后标记为 syncing 等待agent 读取 task.json 回写）
```

| 状态 | 含义 |
|------|------|
| `drafting` | 编辑中，内容可自由修改 |
| `syncing` | 任务被 iterate 修改过且 review 通过，需从任务 JSON 回写 prompt/refs 到文档 |
| `approved` | 定稿，下游可引用 |

`opsv review` **用户交互动作**——在用户审批通过产物以后，它判断任务是否有修改，决定走哪条路径：
- 任务无修改 → 直接标记 `approved`
- 任务有修改 → 标记 `syncing`，回写完成后再标记 `approved`

> **syncing 不是必经状态**。仅当任务被 iterate 修改过后才进入。

### 2.2 任务生命周期

任务由文档编译而来（通过 `opsv compile` / circle），存储在 `opsv-queue/` 下。

```
文档 compile → task JSON → opsv run → 执行
                           opsv iterate → task JSON'（修改版）→ opsv run → 执行
```

- 任务 JSON 是 **OPSV 自动管理的中间产物**
- 如需修改，使用 `opsv iterate` 命令——它复制出 `{基名}_m{N}.json`，Agent 在副本上修改 prompt/duration/seed 后重新执行
- 产物文件命名从任务 JSON 名推导：`{json基名}_{序号}.png`（首次）/ `{json基名}_m{N}_{序号}.png`（迭代副本）

### 2.3 产物生命周期

产物是任务执行后生成的实际文件（图像/视频/音频）。

```
首次：{基名}_1.png
重跑：{基名}_2.png
迭代：{基名}_m1_1.png → {基名}_m1_2.png → ...    （第1轮迭代）
　　　{基名}_m2_1.png → ...                      （第2轮迭代）
```

> `_m` 在 JSON 文件名上。从 `{基名}.json` iterate 得 `{基名}_m1.json`，产物为 `{基名}_m1_1.png`。

- 产物文件由 OPSV 命令自动命名，**禁止手动改名**
- 历史版本保留，只增不删
- 产物通过 `asset_id` 字段回写到文档，供下游 `@id` 引用

### 2.4 三层联动总结

| 操作 | 文档 | 任务 | 产物 |
|------|------|------|------|
| 文档写好后 compile | drafting | task JSON 创建 | — |
| 执行任务 | drafting | running | 生成文件 |
| 不满意，iterate 改 prompt | drafting | `{基名}_m1.json` 创建 | — |
| 重新执行 | drafting | running | 生成 `{基名}_m1_1.png` |
| 审核通过（无修改） | approved | — | 定稿 |
| 审核通过（有修改） | syncing → approved | agent 回写 prompt/refs 到文档 | 定稿 |

> **核心原则**：迭代改的是任务 JSON，不是源文档。源文档通过 标记为syncing 等待 agent 回写来同步。

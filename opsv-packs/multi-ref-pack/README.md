# Multi-Ref Pack — OPSV 完整生产管线技能包

> **一句话**：从剧本到视频，教 Agent 用 OPSV 完成一整套影视音生产流程。

| 属性 | 值 |
|------|-----|
| 版本 | 1.0.0 |
| 技能数 | 11（含 1 个 superseded） |
| 管线阶段 | S0~S6（含 S4.5/S5.5 半阶段） |
| 目标场景 | 漫剧/短片/宣传片等文档驱动视频生产 |

## 管线总览

```
S0 项目启动 ──→ S1 知识图谱 ──→ S2 Beat 拆解 ──→ S3 Shortlist
                      │                              │
                      ▼                              ▼
                 S5 镜头参考帧 ←── S4 资产生成 ←──────┘
                      │              │
                      ▼              ▼
                 S5.5 分镜草图       S4.5 多视图（角色/场景）
                      │
                      ▼
                 S6 视频生产
```

## 11 技能一览

| 技能 | 阶段 | 核心产出 | Category | Circle |
|------|------|----------|----------|--------|
| `opsv-ref-pipeline` | S0 | 项目初始化 + 管线导航 | — | — |
| `graphify-drama` | S1 | 知识图谱 + project.md | `project` | — |
| `beat-script` | S2 | Script.md（Beat 拆解） | `multi_ref_breakdown` | — |
| `create-shortlist` | S3 | shortlist.md（镜头语言 + 制片决策） | `shortlist` | — |
| `create-elements` | S4 | 角色/场景/道具定档 + 声音设计 | `character` / `scene` / `prop` / `voice` / `bgm` / `sound_effect` | ZeroCircle |
| `create-character-multiview` | S4.5 | 角色多角度参照表 | `character_multi_view` | ZeroCircle |
| `create-scene-multiview` | S4.5 | 场景多角度参照表 | `scene_multi_view` | ZeroCircle |
| `shot-reference` | S5 | 单帧合成参考图 | `shot_ref` | FirstCircle |
| `shot-storyboard` | S5.5 | 3×3 分镜草图 | `shot_storyboard` | FirstCircle |
| `shotgen` | S6 | 镜头组文档 → mp4（4 镜/组） | `shot_production` | EndCircle |
| `shot-production` | S6 (旧) | ⛔ SUPERSEDED → 见 shotgen | `shot_production` | EndCircle |

## 7 统贯关切

每个技能都必须覆盖以下 7 个维度：

1. **生产流程** — 该阶段做什么、怎么做
2. **依赖处理** — 需要哪些上游产出、怎么验证就绪
3. **提示词生成** — prompt 怎么写、有什么规则
4. **引用语法编写** — `@id` / `@:key` / `@FRAME:` 何时用、怎么引用
5. **任务编排 (Circle)** — 该技能对应哪个 Circle 层级
6. **迭代与 Review** — 怎么 review、怎么 iterate
7. **资产回写** — review 通过后怎么回写 asset_id

## 核心原则

- **文档即源码** — 一切资产和状态由 `.md` frontmatter 驱动
- **Circle 分批** — ZeroCircle → FirstCircle → EndCircle 逐环推进
- **不可删除** — `opsv-queue/` 只增不删，所有版本可回溯
- **门控验收** — 每阶段完成后必须 `opsv validate` + `opsv approve`

# OPSV 新版框架下 MV 生成 Workflow 设计

> 日期：2026-08-14
> 上游输入：`~/文档/clawbay/20_Projects/opsv/音乐mv 流程系统提示词设计.md`（Minimax H3 Prompt Compiler + Music Timeline 分析器）
> 框架基线：`docs/OPSV_CANONICAL_RUNTIME_REFACTOR_PLAN_2026-08-14.md`（P0-P7 + Q1-Q5 已交付）
> 结论：**Workflow 仍然定义为 Pack**；H3 编译器是 Pack 的一个 Capability Provider（backend adapter）。

---

## 1. 现在 workflow 是怎么定义的？仍是 Pack 吗？

**是，仍然是 Pack，而且这正是新框架想要保留的边界。**

OPSV 的 workflow 从不「写死在 CLI 里」，而是由 **Pack** 声明。重构（P0-P7 + Q1-Q5）没有改变这一点，反而让 Pack 变轻、把执行语义下沉到了 Canonical Runtime。当前的 Pack 是一个**声明式工作流契约**，由五类文件组成：

| 文件 | 作用 | 现状（以 `packs/mv-3d-ref` 为例） |
|---|---|---|
| `pack.yaml` | 声明式索引：id/version/policy/categories/profiles/skills | `mv-3d-ref` 0.1.0 |
| `graph.yaml` | **Stage Contract**：工作流 DAG，每 stage 声明 `depends_on`/`inputs`/`outputs.contract`/`completion`/`roles`/`recommended_capabilities` | style-references → clay-keyframes → render |
| `categories/*.yaml` | asset 类型 → default profile + 允许的 profiles | `render` |
| `profiles/*.yaml` | `workflow`（指导创作，无 Task）vs `production`（`capability` + `outputs` → 编译成一个 Task） | `render-to-real`：`capability: image-to-video` |
| `skills/*/` | `SKILL.md`（Agent 指令）+ `skill.yaml`（action/gates/completion） | clay-keyframes / render-to-real |

**现有两个 MV pack 是 3D 黏土管线**（`mv-3d-previs`：Blender 黏土 previs → `mv-3d-ref`：黏土 → AI keyframes → render-to-real），和 H3 文档描述的「音乐分析 → 时间轴导演 → H3 视频生成」是**不同领域**的 workflow——但都落在同一个 Pack 契约上。

**新框架对 Pack 的增强**（P0-Q5 之后 pack 现在能声明的东西）：

- `recommended_capabilities` → 挂到 **Capability Registry**（`opsv capabilities`），软约束、永不 whitelist。
- `selectors:` → **Reference DSL v2** 成员访问白名单（`@alice.face` 等）。
- `artifact:` 块 → **Artifact Contract**（duration/codec/resolution/frameRate/hasAudio/aspectRatio）。
- 四个标准 role 的 `required|optional|not_applicable` → Context Manifest。
- 资产从 `draft→candidate→review→approved→released` 的**状态机** + `opsv commit`/`import`/`provenance`/`repair` 是 Core，不在 pack 里。

---

## 2. H3 文档到底描述了什么（六层管线）

读完整份 6703 行文档后，它包含**四份递进的「系统提示词」产物**，最终收敛为一个 **6 层 MV 管线**（文档原文 §"最终 6 层架构"）：

```
INPUT (MP3 / Lyrics / References / Visual Intent)
 01 MUSIC ANALYZER     (LLM + 音频分析)        MP3 → Music Timeline
 02 MUSIC NORMALIZER   (CODE / Schema / 对齐)   Music Timeline → Canonical Timeline
 03 VISUAL DIRECTOR    (LLM)                   音乐事实 + 参考 + 意图 → Visual Timeline
 04 SHOT PLANNER       (LLM)                   Visual Timeline → Shot Plan
 05 REF2VA COMPILER    (LLM)                   Shot Plan + 参考 → H3 Prompt
 06 VALIDATOR          (CODE)                  schema + 格式校验
```

文档明确给出**三层职责划分**（事实层 / 决策层 / 编译层），且**层 02 和层 06 是 CODE，不一定是 LLM**（原文 §"如果你准备真正做 API 产品，反而建议把它们做成程序化 Pipeline + 小型 LLM 校正"）：

- **① Music Analyzer = 事实层**：不知道角色、不知道场景，只知道「音乐在 37.2 秒发生了什么」（vision-agnostic）。
- **③④ Visual Director + Shot Planner = 决策层**：把音乐事实 + 用户视觉意图 + Reference 转成视觉语言。
- **⑤ REF2VA Compiler = 编译层**：不再做创作决策，只把已决定的 Shot Plan 编译成 H3 能理解的 Prompt。

### 层 A —— Music Timeline 分析器（事实层）

> 不是「写视频 Prompt」，而是先把歌曲变成一个**可计算的时间轴导演脚本**，再让 REF2VA 按这个时间轴生成视频。

输入：音频 + 歌词 + 参考图/角色/环境 + 视觉意图。输出权威 MUSIC TIMELINE，top-level 结构：

```json
{
  "track": { "duration_ms", "duration", "bpm", "time_signature", "key", "tempo_character", "confidence" },
  "global_analysis": { "genre", "overall_emotion", "emotional_arc", "energy_arc", "dominant_instruments", "vocal_style", "production_character", "visual_strategy" },
  "lyrics": [{ "id": "L001", "start_ms", "end_ms", "text", "vocal_role", "delivery", "emotion", "emphasis", "confidence" }],
  "music_sections": [{ "id": "SEC_01", "type": "INTRO|VERSE|CHORUS|...", "start_ms", "end_ms", "energy", "emotion", "vocal_status", "dominant_elements", "visual_role" }],
  "instrument_events": [{ "id": "INS_001", "instrument", "start_ms", "end_ms", "role", "foreground", "highlight", "visual_cue" }],
  "vocal_events": [...],
  "melodic_events": [...],
  "dynamic_events": [...],
  "visual_segments": [{ "id": "VIS_07", "start_ms", "end_ms", "source_music_sections", "lyric_ids", "dominant_music", "energy", "emotion", "character_direction", "camera_direction", "environment_direction", "visual_priority" }],
  "visual_cues": [...]
}
```

核心原则：**区分「听到什么」与「该展示什么」**；用 `start_ms`/`end_ms` 作机器可读规范；不编造精度；歌词对齐由 ASR/forced-alignment 提供基础时间戳，LLM 聚合为乐句/情绪段。

### 层 B —— Timeline-first REF2VA Compiler（最终编译层）

> You are the FINAL COMPILATION LAYER. 你不得重新设计概念、不得重新解读音乐、不得发明新角色/参考资产；只负责把结构化 TIMELINE → H3-兼容 TIMELINE。

输入：`Reference Assets + Music Timeline + Visual Timeline + Shot Plan`。输出**严格六段**（顺序固定，无 JSON/markdown/解释）：

```
subject_definitions:      # 每个 <Subject N> 一行 + fully_preserved/attribute_transfer 等
summary:                  # [keyframe completion]/[video editing]/[video continuation]/... 前缀
retention_analysis:       # 每个 label 的保留强度
detailed_description:     # 权威视觉时间轴：style opener + [Shot 1](无时间戳) + [Shot N] At MM.mmm
overall_soundscape:       # diegetic 声音
non_diegetic_music:       # 非剧情音乐
```

关键规则（会映射成 Canonical 约束）：
- **生成模式**：REF2VA / T2VA / I2VA / FL2VA / L2VA（由输入资产自动判定）。
- **shot budgeting**：4-6s→1-2 shots、7-10s→2-3、11-15s→3-5；**单 shot 单主动作**。
- **资产标签**：`<Picture N>`/`<Video N>`/`<Audio N>`/`<Subject N>` 全局一致、位置化、不发明。
- **时间戳**：`[Shot 1]` 无时间戳，`[Shot N] At MM.mmm` 严格递增、都在时长内。
- **每 shot 必写 camera 行为**（static 也要说 "The camera remains static"）；camera 语言规范（tracking/security/macro/action cam…）。
- **character consistency** + **color-lock / action vectors / environmental reactivity**（动作场景可执行视觉约束）。

---

## 3. 新框架映射（核心洞察）

H3 文档的六层管线，**恰好就是新框架里已经建好的构件**。最关键的两点对齐：

1. **「02 Normalizer 和 06 Validator 是 CODE」→ 它们就是 OPSV Core**（不是 pack skill）：Normalizer 是 Canonical Parser/Normalization Layer（P2 已建），Validator 是 Artifact Contract + `opsv commit`/`validate`（P3b/Q4 已建）。
2. **「事实层 / 决策层 / 编译层」三分 → OPSV 的「Skill = 创作，OPSV = 生产」边界**：事实层（音乐分析）与决策层（导演/镜头）是外部 Capability（Skill/API/LLM）；编译层（H3 compiler）+ 校验层（validator）是 OPSV Core 能强约束的地方。

| H3 文档概念 | 新框架已建构件 | 对应关系 |
|---|---|---|
| Music Timeline（`visual_segments`/`lyrics`/`music_sections`） | **`CanonicalTimeline` + `CanonicalSegment`**（P1） | Music Timeline 是 Canonical Timeline 的「音频维度」来源 |
| 02 Music Normalizer（CODE） | **Canonical Normalizer / `opsv materialize`**（P2） | 程序化对齐，不靠 LLM |
| Visual Timeline / Shot Plan | **`CanonicalShot`/`CanonicalSegment`**（camera/action/subject/scene/refs/constraints） | 视觉维度 |
| Timeline-first REF2VA Compiler | **`PromptCompiler` 作为 backend adapter**（分析 §7「H3 = backend adapter」） | H3 是 Provider 编译目标，不是核心格式 |
| 06 Validator（CODE） | **Artifact Contract + `opsv commit`/`validate`**（P3b/Q4） | schema + 格式校验 |
| 六段固定输出 / 生成模式 | **`Capability` + `Artifact Contract`** | `video.generate@h3` 的契约 |
| `<Subject N>` / `<Picture N>` 全局一致 | **Reference DSL v2 + Resolver**（确定性依赖图） | 标签 = CanonicalReference |
| character consistency / color-lock | **`CanonicalConstraint`**（identity=strict 等） | 约束进 IR，不靠 prompt 措辞 |

即：**音乐是「时间」、导演是「语义」、H3 是「后端」、Normalizer/Validator 是「OPSV Core」**——正好是分析文档 §7 的 `Semantic Model → Prompt Compiler → Provider Prompt` 三分，加上 OPSV 自己的「事实层/决策层/编译层」边界。

**一个时间模型注意点**（文档明确）：H3 文档把 **shot 时间当 segment 本地时间**（`[Shot 2] At 00:03.200` 是 segment 内偏移）、**Timeline START/END 当全局时间**。映射到 Canonical Model 时，`CanonicalSegment.start/end` 必须是全局时间：`global_start = timeline.start_ms + shot_local_start_ms`。这正好是 `CanonicalTimeline` 的既有语义（segments 按全局时间排序），无需改动，但要写清在 Normalizer 里完成「本地 → 全局」换算。

---

## 4. 具体 Pack 设计（新版框架 MV workflow）

建议定义一个新 pack `mv-h3`（或从 `opsv-mv-pipeline` 演进），**六阶段**——其中 02/06 是 OPSV Core（CODE），01/03/04/05 是外部 Capability（LLM/Skill）：

```yaml
# graph.yaml
workflow:
  music-analysis:        # 01 事实层 (LLM+音频): MP3 → Music Timeline
    depends_on: []
    inputs: [music_audio, lyrics]
    outputs: { contract: music-timeline-v1 }
    completion: [output_exists, output_contract_valid]
    roles: { document-author: required, contract-checker: required, production-dispatcher: not_applicable, asset-quality-reviewer: optional }
    recommended_capabilities: [audio.analyze]

  music-normalize:       # 02 CODE (OPSV Core): Music Timeline → Canonical Timeline
    depends_on: [music-analysis]
    inputs: [music_timeline]
    outputs: { contract: canonical-timeline-v1 }
    completion: [output_exists, output_contract_valid]
    roles: { document-author: not_applicable, contract-checker: required, production-dispatcher: not_applicable, asset-quality-reviewer: optional }

  visual-direction:      # 03 决策层 (LLM): 音乐事实 + 参考 + 意图 → Visual Timeline
    depends_on: [music-normalize]
    inputs: [canonical_timeline, reference_inventory, visual_intent]
    outputs: { contract: visual-timeline-v1 }
    completion: [output_exists, output_contract_valid]
    roles: { document-author: required, contract-checker: required, production-dispatcher: not_applicable, asset-quality-reviewer: required }
    recommended_capabilities: [video.plan]

  shot-plan:             # 04 决策层 (LLM): Visual Timeline → Shot Plan
    depends_on: [visual-direction]
    inputs: [visual_timeline, reference_inventory]
    outputs: { contract: shot-plan-v1 }
    completion: [output_exists, output_contract_valid]
    roles: { document-author: required, contract-checker: required, production-dispatcher: not_applicable, asset-quality-reviewer: required }
    recommended_capabilities: [video.plan]

  h3-compile:            # 05 编译层 (LLM): Shot Plan + 参考 → H3 prompt → 生成
    depends_on: [shot-plan]
    inputs: [shot_plan, reference_inventory]
    outputs: { contract: h3-ref2va-v1 }
    completion: [output_exists, output_contract_valid, document_status_approved]
    roles: { document-author: required, contract-checker: required, production-dispatcher: required, asset-quality-reviewer: required }
    recommended_capabilities: [video.generate]

  validate:              # 06 CODE (OPSV Core): Artifact Contract 校验 + Review
    depends_on: [h3-compile]
    inputs: [generated_clip]
    outputs: { contract: review-v1 }
    completion: [document_status_approved]
    roles: { document-author: not_applicable, contract-checker: required, production-dispatcher: not_applicable, asset-quality-reviewer: required }
```

**关键设计点**：

1. **Music Timeline = 一个 Canonical 资产文档**（category `music-timeline`，workflow profile），frontmatter 存 `track`/`global_analysis`，正文/`plan` 存 `visual_segments`（每个 segment 是 Canonical Segment，带 `start_ms/end_ms` + `character_direction`/`camera_direction`）。
2. **02 music-normalize 与 06 validate 是 OPSV Core，不是 pack skill**：Normalizer = `opsv materialize`/`validate` 把 Music Timeline 的 `visual_segments` 程序化对齐为 `CanonicalTimeline`（完成「本地→全局」时间换算：`global_start = timeline.start_ms + shot_local_start_ms`）；Validator = Artifact Contract（六段固定顺序、时间戳严格递增、`[Shot 1]` 无时间戳、单 shot 单主动作、标签全局一致）。
3. **Shot Plan = Canonical Shot 资产**（category `shot`，production profile），每个 shot 是 `CanonicalSegment`：`{timeline, subjects, scene, camera, action, references, constraints}`。镜头边界必须对齐 Music Timeline 的 `visual_segment` 时间戳（文档 §4200「所有时间戳来自 Music Timeline 或合法 segment 边界」）。
4. **H3 编译器 = 一个 PromptCompiler provider adapter**，不是新 skill 语义：消费 `CanonicalSegment[]` → 严格六段 H3 文本（或 `[TIMELINE N]` 分段的独立 H3 prompt）。它**不得**重新设计概念（`MUST NOT redesign`）、**不得**重新解读音乐、**不得**发明角色——这是编译层契约，正是文档「事实/决策/编译」三分的「编译层」。
5. **Capability**：`audio.analyze`（音乐分析，外部 ASR/forced-alignment + LLM 聚合）、`video.plan`（导演/镜头规划）、`video.generate`（绑定 H3/seedance/veo 任一 provider——**模型无关**，这正是分析文档 §10「换模型 OPSV 不变」）。`recommended_capabilities` 软约束，永不 whitelist。

### 4.1 H3 硬约束 → OPSV Artifact Contract（「硬约束进 Validator，不靠 prompt 措辞」）

H3 文档的「内部验证 checklist」（严格递增时间戳、`[Shot 1]` 无时间戳、单 shot 单主动作、六段固定顺序、无 JSON/markdown fence、标签全局一致…）不该靠「让 LLM 记得遵守」，而该下沉为 OPSV 的 **Artifact Contract 规则**（Q4 已扩展了 frameRate/hasAudio/aspectRatio，可继续加 H3 专用规则）：

| H3 硬约束（checklist 项） | OPSV 下沉位置 |
|---|---|
| 严格递增时间戳、`[Shot 1]` 无时间戳、时间都在时长内 | H3 Prompt 的 Artifact Contract `validation`（结构化规则，非正则 hack） |
| 六段固定顺序、无 JSON/markdown fence、无 preamble | Artifact Contract `validation: [{ h3Sections: {...} }]` |
| 单 shot 单主动作、shot budgeting（4-6s→1-2 shots…） | Normalizer（CODE）+ Validator：CanonicalSegment 的 action 计数 + shot 数/时长比 |
| 标签全局一致、不发明标签 | Reference DSL v2 + Resolver（标签 = CanonicalReference，确定性） |
| character/spatial/state continuity | `CanonicalConstraint`（identity/strict 等）+ WorkPacket 的 refs/issue |
| 对话 verbatim、`<d>` 标签格式 | Artifact Contract `validation` |
| 生成模式 REF2VA/T2VA/I2VA/FL2VA/L2VA 自动判定 | Capability `video.generate` 的 input 类型判别（I2VA=first_frame ref、FL2VA=first+last…） |

这正是新框架的核心价值：**H3 文档作为「system prompt」会被吞掉，作为「Artifact Contract + Canonical 约束」才是可验证、可复现的工程。** 文档里 4 份巨型 system prompt，在 OPSV 里降级为 `skills/h3-compiler/references/ref2va-format.md`（创作指导），硬约束由 Core 保证。

---

## 5. 新 runtime 如何让这个 workflow 更强

| 新命令 | 在 MV workflow 中的作用 |
|---|---|
| `opsv build <music-timeline>` | **歌词/乐句改了 → 只重编译受影响 shot**（Q2 增量构建）：改一个 lyric segment → `impactOf` 算出依赖它的 shots → 只重新 H3-compile 这些 shot |
| `opsv commit <clip.mp4> --task shot-023 --provider h3 --seed 42 --parent @alice:v3` | 生成的 H3 视频经 Commit Boundary 进入状态机（candidate） |
| `opsv capabilities` | 发现 `video.generate` 有哪些 provider（h3/seedance/veo），Agent 自选实现 |
| `opsv provenance shot-023` | 追溯「这个镜头为什么长这样」：seed/provider/model/父参考/审核链 |
| `opsv repair shot-023` | 生成失败/被拒时输出失败报告 + 建议动作（rejected → 改 prompt 重新 commit） |
| Review Protocol `/api/canonical/review` | 「00:03 人物脸不对」→ 结构化 annotation → `review→rejected→candidate` → Agent 修订 |

这直接回答了分析文档的核心卖点：**改一句歌词 → OPSV 自动算出受影响的 shot → 只重生成那几个 shot → 重新 assemble**（`opsv build` + `impactOf` + `opsv commit` 闭环）。

---

## 6. 边界与保留

- **Skill 负责「怎么拍」（creative），OPSV 负责「什么必须生成、依赖什么、怎么验证、怎么复现、怎么迭代」（production）。** H3 文档里「cinematic enhancement / camera language / color-lock」这些创作知识，属于导演/摄影 Skill 的 `SKILL.md` + `references/`；「六段固定输出、时间戳递增、单 shot 单动作、标签全局一致」这些**硬约束**，属于 OPSV 的 Artifact Contract + Validator。
- **不动现有 MV 3D 管线**（`mv-3d-previs`/`mv-3d-ref` 是 3D 黏土领域）；`mv-h3` 是并行新增的 H3 视频生成领域 pack。
- **H3 文档的「系统提示词注入」用法**：在 OPSV 框架里，它降级为一个 **Operator/Compiler Skill 的 reference 文件**（`skills/h3-compiler/references/ref2va-format.md`），而不是系统级 system prompt——因为 OPSV 用 Canonical Model + 编译层契约来保证正确性，不靠一段巨型 system prompt。

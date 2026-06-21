---
name: create-elements
description: 资产创建 — 角色视觉/声音/道具三段式生成，从 shortlist.md frontmatter 消费 characters[]+props[]，产出 elements/{id}.md
---

# 资产创建 (Element Creation)

> **阶段**: S4 · 资产创建
> **输入**: `videospec/shortlist.md` frontmatter（`characters[]` + `props[]` + `shots[]` 做上下文参考）
> **产出**: `videospec/elements/{id}.md`（角色/声音/道具）
> **验收**: `opsv validate --dir videospec --category character` / `voice` / `prop`

---

## 1. 职责边界

**你做**：
- 角色视觉设计（外观、服饰、材质、参考风格）
- 声音设计（角色配音 + BGM + 环境音/动作音效）
- 道具设计（材质、风格、归属角色、使用场景）
- 所有产出统一放在 `elements/` 目录下

**你不做**：
- 场景定档（场景放在 `scenes/` 下，由本技能 Phase 1 处理——场景和角色使用相同流程）
- 分镜设计（那是 S5 的事）
- 视频生成（那是 S6 的事）
- 修改 shortlist.md（那是 S3 的事）
- 最终图像/音频生成（本技能产出设计文档 prompt，Engine 执行生成）

---

## 2. 输入约定

从 `videospec/shortlist.md` frontmatter 消费，不解析正文表格：

| frontmatter 字段 | 驱动什么 | 处理顺序 |
|---|---|---|
| `characters[]` | 角色视觉 + 声音设计 | 按 `frequency` 降序：high → medium → single |
| `props[]` | 道具设计 | 角色定档完成后 |
| `shots[]` | 上下文参考 | 查询角色出现在哪些场景、和谁互动、用哪些道具 |

**不消费**：`scenes[]`（场景列表用于定位场景目录下的已有定档文档，不作为本技能的输入合同）

## 3. 三段式工作流

```
shortlist.md frontmatter
      │
      ▼
┌──────────────────────────────────────────────┐
│ Phase 1: 角色视觉设计                          │
│   characters[] → elements/{id}.md             │
│   外观 / 服饰 / 材质 / 参考风格                  │
│   按 frequency: high → medium → single        │
│   同时参考 Script.md 获取角色描写               │
└──────────┬───────────────────────────────────┘
           │ 角色 approved
           ▼
┌──────────────────────────────────────────────┐
│ Phase 2: 声音设计                              │
│   characters[] → elements/Voice-{id}.md       │
│   scenes → elements/BGM-{scene}.md            │
│   声线 / 语速 / 情绪范围 / BGM / 音效           │
│   ⚠️ 声音依赖角色性格，不可与 Phase 1 并行       │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Phase 3: 道具设计                              │
│   props[] → elements/{id}.md                  │
│   材质 / 风格 / 使用场景 / 关联角色              │
│   通过 shots[] 反查道具归属角色                 │
└──────────────────────────────────────────────┘
```

---

### Phase 1: 角色视觉设计

对 `characters[]` 按 `frequency` 降序处理（high 优先）。

对每个角色：

1. 读 `Script.md` 获取角色描写
2. 查 `shots[]` 确认角色出现的场景（`scene` 字段）和互动角色（`characters` 字段）
3. 设计：外观 → 服饰 → 材质 → 参考风格
4. 产出 `elements/{id}.md`

**输出模板**：

```yaml
---
category: character
status: drafting
id: LuRan
frequency: high            # 从 shortlist.md frontmatter 复制
appears_in: [Temple-Day, Seashore-Night]   # 从 shots[] 汇总
interacts_with: [YunLi, Guard]             # 从 shots[] 汇总
design:
  appearance: "青年男性，身材修长，面容清俊，目光坚定"
  outfit: "赤红长袍，腰间玉带，发束银冠"
  material: "丝绸质感红袍，金属龙纹腰带扣，白玉发冠"
  reference_style: "中国古风，三维写实，写意光影"
  key_features:
    - "标志性赤红长袍——所有镜头中的识别锚点"
    - "左眉尾一道细疤——近景特写可见"
    - "腰带龙纹扣——单手可解，动作戏关键道具"
prompt: >
  Young man, tall and lean, with sharp features and determined eyes.
  Flowing crimson silk robes with gold dragon embroidery at collar and cuffs.
  Silver crown binding dark hair, a thin scar at the end of left eyebrow.
  Standing proud in ancient temple courtyard.
  Chinese ancient fantasy style, 3D render, Unreal Engine quality, cinematic lighting.
---
```

---

### Phase 2: 声音设计

**前置条件**：Phase 1 角色设计已 approved。

对每个有台词的角色（从 `shots[]` 中查 `characters` 列表）：

1. 读 Phase 1 的角色视觉设计（性格决定声线）
2. 设计声线：音色 + 语速 + 口音 + 情绪范围
3. 产出 `elements/Voice-{id}.md`

**角色配音模板**：

```yaml
---
category: voice
status: drafting
id: Voice-LuRan
character: LuRan            # 关联 Phase 1 角色 id
voice_base: "中音沉稳，语速适中，带轻微笑意"
pronunciation: "标准普通话"
emotion_range: [calm, firm, warm, intense]
prompt: >
  Deep calm male voice, moderate pace, standard Mandarin.
  Carry a subtle warmth and confidence. Emotional range
  from calm narration to intense confrontation.
  Natural TTS quality, not robotic.
---
```

**BGM 模板**（按场景，从 `shots[].scene` 汇总场景列表）：

```yaml
---
category: bgm
status: drafting
id: BGM-Temple-Day
scene: Temple-Day
style: "传统中国风 + 氛围"
instruments: [guzheng, bamboo_flute, taiko_drum]
tempo: "慢 → 中速"
mood: "宁静中暗藏张力"
prompt: >
  Traditional Chinese instrumental piece. Guzheng melody
  with bamboo flute harmony. Starts slow and peaceful,
  gradually builds tension with soft taiko drum.
  Ambient temple atmosphere, morning light.
---
```

**音效模板**（逐 Shot，从 `shots[]` 按 `id` 提取动作音）：

```yaml
---
category: sound_effect
status: drafting
id: SFX-S01-Shot01
shot_id: S01-Shot01
scene: Temple-Day
elements:
  - ambient: "清晨庭院环境音，鸟鸣，微风穿过树梢"
  - action: "木质地板脚步声，缓慢走近"
  - action: "剑出鞘，金属摩擦声"
prompt: >
  Ambient sound: morning temple courtyard, gentle wind
  through trees, distant birdsong. Footsteps approach on
  wooden floor, slow and deliberate. Sword unsheathed with
  a sharp metallic ring. Cinematic quality.
---
```

---

### Phase 3: 道具设计

对 `props[]` 中的每个道具：

1. 从 `shots[]` 中反查：哪些角色使用了这个道具、出现在哪个场景
2. 设计：材质 + 风格 + 尺寸 + 视觉锚点
3. 产出 `elements/{id}.md`

**输出模板**：

```yaml
---
category: prop
status: drafting
id: Stele
type: prop
used_by: [LuRan, YunLi]       # 从 shots[].props 反查
appears_in: [Temple-Day]
frequency: high                # 跨多 Shot 出现
design:
  name: "婚碑"
  description: "三丈高的白玉石碑，碑面刻有龙凤纹，顶部龙纹金箔镶边"
  material: "白玉质地，龙纹金箔镶边，碑座青石"
  dimensions: "高约 9 米，宽约 2 米"
  reference_style: "中国古代石碑，巍峨感，皇室规格"
  key_features:
    - "碑面龙凤浮雕——场景的视觉中心"
    - "金箔反光——需考虑不同光照下的材质表现"
prompt: >
  Massive white jade wedding stele, approximately 9 meters tall,
  2 meters wide. Dragon and phoenix reliefs carved into the surface,
  trimmed with gold leaf that catches sunlight. Gray stone base.
  Towering and majestic against temple courtyard backdrop.
  Chinese ancient imperial stele, 3D render, cinematic quality.
---
```

---

## 4. 处理顺序（frequency 驱动）

| frequency | 含义 | Phase | 优先级 | 示例 |
|-----------|------|:---:|:---:|------|
| high | 3+ Shot 出现 | Phase 1 先出 | 最优先 | 主角 LuRan |
| medium | 2 Shot 出现 | Phase 1 次之 | 其次 | 配角 |
| single | 1 Shot 出现 | Phase 1 最后 | 最后 | 龙套 Guard |

**并行策略**：
- Phase 1 内部：high 角色的设计文档出具后，medium 和 single 可并行
- Phase 2 必须等对应角色 Phase 1 approved——但不同角色之间可并行（Voice-LuRan 和 Voice-YunLi 互不依赖）
- Phase 3 可在 Phase 2 启动后并行（道具不需要等声音完成）

---

## 5. 验收

```bash
# 逐个分类验证
opsv validate --dir videospec --category character
opsv validate --dir videospec --category voice
opsv validate --dir videospec --category prop
```

人工审阅要点：
- 角色外观是否与 Script.md 描写一致
- 声线是否匹配角色性格
- 道具材质和尺寸是否合理
- 跨资产风格是否统一（均为中国古风三维写实）

---

## 6. 注意事项（踩过的坑）

1. **声音必须等角色** — Phase 2 依赖 Phase 1 定档的角色性格，不能并行
2. **frequency 来自 shortlist.md frontmatter** — 不要自己估算
3. **所有产出统一 `elements/`** — 不分子目录，场景除外（场景放 `scenes/`）
4. **文件命名不含 `@` 前缀** — `@id` 是 prompt 引用语法，不是文件名语法
5. **character → voice 一一定档** — 每个有台词的角色都要有 voice 设计
6. **key_features 是给 S5/S6 的锚点** — 每个角色/道具至少列一个视觉锚点（如"赤红长袍"、"龙凤浮雕"），供分镜和视频生成时做一致性约束
7. **prompt 面向 Engine** — 用英文写，风格关键词明确（3D render / Unreal Engine / cinematic）
8. **YAML key 和 category 大小写一致**
9. **`---` 分隔符成对**

---

---

## 6. 这 7 个关切在本技能如何贯彻

### ① 生产流程
三阶段流水线，按顺序执行：

1. **Phase 1 — 视觉锁定**：读取 `shortlist.md` frontmatter（`characters[]`、`scenes[]`、`props[]`），逐项产设计定档文档 `elements/{id}.md`（角色/场景）和 `scenes/{id}.md`
2. **Phase 2 — 声音设计**：基于 Phase 1 产出的角色，生成配音/BGM/音效定档文档
3. **Phase 3 — 道具设计**：处理 `props[]` 中的道具资产

每阶段产出一批文档后跑 `opsv validate --category <name>` 守门，通过后才 `opsv circle create`。

### ② 依赖处理
- **输入来源**：`videospec/shortlist.md` 的 frontmatter `characters[]` / `scenes[]` / `props[]`
- **Circle 依赖**：本技能产出的角色/场景文档是 S5 shot-reference 和 S6 shotgen 的 `@refs` 目标
- **验证 gate**：`opsv validate --category character|scene|prop|voice` 确保字段完整

### ③ 提示词生成
- 每种资产生成类型有独立的 prompt 模板（见 `references/` 各 guide）
- prompt 必须包含所有引用的 `@id`（如角色图 prompt 引用 `@scene_id` 的场景描述）
- 提示词中的 `@id` 必须在 `refs` 声明，用 `opsv refs check` 验证

### ④ 引用语法
- 角色/场景/道具之间互引用用 `@id`，所有 refs 声明在 `refs.image` 下（均以图片上传）
- `refs` 为双层字典结构，示例：
  ```yaml
  refs:
    image:
      "@LuRan":
        - path/to/LuRan.png
      "@Dojo-Day":
        - path/to/Dojo-Day.png
  ```

### ⑤ 任务环编排
- Circle 在 Phase 各阶段 validate 通过后 `create`
- 编译用 `opsv imagen --model volcengine.seadream --category character`
- agent 不直连 API，全部走 `imagen` 编译 → `run` 执行

### ⑥ 迭代与 Review
- 不满意 → `opsv iterate <task.json>` 复制任务（自动 `_m{N}` 后缀）
- 改任务 JSON 的 prompt/参数 → `opsv run` 重跑
- review 通过 → `opsv approved --file "@id" --action approve`，有 `_mN` 产物时标 `syncing`

### ⑦ 资产回写
- `approve` 后 approved 图片路径写入源文档 body `## Approved References`
- `design_feedback` 后写入 `## Design References`
- syncing 时 Agent 需回写任务 JSON 的 prompt 改动到源 `.md` → 再次 approved

---

## 7. references/

| 文件 | 类别 | 用途 |
|------|------|------|
| `sample_character.md` | 范本 | Phase 1 角色视觉定稿参考样本 |
| `sample_voice.md` | 范本 | Phase 2 声音设计定稿参考样本（配音/BGM/音效） |
| `sample_prop.md` | 范本 | Phase 3 道具设计定稿参考样本 |
| `asset_generation_guide.md` | 指南 | 角色/道具视觉设计指南（模型选择、分辨率、风格） |
| `quality_checklist.md` | 指南 | 设计质量检查清单 |
| `voice_prompt_guide.md` | 指南 | 配音 prompt 编写指南 |
| `bgm_prompt_guide.md` | 指南 | BGM prompt 编写指南（风格/乐器/节奏速查） |

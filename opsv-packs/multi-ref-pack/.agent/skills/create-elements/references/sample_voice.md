# 声音设计范本

> create-elements Phase 2 产出参考。声音资产分三类：人声 / BGM / 音效。

---

## 角色配音范本 — Voice-LuRan

```yaml
---
category: voice
status: drafting
id: Voice-LuRan
character: LuRan
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

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `voice`，对齐 `_category_validate.yaml` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `character` | string | 关联 `elements/{id}.md` 角色 id |
| `voice_base` | string | 中文声线描述（音色+语速+语气） |
| `pronunciation` | string | 发音标准/方言 |
| `emotion_range` | string[] | 情绪区间（从 Script.md 台词推断） |
| `prompt` | string | 英文，面向 TTS Engine |

---

## BGM 范本 — BGM-Temple-Day

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `bgm` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `scene` | string | 归属场景（来自 `shots[].scene`） |
| `style` | string | 风格关键词 |
| `instruments` | string[] | 推荐乐器 |
| `tempo` | string | 节奏变化描述 |
| `mood` | string | 中文气氛描述 |
| `prompt` | string | 英文，面向音乐生成 Engine |

---

## 音效范本 — SFX-S01-Shot01

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `sound_effect` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `shot_id` | string | 关联 `shots[].id` |
| `scene` | string | 关联场景 |
| `elements[].ambient` | string | 环境底噪（每个 Shot 一个） |
| `elements[].action` | string | 动作音（可有多个） |
| `prompt` | string | 英文，面向音效生成 Engine |

## 编写要点

1. **配音依赖角色性格** — Phase 2 必须等 Phase 1 approved 后再开工
2. **BGM 按 scene 不按 shot** — 同一场景共享 BGM
3. **音效逐 Shot** — 每个 Shot 一个 SFX 文档
4. **prompt 用英文** — 面向音频 Engine
5. **category 即类型** — `voice`=人声, `bgm`=背景音乐, `sound_effect`=音效，无需额外 `type` 字段

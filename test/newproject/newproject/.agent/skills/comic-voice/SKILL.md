---
name: comic-voice
description: 漫剧配音引擎 — SiliconFlow CosyVoice2 TTS 角色声线定制、Seedance 音频生成、声线一致性方案、多角色对话场景的音频编排。
---

# 漫剧配音引擎 (Comic Voice)

## 概述

漫剧配音覆盖：角色对白（DIALOGUE）、内心独白（VO/OS）、旁白（NARRATION）。主引擎为 SiliconFlow CosyVoice2 TTS，辅以 Seedance 2.0 自带的音画一体模式。

---

## 配音资产文档模板

```yaml
---
category: comic_voice
status: drafting
title: "EP01 — 陆然 VO 开场独白"
character_ref: "@lu_ran"
script_text: >
  二十年前，我亲手挖出自己的龙珠，立下这龙凤婚碑。
  不为姻缘，只为镇压海底妖族，护佑大玄百姓安宁。
voice_profile: |
  青年男声，低沉有磁性，慵懒随性，语速中等偏慢。
  开场独白带有回忆的沧桑感，尾句略带讽刺。
emotion: "wistful"
duration_estimate: "15s"
model: "siliconflow.cosyvoice2"
---

## 配音内容

### 台词
二十年前，我亲手挖出自己的龙珠，立下这龙凤婚碑。
不为姻缘，只为镇压海底妖族，护佑大玄百姓安宁。
（微停顿，语气转为自嘲）
可如今，与我立下婚约的公主，已成女帝。
而她登基后第一件事，便是将我扔进熔炉炼丹，
还要亲手砸碎这碑，换她所谓自由。

### 情感标注
- 前两句：平静叙述，略带沧桑
- "可如今"：语气转冷，讽刺
- "熔炉炼丹 / 砸碎这碑"：轻微咬牙感
- "所谓自由"：轻蔑尾音上扬
```

---

## SiliconFlow CosyVoice2 配置

### API 配置 (`api_config.yaml`)

```yaml
siliconflow.cosyvoice2:
  provider: siliconflow
  type: audio
  model: FunAudioLLM/CosyVoice2-0.5B
  api_url: https://api.siliconflow.cn/v1/audio/speech
  docs_url: https://docs.siliconflow.cn/cn/api-reference/audio/cosyvoice2
  required_env:
    - SILICONFLOW_API_KEY
  defaults:
    voice: "cosyvoice2"
    response_format: "mp3"
    speed: 1.0
    volume: 1.0
    sample_rate: 24000
```

### TTS 参数调优

| 参数 | 范围 | 漫剧推荐 | 说明 |
|------|------|---------|------|
| `speed` | 0.5-2.0 | 0.9-1.1 | 漫剧对话偏自然语速 |
| `volume` | 0.1-2.0 | 1.0 | 后期统一调音量 |
| `voice` | 预设音色ID | 按角色定制 | 每个角色绑定固定音色 |

### 声线一致性方案

**核心原则**：同一角色在所有集数中使用相同的 TTS 音色参数。

```yaml
# 角色声线档案（建议在 project.md 中维护）
## 声线档案

| 角色 | 音色ID | 语速 | 情感标签 |
|------|--------|------|---------|
| 陆然 | cosyvoice2_male_low | 0.95 | 慵懒→威严 |
| 云璃 | cosyvoice2_female_mid | 1.0 | 冰冷→崩溃 |
| 玄微 | cosyvoice2_male_mid | 1.05 | 圆滑→阴冷 |
| 莫雨 | cosyvoice2_female_low | 1.1 | 清冷寡淡 |
```

**每次生成配音前**：检查 `voice_profile` 是否与角色声线档案一致。

---

## 配音生成工作流

### 编译

```bash
# 编译配音任务
opsv audio --model siliconflow.cosyvoice2 --category comic_voice
```

### 执行

```bash
opsv run opsv-queue/videospec_circle1/siliconflow.cosyvoice2_001/
```

### 审查

```bash
opsv review
# 审查配音文件 — 检查语速、情感表达、音质
```

---

## 多角色对话场景的音频编排

对于有多个角色对话的场景，创建独立的 `comic_voice` 文档：

```yaml
---
category: comic_voice
status: drafting
title: "EP01 场景 1-1 — 云璃与陆然对峙"
character_ref: "@scene_1_1_dialogue"
script_text: |
  [云璃] 拿下。
  [陆然] 云璃，我是你的未婚夫！为何要如此待我？
  [云璃] 父皇驾崩，朕已登基。今日，朕要除你这头恶龙，砸了这荒唐婚碑。
  [陆然] 此碑之下，镇的是海底万妖。碑碎，则妖出、水患滔天、民不聊生！
  [玄微] 一派胡言。
voice_profile: |
  多角色对话场景：
  - 云璃: 青年女声，清冷威严，语速中等偏慢。第一句"拿下"短促有力。
  - 陆然: 青年男声，低沉磁性，略带困惑和急切。"水患滔天"处加重语气。
  - 玄微: 中年男声，圆滑中带阴冷。"一派胡言"声调上扬，嘲讽。
emotion: "confrontation"
duration_estimate: "25s"
model: "siliconflow.cosyvoice2"
---
```

---

## Seedance 音画一体模式

对于需要口型同步的镜头，使用 Seedance 2.0 的 `generate_audio: true`：

```yaml
# comic_shot 文档中
generate_audio: true
prompt: >
  @yun_li_adult speaks — "拿下" (Take him).
  Her lips form the word clearly, chin lifting defiantly.
  Guards surge forward at her command.
  5 seconds.
```

**限制**：Seedance 音频的声线一致性不如专用 TTS。建议：
- **关键对话** → 专用 TTS（CosyVoice2） + 后期替换音频
- **环境音/氛围** → Seedance 自带音频

---

## 配音与分镜的绑定

在 `comic_storyboard` 中通过 `audio_ref` 字段关联配音：

```yaml
---
category: comic_storyboard
title: "EP01 Shot 1-3 — 云璃下令"
audio_ref: "@EP01_scene_1_1_dialogue"
---
```

编译时自动将配音文件作为 `reference_audio` 传入视频生成 API。

---

## 配音质量检查清单

Guardian-Agent 检查：

```
□ 每个有对白的 comic_storyboard 有对应的 comic_voice 文档
□ voice_profile 与角色声线档案一致
□ script_text 与剧本台词逐字匹配
□ emotion 标签与场景情绪一致
□ 多角色场景标注了每个角色的台词段落
□ duration_estimate 与实际语速匹配（约 3-4 字/秒 中文）
```

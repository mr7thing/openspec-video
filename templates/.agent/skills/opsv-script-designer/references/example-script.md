---
# 强制：所有的分镜数据必须定义在这个 YAML 数组中。正文区域大模型不会做结构化读取。
shots:
  - id: "shot_1"
    duration: 5
    camera: "Wide shot, pan down"
    environment: "@RainyBambooForest, heavy rain, mist"
    subject: "@TheWanderingSwordsman leaning against a bamboo tree"
    prompt_en: "wide shot of a wandering swordsman leaning against a bamboo tree in a dark rainy forest, camera panning down. cinematic lighting, 8k, photorealistic"
  - id: "shot_2"
    duration: 3
    camera: "Close-up"
    environment: "Heavy rain"
    subject: "Hand resting on the hilt of @RustyIronSword, water dripping from knuckles"
    prompt_en: "close-up of a hand resting on a rusty sword hilt, water dripping from knuckles, heavy rain in background. macro photography, high detail"
  - id: "shot_3"
    duration: 4
    camera: "Low angle shot"
    environment: "Looking up at bamboo treetops, dark sky"
    subject: "Silhouettes of @Assassins falling rapidly towards the camera"
    prompt_en: "low angle shot looking up at dark bamboo treetops against a stormy sky, silhouettes of assassins falling downwards. dynamic composition, dramatic lighting"
  - id: "shot_4"
    duration: 3
    camera: "Medium shot, extreme slow motion"
    environment: "Lightning flash illuminating the rain"
    subject: "@TheWanderingSwordsman drawing @RustyIronSword to block a blade"
    prompt_en: "medium shot, extreme slow motion. wandering swordsman drawing a rusty sword to parry an attack. lightning flash, rain streaks. high tension, cinematic action"
  - id: "shot_5"
    duration: 5
    camera: "Tracking shot, handheld, shaky"
    environment: "Running towards @AbandonedTemple"
    subject: "@TheWanderingSwordsman sprinting through rain, slashing two @Assassins"
    prompt_en: "tracking shot behind a swordsman sprinting through rain towards a ruined temple, slashing enemies. shaky cam effect, motion blur, intense action"
---

# 最终分镜脚本（人类阅读版）
由于完整的机器可读数据已在顶部 YAML 定义，以下正文专供人类导演阅读和评审。

## Act 1: 降临

### Shot 1 (5s)
宽广的全景镜头，交代 [@RainyBambooForest](../videospec/scenes/RainyBambooForest.md)。暴雨如注，形成一层灰色的水雾。摄像机缓缓向下摇摄，露出正倚靠在竹子上的 [@TheWanderingSwordsman](../videospec/elements/TheWanderingSwordsman.md)。

#### Design References
<!-- d-ref: 灵感图。指导本 Shot 的图片生成。 -->
<!-- [参考构图](references/shot_1_comp.png) -->

#### Approved References
<!-- a-ref: 最终定档图。作为本 Shot 生成视频的首帧。 -->
<!-- [定档预览图](artifacts/drafts_1/shot_1_draft_1.png) -->

### 🖼️ 视觉审阅廊 (备选区)
| 画面 1 | 画面 2 |
|:---:|:---:|
| (等待 opsv review 回写) | (等待 opsv review 回写) |

---

### Shot 2 (3s)
对 [@TheWanderingSwordsman](../videospec/elements/TheWanderingSwordsman.md) 的手部进行特写。雨水从他的指关节滴落，他搭在 [@RustyIronSword](../videospec/elements/RustyIronSword.md) 的剑柄上。

#### Design References
<!-- d-ref: 等等待提供 -->

#### Approved References
<!-- a-ref: 最终定档图 -->
<!-- [定档手部特写](artifacts/drafts_1/shot_2_draft_2.png) -->

---
*(其余 Shot 格式以此类推)*

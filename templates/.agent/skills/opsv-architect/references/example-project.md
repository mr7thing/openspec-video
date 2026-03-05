---
# <!-- 强制：填写目标画幅比例，例如 "16:9" 或 "21:9" -->
aspect_ratio: "21:9"

# <!-- 强制：填写此 MV 的全局底座模型，例如 "nano_banana_pro" 或留空 -->
engine: ""

# <!-- 强制：填写全局设定/愿景描述。在首个生图任务中注入给大模型作为全局把控参考 -->
vision: "我在创建一个写实电影感的MV，背景为中国古代风格，混合市井与仙味的艺术风格。"

# <!-- 强制：用于垫入每次生成的环境渲染光照修饰词，必须极度致密。包含时代背景、质感、光影、渲染器级别 -->
global_style_postfix: "high fantasy ancient chinese wuxia setting, dark and gritty aesthetic, worn textures, cinematic rim lighting, 8k resolution, ultra detailed masterpiece"
---

# Asset Manifest (资产通讯录)
<!-- 强制：后续所有使用 @ 的角色、场景、道具都必须在此挂号。这里是整个宇宙的点名册 -->

## Main Characters
- @TheWanderingSwordsman

## Extras
- @TavernCrowd

## Scenes
- @RainyBambooForest
- @AbandonedTemple

## Props
- @RustyIronSword
- @BrokenJadePendant

# 配音 Prompt 编写指南

> 适用阶段：S7 声音设计

---

## Prompt 结构

```
[音色描述], [语速], [语言/口音], [情感范围].

示例：
Deep calm male voice, moderate pace, standard Mandarin.
Carry a subtle warmth and confidence. Emotional range
from calm narration to intense confrontation.
Suitable for TTS: natural, not robotic.
```

## 音色调色板

| 类型 | 描述 | 适合角色 |
|------|------|---------|
| calm-deep | 沉稳低音 | 智者、长辈 |
| bright-young | 明亮年轻 | 少年、少女 |
| rough | 粗粝 | 硬汉、反派 |
| soft | 柔和 | 温柔角色 |
| authoritative | 权威 | 领导、旁白 |
| playful | 俏皮 | 喜剧角色 |

## 语速

| 语速 | 效果 |
|------|------|
| slow | 沉稳、庄严 |
| moderate | 中性、自然 |
| fast | 紧张、兴奋 |
| variable | 角色有节奏变化 |

## 情感范围

```yaml
emotion_range: ["calm", "firm", "slightly_warm", "intense", "sad", "angry"]
```

覆盖剧情中的情感变化，至少 3 种。

## 要与 S2 voice 字段一致

S2 定档的 `voice` 字段 → 本阶段扩展为完整 TTS prompt

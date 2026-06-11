# AI Video Prompt Engineering Guide

Model-specific prompt templates and best practices for Kling, Veo 3, Runway Gen-4, Sora, and Hailuo.

---

## Universal Six-Part Formula

All AI video prompts follow this structure. Order matters — place camera instructions early in the prompt.

```
SUBJECT: [main person/object + 1-2 defining traits]
ACTION: [single clear action beat + micro-gesture]
SCENE: [location + background detail + foreground props]
CAMERA: [shot size + angle + movement]
LIGHT: [time-of-day or light source + softness/hardness + mood]
STYLE: [visual style + tone + optional genre reference]
```

**Critical rules**:
- Keep to **one primary action** per prompt. Multiple actions confuse the model.
- Keep to **one primary camera movement** per prompt.
- Place CAMERA instructions in the **first half** of the prompt for better adherence.
- Use **specific nouns** instead of generic ones ("oak tree" not "tree", "leather jacket" not "jacket").

---

## Kling (快手/可灵)

### Format
Kling uses a structured three-part prompt:
```
[Scene]: [environment + subject placement + atmosphere]
[Style]: [visual style + color palette + aesthetic reference]
[Motion]: [camera movement + subject action + speed]
```

### Example
```
[Scene]: A woman in a brown leather jacket stands at a rain-streaked window in a 1950s diner, neon sign reflection on the glass
[Style]: Cinematic noir, desaturated colors, high contrast, film grain
[Motion]: Slow dolly in toward her face, raindrops streaking down window, subtle camera drift
```

### Special Features
- **Storyboard Mode**: For multi-beat sequences within one generation
- **Subject Reference**: Upload 1-3 reference images for character consistency
- **Camera Control**: Supports explicit camera movement keywords well
- **Duration**: 5-15 seconds per generation
- **Motion Brush**: For region-specific motion control (Pro mode)

### Tips
- Kling responds well to **technical cinematography terms** (dolly, tracking, rack focus)
- Use **negative prompts** to exclude unwanted elements: append to prompt or use dedicated field
- For character consistency: upload reference images in **subject_reference** metadata field

---

## Veo 3 (Google)

### Format
Veo 3 accepts natural language prompts with strong adherence to detailed descriptions.

### Six-Part Template
```
SUBJECT: Anna, early 30s woman with dark wavy hair, wearing brown leather jacket
ACTION: Slowly turning her head to look out the rain-streaked window
SCENE: 1950s diner interior, red vinyl booth, neon sign visible through window, checkerboard floor
CAMERA: Medium close-up, eye-level, slow dolly in
LIGHT: Night, warm tungsten interior mixed with cool blue neon from sign outside
STYLE: Cinematic noir, desaturated, film grain, anamorphic lens look
```

### Special Features
- **Native audio generation**: Can include sound effects and ambient audio in generation
- **Reference images**: Supports image conditioning for I2V
- **Duration**: 5-8 seconds (standard), up to 8s with Veo 3 Fast
- **Aspect ratios**: 16:9, 9:16, 1:1

### JSON Format
Veo 3 also accepts structured JSON prompts:
```json
{
  "time": "00:00-00:05",
  "shotType": "medium close-up",
  "cameraMovement": "slow dolly in",
  "sceneDescription": "Woman in leather jacket at diner window, neon reflections",
  "dialogueOrSound": "Rain against window, distant thunder",
  "notes": "Cinematic noir style, desaturated"
}
```

---

## Runway Gen-4

### Format
Runway uses natural language with strong support for camera controls and motion parameters.

### Template
```
[A woman in a brown leather jacket sits alone in a 1950s diner booth], [camera slowly dollies in], [rain streaks the window behind her], [warm interior light mixed with cool neon], [cinematic noir style, film grain]
```

### Special Features
- **Motion controls**: Precise camera movement specification
- **Character references**: Can lock character identity across generations
- **Video-to-video**: Strong V2V capabilities for style transfer and modification
- **Duration**: 5-10 seconds
- **General World Model**: Better physical simulation and object permanence

### Tips
- Use **square brackets** to separate distinct elements for clearer parsing
- Runway excels at **style transfer** — reference a specific film or director
- For multi-shot consistency: use the same character reference images across generations

---

## Sora (OpenAI)

### Format
Sora accepts natural language prompts with strong world-model understanding.

### Template
```
Cinematic shot of a woman in her early 30s with olive skin and dark wavy hair, wearing a worn brown leather jacket, sitting in a 1950s-style diner booth. She gazes out a rain-streaked window where neon light reflects. Camera slowly pushes in. Warm tungsten interior lighting mixed with cool blue neon glow. Film noir aesthetic, desaturated, subtle film grain. Anamorphic lens characteristics.
```

### Special Features
- **Storyboard mode**: Multi-shot generation with consistent characters
- **Character system**: Define reusable characters within a project
- **Remix/Recut/Loop/Blend**: Post-generation editing tools
- **Duration**: Up to 20 seconds in storyboard mode
- **Highest quality**: Generally considered best-in-class for coherence

### Tips
- Sora understands **directorial language** very well — use film terminology freely
- For consistency: use Sora's built-in **Character** feature to lock identities
- Storyboard mode allows defining multiple shots in sequence with temporal coherence

---

## Hailuo / MiniMax (海螺)

### Format
Hailuo supports both text-to-video and image-to-video with strong prompt adherence.

### Template
```
A woman in a brown leather jacket sits alone in a vintage diner at night. Rain streaks the window. Neon sign glows outside. She looks contemplative. Camera slowly pushes in. Warm interior lighting, cool neon reflections. Cinematic, photorealistic, film noir style.
```

### Special Features
- **Image-to-video excellence**: Strong I2V with motion control
- **Subject Reference**: Support for character reference images
- **Duration**: 6 or 10 seconds
- **Resolutions**: 768p, 1080p

### API Parameters
```json
{
  "model": "MiniMax-Hailuo-2.3",
  "prompt": "Cinematic shot of woman in leather jacket at diner window...",
  "size": "1080P",
  "duration": 6,
  "metadata": {
    "subject_reference": [
      {
        "type": "character",
        "image": ["https://..."]
      }
    ]
  }
}
```

---

## Image-to-Video (I2V) Prompt Differences

When starting from a reference image (character sheet or previous frame), the prompt structure changes:

### I2V Formula
```
SUBJECT: [what in the image should stay primary]
ACTION: [primary motion on subject]
BACKGROUND: [what's behind the subject]
BACKGROUND MOVEMENT: [wind, people, traffic, parallax]
CAMERA: [movement only]
```

**Do NOT re-describe** the subject's appearance in I2V prompts — the image anchors that. Focus on **motion**.

### Multi-Action Patterns (for longer clips)

For clips needing multiple beats, use these patterns:
- `Subject + Action 1 + then + Action 2`
- `Subject 1 + Action 1 + while + Subject 2 + Action 2`

Example: `Anna picks up the coffee cup, then slowly brings it to her lips while looking out the window`

---

## Negative Prompts by Model

| Model | Negative Prompt Support | Recommended Negative Prompt |
|-------|------------------------|---------------------------|
| Kling | Dedicated field | `blurry, distorted face, extra limbs, deformed hands, watermark, text` |
| Veo 3 | Limited | Include exclusions in main prompt: `"without any text or watermarks"` |
| Runway | Dedicated field | `blurry, low quality, distorted anatomy, watermark` |
| Sora | Limited | Include in prompt: `"no text, no watermarks, clean image"` |
| Hailuo | Via metadata | `deformed, blurry, bad anatomy, extra limbs` |

---

## Duration & Format Quick Reference

| Model | Max Duration | Resolutions | Aspect Ratios | Best For |
|-------|-------------|-------------|--------------|----------|
| Kling 3.0 | 15s | 720p, 1080p | 16:9, 9:16, 1:1 | Longer clips, complex scenes |
| Veo 3 | 8s | 720p, 1080p | 16:9, 9:16, 1:1 | Audio integration, realism |
| Runway Gen-4 | 10s | 720p, 1080p | 16:9, 9:16, 1:1, 4:3 | Style control, V2V |
| Sora | 20s | Up to 1080p | 16:9, 9:16, 1:1 | Coherence, storyboard mode |
| Hailuo 2.3 | 10s | 768p, 1080p | 16:9, 9:16, 1:1 | I2V, prompt adherence |

---

## Common Prompt Failures & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Motion looks frozen | Action is too abstract | Use a single, visible verb: "pour", "turn", "step" |
| Wrong framing | Shot type not specified | Start prompt with shot type: "Medium shot of..." |
| Camera ignored | Movement described vaguely | Use standard terms: "dolly in", "pan left" |
| Lighting flat | No light source specified | Add: "morning window light", "backlight", "spotlight" |
| Generic look | Description too broad | Add 1-2 specific modifiers: "weathered leather", "flickering neon" |
| Inconsistent character | Subject block varies | Copy-paste identical character description |

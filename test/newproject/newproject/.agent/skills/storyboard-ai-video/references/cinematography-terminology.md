# Cinematography Terminology for AI Video Generation

Complete reference of shot types, camera angles, movements, composition rules, and transition types with AI prompt keywords.

---

## Shot Types (景别)

Shot type is the single most powerful framing decision. Name it explicitly in prompts.

| Abbrev | Name | Framing | Subject Fill | AI Prompt Keyword | Use For |
|--------|------|---------|-------------|-------------------|---------|
| EWS | Extreme Wide Shot | Subject tiny in vast environment | 1-5% | "extreme wide shot, establishing" | Geography, isolation, epic scale |
| WS | Wide Shot | Full body + significant environment | 15-30% | "wide shot, full body visible" | Action, spatial relationships |
| MWS | Medium Wide Shot | Knees up | 30-50% | "medium wide shot, knees up" | Two-shots, cowboy framing |
| MS | Medium Shot | Waist up | 50-70% | "medium shot, waist up" | Dialogue default, balance |
| MCU | Medium Close-Up | Chest up | 60-75% | "medium close-up, chest up" | Interviews, expressions |
| CU | Close-Up | Head and shoulders | 70-85% | "close-up, head and shoulders" | Emotion, reactions |
| ECU | Extreme Close-Up | Single detail | 85-100% | "extreme close-up, [detail] only" | Intensity, key detail |
| OTS | Over-the-Shoulder | Foreground shoulder, background subject | varies | "over the shoulder shot" | Dialogue coverage |
| POV | Point of View | Character's eye perspective | varies | "POV shot, through character's eyes" | Subjective experience |
| INSERT | Insert Shot | Object/detail close-up | varies | "insert shot, close-up of [object]" | Props, documents |
| 2S | Two-Shot | Two subjects in frame | varies | "two shot, both subjects" | Relationship dynamics |

**Pro tip**: If the AI gives the wrong framing, naming the shot type explicitly fixes it faster than describing with adjectives.

---

## Camera Angles (机位角度)

| Angle | AI Prompt Keyword | Emotional Effect |
|-------|-------------------|-----------------|
| Eye Level | "eye-level shot" | Neutral, natural, equal |
| Low Angle | "low angle looking up" | Power, threat, heroism |
| High Angle | "high angle looking down" | Vulnerability, weakness |
| Dutch Angle | "dutch angle, tilted horizon" | Unease, disorientation |
| Bird's Eye View | "bird's eye view, top-down" | God-like, detached, overview |
| Worm's Eye View | "worm's eye view, looking straight up" | Oppression, grandeur |
| Overhead | "overhead shot, directly above" | Pattern, flatness, fate |

---

## Camera Movements (运镜)

**Rule: One primary movement per shot.** Compound movements confuse AI models.

| Movement | Direction | AI Prompt Keyword | Best For |
|----------|-----------|-------------------|----------|
| Static | None | "static camera, locked off" | Dialogue, stillness, tension |
| Pan | Horizontal | "slow pan left/right" | Environment reveal, following |
| Tilt | Vertical | "tilt up/down" | Scale reveal, height emphasis |
| Dolly In | Forward | "slow dolly in" | Emotional focus, revelation |
| Dolly Out | Backward | "dolly out" | Context expansion, isolation |
| Track | Follow subject | "tracking shot following" | Action, immersion |
| Crane | Vertical arc | "crane shot rising" | Epic reveals, openings |
| Zoom In | Magnify | "slow zoom in" | Detail emphasis |
| Zoom Out | Demagnify | "zoom out" | Context reveal |
| Handheld | Unstable | "handheld, slight shake" | Realism, documentary, chaos |
| Steadicam | Smooth float | "smooth steadicam movement" | Dreamlike, fluid action |
| Whip Pan | Fast horizontal | "whip pan" | Energy, transition, chaos |

**Pacing modifiers** (add before movement):
- "slow" / "gentle" / "smooth" — calmer
- "quick" / "snap" — energetic
- "cinematic" — professional feel

---

## Composition Rules (构图法则)

### Rule of Thirds
Divide frame into 3x3 grid. Place subjects at intersections or along lines.
- Prompt: "rule of thirds composition, subject at left third intersection"
- Use for: balanced, natural-looking shots

### Center Framing
Place subject dead center.
- Prompt: "center framing, symmetrical"
- Use for: symmetry, Kubrick/Anderson style, tension

### Leading Lines
Use natural lines to guide eye toward subject.
- Prompt: "leading lines directing to subject"
- Use for: depth, direction

### Negative Space
Large empty area around subject.
- Prompt: "abundant negative space, subject small in frame"
- Use for: isolation, contemplation, minimalism

### Frame Within Frame
Use doorways, windows, arches to frame subject.
- Prompt: "frame within frame, subject framed by [archway/window]"
- Use for: depth, confinement, voyeurism

---

## Depth of Field (景深)

| Type | Prompt Keyword | Effect |
|------|---------------|--------|
| Shallow DOF | "shallow depth of field, blurred background" | Isolate subject, cinematic |
| Deep DOF | "deep focus, everything sharp" | Show environment details |
| Rack Focus | "rack focus from foreground to background" | Shift attention |
| Bokeh | "bokeh background, out-of-focus lights" | Aesthetic, dreamy |

---

## Lighting Keywords (灯光)

### Time of Day
| Time | Prompt Keyword |
|------|---------------|
| Golden Hour | "golden hour, warm sunset light" |
| Blue Hour | "blue hour, twilight" |
| Midday | "harsh midday sun" |
| Overcast | "soft overcast daylight" |
| Night | "night, artificial lighting" |

### Light Quality
| Quality | Prompt Keyword |
|---------|---------------|
| Soft | "soft diffused light" |
| Hard | "hard direct light, sharp shadows" |
| Side | "dramatic side-lighting" |
| Backlight | "backlit, silhouette" |
| Rim | "rim lighting, edge glow" |
| Top | "overhead lighting" |
| Under | "under-lighting, horror lighting" |

### Mood Lighting
| Mood | Prompt Keyword |
|------|---------------|
| Noir | "film noir lighting, high contrast" |
| Romantic | "warm candlelight glow" |
| Sinister | "cold blue-green light, unsettling" |
| Hopeful | "warm sunlight breaking through" |
| Clinical | "sterile fluorescent lighting" |

---

## Transitions (转场)

| Transition | Prompt / Description | Use For |
|-----------|---------------------|---------|
| Cut | Default, no prompt needed | Standard narrative |
| Dissolve | "cross dissolve transition" | Time passage, memory |
| Fade In | "fade in from black" | Opening, new chapter |
| Fade Out | "fade out to black" | Ending, pause |
| Wipe | "wipe transition [direction]" | Location change, energy |
| Whip Pan | Fast blur between scenes | Momentum, chaos |
| Match Cut | Match visual element across cuts | Metaphor, connection |
| Jump Cut | Time compression within same angle | Urgency, documentary |
| J-Cut | Next audio starts before video cut | Audio bridge, anticipation |
| L-Cut | Previous audio continues after video cut | Smooth audio transition |

---

## Aspect Ratio Keywords

| Ratio | Use Case | Prompt Note |
|-------|---------|------------|
| 16:9 | Cinematic, YouTube | Default cinematic |
| 9:16 | TikTok, Reels, Shorts | "vertical video format" |
| 1:1 | Instagram, social | "square format" |
| 4:3 | Retro, vintage | "4:3 aspect ratio, vintage feel" |
| 2.39:1 | Anamorphic cinematic | "anamorphic widescreen, letterboxed" |

---

## Style & Genre Keywords

| Style | Prompt Keywords |
|-------|----------------|
| Cinematic | "cinematic, film grain, anamorphic lens" |
| Photorealistic | "photorealistic, 8K, highly detailed" |
| Documentary | "documentary style, natural lighting, handheld" |
| Anime | "anime style, cel-shaded, vibrant colors" |
| Noir | "film noir, high contrast black and white, shadows" |
| Sci-Fi | "sci-fi, neon lights, futuristic, cyberpunk" |
| Period | "period drama, [decade] aesthetic, vintage color grading" |
| Horror | "horror, low-key lighting, unsettling atmosphere" |
| Commercial | "clean, bright, product photography style" |
| Music Video | "stylized, vibrant, dynamic camera movement" |

---

## 180-Degree Rule & Continuity

When two characters interact, imagine a line between them. Keep the camera on one side of this line for all shots in the scene.

**In the shot list**: Add a `camera_side` field with values "left_of_axis" or "right_of_axis" to track this.

**Resetting the axis**: Show a character moving across the line in a continuous shot, or use a neutral shot (straight-on or overhead) as a bridge.

**Eyeline match**: When character A looks off-screen right, character B must look off-screen left in their shot. Document `eyeline_direction` per shot.

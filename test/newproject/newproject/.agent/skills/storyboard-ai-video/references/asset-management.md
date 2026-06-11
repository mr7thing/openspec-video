# Asset Management & Consistency Strategies

How to define, register, and maintain consistent characters, props, and locations across AI-generated video shots.

---

## Asset Registry Overview

The Asset Registry is a structured database of all reusable visual elements in the production. It is created in Stage 3 (before any shot design) and referenced throughout.

```
Asset Registry
├── Characters (角色资产)
│   ├── character_id, name, physical_description, wardrobe
│   ├── distinctive_features, reference_images, visual_notes
│   └── arc_notes (appearance changes through story)
├── Props (道具资产)
│   ├── prop_id, name, description, first_appearance
│   └── key_scenes, state_changes
└── Locations (场景资产)
    ├── location_id, name, description, lighting
    ├── time_variants, reference_images
    └── ambient_sound_notes
```

---

## Character Assets

### Character Sheet Template

```json
{
  "character_id": "char_{lowercase_name}",
  "name": "Display Name",
  "role": "protagonist | antagonist | supporting | extra",
  "physical_description": "Age, build, skin tone, hair (color/length/style), face shape, eyes",
  "wardrobe": "Clothing description including colors, materials, condition",
  "distinctive_features": "Unique identifiers: scars, tattoos, jewelry, glasses, hairstyle quirks",
  "reference_images": [
    "{url}_front.png",
    "{url}_three_quarter.png",
    "{url}_side.png",
    "{url}_full_body.png"
  ],
  "visual_notes": "Preferred lighting for refs, expression notes, angles to avoid",
  "arc_notes": "How appearance changes: dishevelment, injury, costume changes"
}
```

### Subject Block Pattern

The `physical_description` + `wardrobe` + `distinctive_features` concatenated text becomes the **Subject Block** — a locked text string inserted identically into every AI prompt where this character appears.

**Example Subject Block**:
```
Anna, early 30s, olive skin, dark wavy hair just past shoulder, sharp jawline, wearing worn brown leather jacket over white t-shirt, small scar above left eyebrow, silver ring on right hand
```

**Rules for Subject Blocks**:
- Keep under **60 words** for model comprehension
- Use **identical wording** in every shot — never paraphrase
- Place at the **start** of the SUBJECT field in prompts
- Order: Name → Physical → Wardrobe → Features (always same order)

### Character State Tracking

Characters may change appearance during the story. Track states explicitly:

| State | Trigger Scene | Subject Block Change |
|-------|--------------|---------------------|
| Default | S01 | Standard description |
| Disheveled | S03 (after fight) | Add: "hair messy, jacket torn at shoulder" |
| Injured | S05 | Add: "bandage on forehead, slight limp" |
| Changed Outfit | S07 | Replace wardrobe line: "now wearing black coat" |

In the shot list, add a `character_state` field per shot referencing which state variant to use.

### Reference Image Guidelines

For best consistency across AI video models, generate **4-5 reference images** per character:

1. **Front-facing portrait** — neutral expression, even lighting
2. **3/4 view** — showing face angle and body turn
3. **Side profile** — for shot/reverse-shot matching
4. **Full body** — showing complete wardrobe and proportions
5. **Expression variant** — key emotion character shows (optional)

**Image requirements**:
- Neutral background (gray/white preferred)
- Even, soft lighting (no dramatic shadows)
- High resolution (1024px minimum)
- Consistent art style across all character refs

---

## Prop Assets

### Prop Registry Entry

```json
{
  "prop_id": "prop_{descriptive_name}",
  "name": "Display Name",
  "description": "Detailed visual description: material, color, size, condition",
  "first_appearance": "S##-##",
  "key_scenes": ["S01-02", "S03-05"],
  "visual_notes": "How it should appear in close-ups, reflective properties",
  "state_changes": [
    {"scene": "S01-02", "state": "full, steaming"},
    {"scene": "S01-05", "state": "half-empty, cold"},
    {"scene": "S03-01", "state": "shattered on floor"}
  ]
}
```

### Prop Consistency Rules
- Props appearing in multiple shots must be described identically
- Track **state changes** explicitly (full → empty → broken)
- For hero props (important story items), generate reference images
- Include prop in the SCENE portion of AI prompts, not SUBJECT

---

## Location Assets

### Location Registry Entry

```json
{
  "location_id": "loc_{descriptive_name}",
  "name": "Display Name",
  "description": "Complete visual description: architecture, colors, key features",
  "lighting": "Default lighting setup for this location",
  "time_variants": [
    {"variant_id": "day_busy", "description": "Afternoon, crowded, sunlight through windows"},
    {"variant_id": "night_empty", "description": "Late night, empty, neon glow, streetlight"},
    {"variant_id": "pre_dawn", "description": "Blue hour, quiet, just before opening"}
  ],
  "reference_images": ["{url}_day.jpg", "{url}_night.jpg"],
  "ambient_sound": "Diner ambience: distant traffic, refrigerator hum, faint radio"
}
```

### Location Consistency Rules
- All shots sharing a `location_id` should reference the same description
- Use `time_variant` to handle different lighting conditions
- Describe spatial layout consistently (door position, window placement, furniture)
- Include location in the SCENE field of AI prompts

---

## Consistency Strategies

### Strategy 1: Asset-First (Recommended)

Generate all character reference images and location reference images **before** creating any shot.

**Workflow**:
1. Parse script → extract all characters, props, locations
2. Generate character sheets (4-5 images each)
3. Generate location reference images
4. Build Asset Registry with image URLs
5. Design shots referencing registry assets
6. Generate AI video with asset references

**Pros**: Highest consistency, controlled visuals
**Cons**: Requires image generation step upfront

### Strategy 2: Temporal Bridge

Use the **last frame** of shot N as the **starting condition** for shot N+1.

**Workflow**:
1. Generate shot 1 (with character refs)
2. Extract final frame of shot 1
3. Use as I2V input for shot 2 (with motion prompt)
4. Repeat for all subsequent shots

**Pros**: Natural temporal continuity
**Cons**: Errors compound; one bad shot corrupts the chain

### Strategy 3: Prompt Template Locking

Use identical Subject Blocks and location descriptions across all prompts.

**Workflow**:
1. Define Subject Block template for each character
2. Define location description template for each setting
3. Copy-paste identical blocks into every shot's prompt
4. Only change ACTION and CAMERA between shots

**Pros**: Simple, no image dependencies
**Cons**: Lower consistency than image-based methods

### Strategy 4: Composite Pipeline

Generate characters and backgrounds separately, then composite.

**Workflow**:
1. Generate character animation with green screen
2. Generate background plates separately
3. Composite in video editor
4. Add lighting/color matching

**Pros**: Highest control, multi-character scenes
**Cons**: Most complex, requires post-production

---

## Continuity Checklist

Before approving a shot list for generation, verify:

### Character Continuity
- [ ] Every character has a complete character sheet
- [ ] Subject Block text is identical across all shots
- [ ] Character states (wardrobe changes, injuries) are tracked
- [ ] Reference images exist for all main characters
- [ ] Character entry/exit matches script logic

### Prop Continuity
- [ ] All recurring props are registered with prop_id
- [ ] Prop state changes are documented and logical
- [ ] Props appear/disappear at correct script moments
- [ ] Hero props have reference images

### Location Continuity
- [ ] All locations are registered with location_id
- [ ] Time-of-day variants are defined where needed
- [ ] Spatial layout is consistent (doors, windows, furniture)
- [ ] Lighting descriptions match time-of-day

### Shot Continuity
- [ ] 180-degree rule is respected within each scene
- [ ] Eyeline directions match between reverse shots
- [ ] Temporal bridge connections are marked (`connect_to_next`)
- [ ] Transition types are appropriate for narrative pacing

---

## Vector Memory for Long-Form Consistency

For productions with many scenes, use a vector database (like Chroma) to store and retrieve asset information:

```python
# Pseudocode for vector memory retrieval
def get_character_context(character_id, current_scene):
    # Retrieve character's visual description
    char_doc = chroma.collection("characters").get(character_id)
    
    # Retrieve last known state
    last_state = chroma.collection("character_states").query(
        where={"character_id": character_id, "scene": {"$lte": current_scene}},
        order_by="scene",
        limit=1
    )
    
    return char_doc + last_state
```

This enables automatic consistency maintenance across long narratives without manual tracking.

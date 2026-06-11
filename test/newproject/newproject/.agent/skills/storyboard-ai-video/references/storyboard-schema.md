# Storyboard JSON Schema & Templates

Complete JSON Schema and example templates for the AI video shot list output.

---

## Full JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AI_Video_Storyboard",
  "type": "object",
  "required": ["project", "characters", "locations", "scenes"],
  "properties": {
    "project": {
      "type": "object",
      "required": ["title", "aspect_ratio"],
      "properties": {
        "title": { "type": "string", "description": "Project title" },
        "genre": { "type": "string", "description": "Genre tag" },
        "style": { "type": "string", "description": "Visual style description" },
        "target_duration": { "type": "number", "description": "Total target duration in seconds" },
        "aspect_ratio": { 
          "type": "string", 
          "enum": ["16:9", "9:16", "1:1", "4:3", "2.39:1"],
          "description": "Output aspect ratio"
        },
        "target_model": {
          "type": "string",
          "enum": ["veo-3", "kling-3", "runway-gen4", "sora", "hailuo", "luma-ray", "pika"],
          "description": "Primary AI video model"
        },
        "frame_rate": { "type": "integer", "default": 24, "description": "Target frame rate" }
      }
    },
    "characters": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["character_id", "name", "physical_description"],
        "properties": {
          "character_id": { "type": "string", "pattern": "^char_[a-z0-9_]+$" },
          "name": { "type": "string" },
          "role": { "type": "string", "enum": ["protagonist", "antagonist", "supporting", "extra"] },
          "physical_description": { "type": "string", "maxLength": 200 },
          "wardrobe": { "type": "string" },
          "distinctive_features": { "type": "string" },
          "reference_images": { 
            "type": "array", 
            "items": { "type": "string", "format": "uri" },
            "description": "URLs to character reference images (front, 3/4, side, full body)"
          },
          "visual_notes": { "type": "string" },
          "arc_notes": { "type": "string", "description": "How appearance changes through the story" }
        }
      }
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["location_id", "name", "description"],
        "properties": {
          "location_id": { "type": "string", "pattern": "^loc_[a-z0-9_]+$" },
          "name": { "type": "string" },
          "description": { "type": "string", "maxLength": 300 },
          "lighting": { "type": "string" },
          "time_variants": { 
            "type": "array", 
            "items": { "type": "string" },
            "description": "Named variants for different times of day"
          },
          "reference_images": { 
            "type": "array", 
            "items": { "type": "string", "format": "uri" } 
          }
        }
      }
    },
    "props": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["prop_id", "name", "description"],
        "properties": {
          "prop_id": { "type": "string", "pattern": "^prop_[a-z0-9_]+$" },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "first_appearance": { "type": "string", "description": "Scene ID where prop first appears" },
          "key_scenes": { "type": "array", "items": { "type": "string" } },
          "visual_notes": { "type": "string" }
        }
      }
    },
    "scenes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["scene_id", "scene_number", "location_id", "shots"],
        "properties": {
          "scene_id": { "type": "string", "pattern": "^S[0-9]{2}$" },
          "scene_number": { "type": "integer" },
          "location_id": { "type": "string" },
          "time_of_day": { 
            "type": "string", 
            "enum": ["DAWN", "MORNING", "DAY", "AFTERNOON", "DUSK", "NIGHT", "LATE_NIGHT"] 
          },
          "mood": { "type": "string" },
          "characters_present": { "type": "array", "items": { "type": "string" } },
          "key_props": { "type": "array", "items": { "type": "string" } },
          "scene_summary": { "type": "string", "maxLength": 200 },
          "shots": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["shot_id", "shot_number", "shot_type", "duration", "visual_description"],
              "properties": {
                "shot_id": { "type": "string", "pattern": "^S[0-9]{2}-[0-9]{2}$" },
                "shot_number": { "type": "integer" },
                "shot_type": { 
                  "type": "string", 
                  "enum": ["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "INSERT", "2S"] 
                },
                "camera_angle": { "type": "string" },
                "camera_movement": { "type": "string" },
                "duration": { "type": "number", "minimum": 1, "maximum": 20 },
                "visual_description": { "type": "string", "maxLength": 500 },
                "subject_block": { "type": "string", "description": "Character description block for consistency" },
                "action": { "type": "string", "description": "Primary action in this shot" },
                "scene_context": { "type": "string" },
                "lighting": { "type": "string" },
                "style": { "type": "string" },
                "dialogue": { "type": "string", "description": "Exact dialogue line spoken in this shot (null if no dialogue)" },
                "dialogue_speaker": { "type": "string", "description": "Character_id of the speaker (null if no dialogue)" },
                "dialogue_type": { "type": "string", "enum": ["onscreen", "VO", "OS"], "description": "Type of dialogue delivery" },
                "negative_prompt": { "type": "string" },
                "reference_images": { "type": "array", "items": { "type": "string", "format": "uri" } },
                "transition_to_next": { "type": "string" },
                "connect_to_next": { "type": "boolean", "description": "Whether this shot's last frame feeds into next shot" },
                "camera_side": { "type": "string", "enum": ["left_of_axis", "right_of_axis", "neutral", "NA"] },
                "eyeline_direction": { "type": "string", "enum": ["screen_left", "screen_right", "screen_up", "screen_down", "at_camera", "NA"] },
                "ai_prompt": { "type": "string", "description": "Final assembled prompt for AI video model" },
                "audio_notes": { "type": "string", "description": "Sound effects, dialogue, music cues" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Minimal Example

```json
{
  "project": {
    "title": "Midnight Diner",
    "genre": "noir",
    "style": "cinematic noir, low-key lighting",
    "target_duration": 30,
    "aspect_ratio": "16:9",
    "target_model": "kling-3"
  },
  "characters": [
    {
      "character_id": "char_anna",
      "name": "Anna",
      "physical_description": "Early 30s, olive skin, dark wavy hair past shoulder, sharp jawline",
      "wardrobe": "Worn brown leather jacket over white t-shirt",
      "distinctive_features": "Small scar above left eyebrow, silver ring on right hand"
    }
  ],
  "locations": [
    {
      "location_id": "loc_diner",
      "name": "Midnight Diner",
      "description": "1950s-style all-night diner, red vinyl booths, neon sign, checkerboard floor",
      "lighting": "Warm tungsten overhead, cool blue neon glow"
    }
  ],
  "scenes": [
    {
      "scene_id": "S01",
      "scene_number": 1,
      "location_id": "loc_diner",
      "time_of_day": "NIGHT",
      "mood": "tense, melancholic",
      "characters_present": ["char_anna"],
      "shots": [
        {
          "shot_id": "S01-01",
          "shot_number": 1,
          "shot_type": "EWS",
          "camera_angle": "eye-level",
          "camera_movement": "static",
          "duration": 4,
          "visual_description": "Empty diner interior at night",
          "ai_prompt": "Extreme wide shot, empty 1950s diner at night, red vinyl booths, neon sign glowing, rain on windows, cinematic",
          "transition_to_next": "cut"
        }
      ]
    }
  ]
}
```

---

## Markdown Table Template

For human-readable output, use this table format:

```markdown
| Shot ID | Scene | Type | Angle | Move | Dur | Visual Description | AI Prompt | Trans |
|---------|-------|------|-------|------|-----|-------------------|-----------|-------|
| S01-01 | S01 | EWS | Eye | Static | 4s | Empty diner, neon glow | Extreme wide shot... | Cut |
```

Column widths: Shot ID (8), Scene (5), Type (4), Angle (8), Move (8), Dur (3), Visual Desc (30), AI Prompt (40), Trans (5).

---

## Validation Checklist

Before finalizing a shot list, verify:

- [ ] Every `shot_id` is unique and follows `S##-##` pattern
- [ ] Every `scene_id` is referenced in shot `scene` fields
- [ ] Every `character_id` in `characters_present` exists in the `characters` array
- [ ] Every `location_id` in scenes exists in the `locations` array
- [ ] Total duration of all shots equals `project.target_duration` (within 10%)
- [ ] Each character's `subject_block` text is identical across all their shots
- [ ] `connect_to_next` logic is consistent (temporal bridge continuity)
- [ ] `camera_side` respects the 180-degree rule within each scene
- [ ] Every shot has a non-empty `ai_prompt` field
- [ ] `negative_prompt` is provided for every shot

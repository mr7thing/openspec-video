# OpsV Configuration Guide

> Dual Configuration System: Secrets for security, Parameters for generation. All behaviors are driven by configuration.

---

## 1. Configuration Architecture Overview

```
project/
└── .env/                       # Environment config directory (Git-ignored)
    ├── secrets.env             # API Keys (Top Secret)
    └── api_config.yaml         # Engine Parameters (Sharable)
```

| File | Content | Git Tracked | Update Frequency |
|------|---------|-------------|------------------|
| `secrets.env` | API Keys & sensitive info | ❌ Ignored | Rare (Initial setup) |
| `api_config.yaml` | Model params, defaults, capabilities | ❌ Ignored | Occasional (Switching models) |

---

## 2. API Keys Configuration (`secrets.env`)

### Format

```env
# Volcengine API Key (SeaDream Image + Seedance Video)
VOLCENGINE_API_KEY=your_volcengine_key_here

# SiliconFlow API Key (Qwen Image + Wan Video)
SILICONFLOW_API_KEY=your_siliconflow_key_here

# MiniMax API Key (MiniMax Image + Hailuo Video)
MINIMAX_API_KEY=your_minimax_key_here
```

### Loading Priority

1. (Highest) → `.env/secrets.env`
2. (Standard) → `.env` file
3. (Lowest) → System environment variables

### Verification

```bash
opsv gen-image --dry-run
```

---

## 3. Engine Parameters (`api_config.yaml`)

### Complete Template (v0.5.19)

```yaml
# OpsV 0.5.x Multi-Modal Engine Dispatch Configuration
# Dispatcher maps parameters and executes Graceful Degradation before requests

models:

  # ── Image Models ──────────────────────────────

  seadream-5.0-lite:
    provider: "seadream"
    type: "image"
    enable: true
    model: "doubao-seedream-5-0-260128"
    gen_command: "gen-image"
    required_env: ["VOLCENGINE_API_KEY"]
    features: ["txt2img", "img2img", "negative_prompt", "aspect_ratio"]
    defaults:
      quality: "2K"
      aspect_ratio: "16:9"
      max_images: 1

  qwen-image:
    provider: "siliconflow"
    type: "image"
    enable: true
    model: "Qwen/Qwen-Image"
    gen_command: "gen-image"
    required_env: ["SILICONFLOW_API_KEY"]
    features: ["txt2img", "aspect_ratio"]

  qwen-image-edit-2509:
    provider: "siliconflow"
    type: "image"
    enable: true
    model: "Qwen/Qwen-Image-Edit-2509"
    gen_command: "gen-image"
    required_env: ["SILICONFLOW_API_KEY"]
    features: ["img2img", "edit"]
    requires_reference: true

  minimax-image-01:
    provider: "minimax"
    type: "image"
    enable: false
    model: "image-01"
    gen_command: "gen-image"
    required_env: ["MINIMAX_API_KEY"]

  # ── Video Models ──────────────────────────────

  seedance-1.5-pro:
    provider: "seedance"
    type: "video"
    enable: true
    model: "doubao-seedance-1-5-pro"
    gen_command: "gen-video"
    required_env: ["VOLCENGINE_API_KEY"]
    supports_first_image: true
    supports_last_image: true
    supports_reference_images: true
    max_reference_images: 9

  seedance-2.0-fast:
    provider: "seedance"
    type: "video"
    enable: true
    model: "doubao-video-v2-fast"
    gen_command: "gen-video"
    required_env: ["VOLCENGINE_API_KEY"]
    supports_first_image: true
    supports_last_image: true
    max_reference_images: 10
    supports_audio: true
    supports_video_ref: true

  wan2.2-i2v:
    provider: "siliconflow"
    type: "video"
    enable: false
    model: "wan-ai/Wan2.1-T2V-14B"
    gen_command: "gen-video"
    required_env: ["SILICONFLOW_API_KEY"]
    supports_first_image: true
    max_reference_images: 0

  minimax-video-01:
    provider: "minimax"
    type: "video"
    enable: false
    model: "MiniMax-Hailuo-2.3"
    gen_command: "gen-video"
    required_env: ["MINIMAX_API_KEY"]
    supports_first_image: true
    supports_last_image: true
    max_reference_images: 1
```

---

## 4. Capability Matrix

### Image Models

| Feature | SeaDream 5.0 | Qwen Image | Qwen Edit | MiniMax Image |
|---------|:---:|:---:|:---:|:---:|
| **Text-to-Image** | ✅ | ✅ | ❌ | ✅ |
| **Image-to-Image** | ✅ | ❌ | ✅ (edit) | ✅ |
| **Negative Prompt** | ✅ | ❌ | ❌ | ❌ |
| **Aspect Ratios** | 5 options | Fixed | Original | Multiple |
| **Resolution** | 2K | 1024² | Original | Configurable |

### Video Models

| Feature | Seedance 1.5 Pro | Seedance 2.0 Fast | Wan 2.1 | MiniMax Hailuo |
|---------|:---:|:---:|:---:|:---:|
| **First Frame Ref** | ✅ | ✅ | ✅ | ✅ |
| **Last Frame Ref** | ✅ | ✅ | ❌ | ✅ |
| **Asset References** | ✅ (≤9) | ✅ (≤10) | ❌ | ✅ (≤1) |
| **Spatial Audio** | ✅ | ✅ | ❌ | ❌ |
| **Video Reference** | ❌ | ✅ | ❌ | ❌ |
| **Resolution** | 480p-1080p | 720p | 720p | 1080P |

---

## 5. Critical Parameters

### `type` Field (v0.5.15+)
Tags the model as `"image"` or `"video"`, routing to `ImageModelDispatcher` or `VideoModelDispatcher` respectively.

### `requires_reference` Field (v0.5.16+)
When `true`, the model is an editing model. The Provider auto-extracts reference images from `frame_ref` and Base64-encodes them for injection.

### `global_style_postfix` (Global Style)
Defined in `videospec/project.md`. Automatically injected at the end of every prompt during `opsv generate`.

### Dynamic QC & Graceful Degradation (v0.5.14+)
The Dispatcher performs a dynamic capacity boundary test before dispatch:
- `max_reference_images`: If the payload's image reference array exceeds this limit, it's auto-truncated with a warning.
- `supports_audio` / `supports_video_ref`: Unsupported multimedia inputs are safely stripped to prevent API failure.

### `required_env` / `fallback_env` Fields

| Field | Meaning | Example |
|-------|---------|---------|
| `required_env` | Required Key (at least one must exist) | `["VOLCENGINE_API_KEY"]` |
| `fallback_env` | Fallback Key (tried when required is missing) | `["SEADREAM_API_KEY"]` |

---

## 6. Template vs Local Config

- `opsv init` copies `templates/.env/` to the new project.
- Local changes in `.env/` do not affect the global template.
- Manual upgrades can diff against `templates/.env/api_config.yaml` for new parameters.

---

## 7. Adding New Models

1. Add model config block in `api_config.yaml` (with `type`, `required_env`)
2. Add corresponding API Key in `secrets.env`
3. Implement Provider class in `src/executor/providers/`
4. Register in `ImageModelDispatcher` or `VideoModelDispatcher`
5. Update `docs/07-API-REFERENCE.md`

---

> *"Configuration is Command; Parameters are Discipline."*
> *OpsV 0.5.19 | Latest Update: 2026-04-17*

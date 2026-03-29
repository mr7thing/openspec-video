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

# SiliconFlow API Key (Wan 2.1 Video)
SILICONFLOW_API_KEY=your_siliconflow_key_here
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

### Multi-Model Dispatcher (v0.4.3)

The Dispatcher strictly maps parameters based on this file before making requests.

```yaml
models:
  seadream-5.0-lite:
    provider: "seadream"
    model: "doubao-seedream-5-0-260128"
    gen_command: "gen-image"
    required_env: ["VOLCENGINE_API_KEY"]
    features: ["txt2img", "seed_control", "aspect_ratio"]
    defaults:
      quality: "2K"
      aspect_ratio: "1:1"
      max_images: 4

  seedance-1.5-pro:
    provider: "seedance"
    model: "doubao-seedance-1-5-pro"
    gen_command: "gen-video"
    required_env: ["VOLCENGINE_API_KEY"]
    defaults:
      quality: "720p"
      duration: 5
      sound: true
    supports_first_image: true
    supports_last_image: true
    supports_reference_images: true
```

---

## 4. Capability Matrix

| Feature | SeaDream 5.0 | Wan 2.1 | Seedance 1.5 Pro |
|---------|:---:|:---:|:---:|
| **Type** | Image | Video | Video |
| **First Frame Ref** | N/A | ✅ | ✅ |
| **Last Frame Ref** | N/A | ❌ | ✅ |
| **Asset Reference** | N/A | ❌ | ✅ |
| **Batch Mode** | ✅ (1-12) | ❌ | ❌ |
| **Spatial Audio** | N/A | ❌ | ✅ |

---

## 5. Critical Parameters

### `max_images` (Batch Generation)
When `max_images > 1`, the engine activates "Sequential Generation" to maintain high feature consistency for the same entity.

### `global_style_postfix` (Global Style)
Defined in `videospec/project.md`. Automatically injected at the end of every prompt during `opsv generate`.

---

## 6. Template vs Local Config

- `opsv init` copies `templates/.env/` to the new project.
- Local changes in `.env/` do not affect the global template.

---

> *"Configuration is Command; Parameters are Discipline."*
> *OpsV 0.4.3 | Latest Update: 2026-03-29*

# OpsV Configuration Guide (v0.6.3)

> Triple configuration: services, secrets, and parameters �?all behavior driven by config files.

---

## 1. Configuration Architecture

```
project/
├── .env                        # Service management (ports, v0.6)
└── .env/                       # Environment config (git ignored)
    ├── secrets.env             # API keys (secret)
    └── api_config.yaml         # Engine parameters (shareable)
```

| File | Contents | Git Tracked | Change Frequency |
|------|----------|-------------|-----------------|
| `.env` (root file) | Service port config | �?Tracked | Rarely |
| `.env/secrets.env` | API Keys | �?Ignored | Rarely |
| `.env/api_config.yaml` | Model parameters | �?Ignored | Occasionally |

---

## 2. Service Management (`.env` root file, v0.6.0)

```env
OPSV_DAEMON_PORT=3061     # Global Daemon (Chrome Extension)
OPSV_REVIEW_PORT=3456     # Local Review UI
```

All services provide default fallback values.

---

## 3. API Key Configuration (`secrets.env`)

```env
VOLCENGINE_API_KEY=your_volcengine_key_here
SILICONFLOW_API_KEY=your_siliconflow_key_here
MINIMAX_API_KEY=your_minimax_key_here
```

Load priority: `.env/secrets.env` > `.env` (root) > system environment variables.

---

## 4. Engine Parameters (`api_config.yaml`)

```yaml
models:
  seadream-5.0-lite:
    provider: "seadream"
    type: "image"
    enable: true
    model: "doubao-seedream-5-0-260128"
    required_env: ["VOLCENGINE_API_KEY"]
    features: ["txt2img", "img2img", "negative_prompt", "aspect_ratio"]
    defaults:
      quality: "2K"
      aspect_ratio: "16:9"

  seedance-1.5-pro:
    provider: "seedance"
    type: "video"
    enable: true
    model: "doubao-seedance-1-5-pro"
    required_env: ["VOLCENGINE_API_KEY"]
    defaults:
      quality: "720p"
      duration: 5
      sound: true
    supports_first_image: true
    supports_last_image: true
    max_reference_images: 9

  seedance-2.0:
    provider: "volcengine"
    type: "video_generation"
    enable: true
    model: "doubao-seedance-2-0-260128"
    required_env: ["VOLCENGINE_API_KEY"]
    api_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
    api_status_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
    defaults:
      ratio: "16:9"
      duration: 5
      generate_audio: true
      watermark: false
    max_reference_images: 9
    supports_multimodal: true

  seedance-2.0-fast:
    provider: "volcengine"
    type: "video_generation"
    enable: true
    model: "doubao-seedance-2-0-fast-260128"
    required_env: ["VOLCENGINE_API_KEY"]
    api_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
    api_status_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
    defaults:
      ratio: "16:9"
      duration: 5
      generate_audio: true
      watermark: false
    max_reference_images: 9
    supports_multimodal: true
```

---

## 5. Key Parameters

- **`provider`** (v0.6.0): Maps directly to `opsv queue run <provider>` argument
- **`type`**: Routes to `StandardAPICompiler` or `ComfyUITaskCompiler`
- **`required_env`**: Declares required API Key environment variable names

---

## 6. Adding New Models (v0.6.0)

1. Add model config in `api_config.yaml`
2. Add API key in `secrets.env`
3. Implement Provider class with `processTask(task)` in `src/executor/providers/`
4. Register in `src/commands/queue.ts` run command
5. Update documentation

> No Dispatcher registration needed �?Provider is called directly via QueueWatcher.

---

> *OpsV 0.6.3 | Last updated: 2026-04-22*

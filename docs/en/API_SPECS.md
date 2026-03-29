# OpsV Multi-Model API Specifications (v0.4.x)

This document defines the interface formats, data types, and interaction protocols for all video and image generation models supported by the OpsV framework.

## 1. Core Interaction Pattern
OpsV adopts an asynchronous **"Submit-Poll-Download"** pattern.

### Unified Job Object (Internal)
```typescript
interface Job {
  id: string;                          // Unique shot/task ID
  prompt_en: string;                   // English render prompt
  reference_images?: string[];         // Local filesystem paths
  payload: {
    duration: string;
    global_settings: {
      quality: '480p' | '720p' | '1080p';
    };
    schema_0_3?: {                     // Support for keyframe anchors
      first_image?: string;
      last_image?: string;
    };
  };
}
```

---

## 2. ByteDance Seedance 1.5 Pro (Standard)

### Submission (Submit)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/submit`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <API_KEY>`
- **Payload**:
```json
{
  "model": "doubao-seedance-1-5-pro",
  "prompt": "prompt string",
  "resolution": "720p", // Options: 480p, 720p, 1080p
  "aspect_ratio": "16:9", // Options: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive
  "duration": 5, // Integer (seconds)
  "fps": 24, // Fixed at 24
  "image": "data:image/jpeg;base64,...", // Optional First Frame
  "last_image": "data:image/jpeg;base64,...", // Optional Last Frame
  "sound": true
}
```

### Polling (Status)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/status?id=<requestId>`
- **Method**: `GET`
- **Possible Statuses**: `succeeded`, `failed`, `pending`, `running`.

---

## 3. SiliconFlow (Wan 2.1)

### Submission (Submit)
- **Endpoint**: `https://api.siliconflow.cn/v1/video/submit`
- **Method**: `POST`
- **Payload**:
```json
{
  "model": "DeepSeek-AI/Wan2.1-T2V-14B", 
  "prompt": "prompt string",
  "image_size": "1280x720"
}
```

---

## 4. SeaDream 5.0 (Image Generation)

### Submission (Submit)
- **Endpoint**: `https://api.volcengine.com/visual/image_generation/2024-08-01`
- **Method**: `POST`
- **Payload**:
```json
{
  "req_key": "high_definition_generation",
  "prompt": "prompt string",
  "model_version": "seadream_5_0",
  "aspect_ratio": "16:9",
  "size": "2K" // Options: 2K, 3K, 4K
}
```

---

## 5. Defensive Protocol

All Providers must implement the following architectural safeguards:

1.  **Deep Penetrative Parsing**: Support variations like `data.id`, `data.data.id`, and `data.data[0].id`.
2.  **Evidential Logging**: Log full API response bodies on failure; never return ambiguous `undefined`.
3.  **Axios Defensive Handling**: 
    - Catch `error.response` for explicit business error codes.
    - Distinguish between network timeouts (`ETIMEDOUT`) and logic errors.

---
> [!IMPORTANT]
> Any new model integration must update these specifications and ensure synchronization with specialized providers and unit tests.

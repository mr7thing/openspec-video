# OpsV 澶氭ā鍨?API 鎺ュ彛瑙勮寖 (v0.4.x)

鏈枃浠跺畾涔変簡 OpsV 妗嗘灦鏀寔鐨勫悇绫昏棰戠敓鎴愭ā鍨嬬殑鎺ュ彛鏍煎紡銆佹暟鎹被鍨嬪強浜や簰鍗忚銆?
## 1. 鏍稿績浜や簰妯″紡
OpsV 閲囩敤 **鈥滄彁浜?杞-涓嬭浇鈥?* 鐨勫紓姝ユā寮忋€?
### 缁熶竴浣滀笟瀵硅薄 (Internal Job Object)
```typescript
interface Job {
  id: string;
  prompt_en: string;
  reference_images?: string[]; // 鏈湴璺緞
  payload: {
    duration: string;
    global_settings: {
      quality: '480p' | '720p' | '1080p';
    };
    schema_0_3?: {
      first_image?: string;
      last_image?: string;
    };
  };
}
```

---

## 2. ByteDance Seedance 1.5 Pro

### 鎻愪氦鎺ュ彛 (Submit)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/submit`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <API_KEY>`
- **Payload**:
```json
{
  "model": "doubao-seedance-1-5-pro",
  "prompt": "prompt string",
  "resolution": "720p", // 瀹樻柟鏀寔 480p, 720p, 1080p
  "aspect_ratio": "16:9", // 瀹樻柟鏀寔 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive
  "duration": 5, // 鏁存暟绉?  "fps": 24, // 鍥哄畾 24
  "image": "data:image/jpeg;base64,...", // 鍙€夛紝棣栧抚
  "last_image": "data:image/jpeg;base64,...", // 鍙€夛紝灏惧抚
  "sound": true
}
```

### 鐘舵€佹煡璇?(Status)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/status?id=<requestId>`
- **Method**: `GET`
- **Response**:
```json
{
  "status": "succeeded", // succeeded, failed, pending, running
  "video_url": "https://...", // 浠?status 涓?succeeded 鏃跺寘鍚?  "error_message": "" // 浠?status 涓?failed 鏃跺寘鍚?}
```

---

## 3. SiliconFlow (Wan2.1)

### 鎻愪氦鎺ュ彛 (Submit)
- **Endpoint**: `https://api.siliconflow.cn/v1/video/submit`
- **Method**: `POST`
- **Payload**:
```json
{
  "model": "DeepSeek-AI/Wan2.1-T2V-14B", // 鎴栧叾浠?Wan2.1 鍙樹綋
  "prompt": "prompt string",
  "image_size": "1280x720"
}
```

### 鐘舵€佹煡璇?(Status)
- **Endpoint**: `https://api.siliconflow.cn/v1/video/status`
- **Method**: `POST`
- **Payload**:
```json
{
  "requestId": "..."
}
```
- **Response**:
```json
{
  "status": "Succeed", // Succeed, Failed, InQueue, InProgress
  "results": {
    "videos": [
      { "url": "https://..." }
    ]
  }
}
```

---

## 4. SeaDream 5.0 (Image Generation)

### 鎻愪氦鎺ュ彛 (Submit)
- **Endpoint**: `https://api.volcengine.com/visual/image_generation/2024-08-01`
- **Method**: `POST`
- **Payload**:
```json
{
  "req_key": "high_definition_generation",
  "prompt": "prompt string",
  "model_version": "seadream_5_0",
  "aspect_ratio": "16:9", // 瀹樻柟棰勮鐢诲箙
  "size": "2K", // 瀹樻柟鏀寔 2K, 3K, 4K
  "width": 1024, // 浠呭湪涓嶄娇鐢?size 鏃跺彲閫?custom pixel
  "height": 1024
}
```

### 鍝嶅簲鏍煎紡
```json
{
  "data": {
    "binary_data_base64": ["..."],
    "image_urls": ["https://..."]
  }
}
```

---

## 5. 寮傚父澶勭悊鍗忚 (Defensive Protocol)

鎵€鏈?Provider 蹇呴』瀹炵幇浠ヤ笅闃插尽鎬цВ鏋愬噯鍒欙細

1.  **娣卞害绌块€忚В鏋?(Deep Penetrative Parsing)**:
    - 鍏煎 `data.id`, `data.data.id`, `data.data[0].id` 绛夊彉浣撱€?    - 浣跨敤 `(Array.isArray(d) ? d[0] : d)` 纭繚缁撴灉绋冲仴銆?
2.  **寮哄姏璇佹嵁寮忔棩蹇?(Evidential Logging)**:
    - 璇︾粏璁板綍 API 鍝嶅簲浣擄紝涓ョ杩斿洖妯＄硦鐨?`undefined`銆?
3.  **Axios 闃茬┖閫昏緫 (Axios Defensive Handling)**:
    - 鎹曡幏 `error.response` 骞舵彁鍙栦笟鍔￠敊璇爜銆?    - 鍖哄垎缃戠粶瓒呮椂 (`ETIMEDOUT`) 涓庝笟鍔￠敊璇€?
---
> [!IMPORTANT]
> 浠讳綍鏂扮殑妯″瀷闆嗘垚蹇呴』渚濈収姝ゆ枃妗ｆ洿鏂扮浉搴旂殑鎺ュ彛鎻忚堪锛屽苟鍚屾鑷?`SeedanceProvider` 鎴栫浉鍏虫祴璇曠敤渚嬩腑銆?

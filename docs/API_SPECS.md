# OpsV 多模型 API 接口规范 (v0.4.x)

本文件定义了 OpsV 框架支持的各类视频生成模型的接口格式、数据类型及交互协议。

## 1. 核心交互模式
OpsV 采用 **“提交-轮询-下载”** 的异步模式。

### 统一作业对象 (Internal Job Object)
```typescript
interface Job {
  id: string;
  prompt_en: string;
  reference_images?: string[]; // 本地路径
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

### 提交接口 (Submit)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/submit`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <API_KEY>`
- **Payload**:
```json
{
  "model": "doubao-seedance-1-5-pro",
  "prompt": "prompt string",
  "resolution": "720p", // 官方支持 480p, 720p, 1080p
  "aspect_ratio": "16:9", // 官方支持 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive
  "duration": 5, // 整数秒
  "fps": 24, // 固定 24
  "image": "data:image/jpeg;base64,...", // 可选，首帧
  "last_image": "data:image/jpeg;base64,...", // 可选，尾帧
  "sound": true
}
```

### 状态查询 (Status)
- **Endpoint**: `https://ark.cn-beijing.volces.com/api/v3/video/status?id=<requestId>`
- **Method**: `GET`
- **Response**:
```json
{
  "status": "succeeded", // succeeded, failed, pending, running
  "video_url": "https://...", // 仅 status 为 succeeded 时包含
  "error_message": "" // 仅 status 为 failed 时包含
}
```

---

## 3. SiliconFlow (Wan2.1)

### 提交接口 (Submit)
- **Endpoint**: `https://api.siliconflow.cn/v1/video/submit`
- **Method**: `POST`
- **Payload**:
```json
{
  "model": "DeepSeek-AI/Wan2.1-T2V-14B", // 或其他 Wan2.1 变体
  "prompt": "prompt string",
  "image_size": "1280x720"
}
```

### 状态查询 (Status)
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

### 提交接口 (Submit)
- **Endpoint**: `https://api.volcengine.com/visual/image_generation/2024-08-01`
- **Method**: `POST`
- **Payload**:
```json
{
  "req_key": "high_definition_generation",
  "prompt": "prompt string",
  "model_version": "seadream_5_0",
  "aspect_ratio": "16:9", // 官方预设画幅
  "size": "2K", // 官方支持 2K, 3K, 4K
  "width": 1024, // 仅在不使用 size 时可选 custom pixel
  "height": 1024
}
```

### 响应格式
```json
{
  "data": {
    "binary_data_base64": ["..."],
    "image_urls": ["https://..."]
  }
}
```

---

## 5. 异常处理协议 (Defensive Protocol)

所有 Provider 必须实现以下防御性解析准则：

1.  **深度穿透解析 (Deep Penetrative Parsing)**:
    - 兼容 `data.id`, `data.data.id`, `data.data[0].id` 等变体。
    - 使用 `(Array.isArray(d) ? d[0] : d)` 确保结果稳健。

2.  **强力证据式日志 (Evidential Logging)**:
    - 详细记录 API 响应体，严禁返回模糊的 `undefined`。

3.  **Axios 防空逻辑 (Axios Defensive Handling)**:
    - 捕获 `error.response` 并提取业务错误码。
    - 区分网络超时 (`ETIMEDOUT`) 与业务错误。

---
> [!IMPORTANT]
> 任何新的模型集成必须依照此文档更新相应的接口描述，并同步至 `SeedanceProvider` 或相关测试用例中。

# OpsV 配置体系 (Configuration Guide)

> 三重配置体系：服务归服务，密钥归密钥，参数归参数。一切行为由配置文件驱动。

---

## 1. 配置架构总览

```
project/
├── .env                        # 服务管理配置（端口等，v0.6 新增）
└── .env/                       # 环境配置目录（git 忽略）
    ├── secrets.env             # API 密钥（绝密）
    └── api_config.yaml         # 引擎参数（可共享）
```

| 文件 | 存储内容 | Git 跟踪 | 修改频率 |
|------|---------|---------|---------| 
| `.env`（根目录文件） | 服务端口配置（Daemon / Review） | ✅ 跟踪 | 极少 |
| `.env/secrets.env` | API Key 等敏感信息 | ❌ 忽略 | 极少（初始化后不变） |
| `.env/api_config.yaml` | 模型参数、默认值、能力描述 | ❌ 忽略 | 偶尔（切换模型/调参时） |

---

## 2. 服务管理配置 (`.env` 根文件，v0.6.0 新增)

```env
# 全局 Daemon 服务端口 (支持 Chrome 浏览器扩展)
OPSV_DAEMON_PORT=3061

# Local UI Review 服务端口 (可视化审阅与交互)
OPSV_REVIEW_PORT=3456
```

### 加载机制
- `opsv daemon` 启动时通过 `dotenv` 加载，读取 `OPSV_DAEMON_PORT`
- `opsv review` 启动时通过 `dotenv` 加载，读取 `OPSV_REVIEW_PORT`
- 所有服务端口均提供默认值回退

> **v0.6.0 设计原则**：服务端口从硬编码解耦至环境变量，第三方 Agent 或子系统在对接时**必须优先读取环境变量**进行连接。

---

## 3. API 密钥配置 (`secrets.env`)

### 格式

```env
# 火山引擎 API Key（SeaDream 图像 + Seedance 视频）
VOLCENGINE_API_KEY=your_volcengine_key_here

# SiliconFlow API Key（Qwen 图像 + Wan 视频）
SILICONFLOW_API_KEY=your_siliconflow_key_here

# MiniMax API Key（MiniMax 图像 + Hailuo 视频）
MINIMAX_API_KEY=your_minimax_key_here
```

### 加载优先级

CLI 启动时按以下优先级加载环境变量：

```
1 (最高) → .env/secrets.env    # 推荐存放位置
2        → .env (文件)          # 根目录 dotenv 文件（服务配置）
3 (最低) → 系统环境变量         # process.env 兜底
```

---

## 4. 引擎参数配置 (`api_config.yaml`)

### 完整配置模板 (v0.6.0)

```yaml
# OpsV 0.6.x Spooler Queue 模型配置
# QueueWatcher 根据此表实例化对应 Provider

models:

  # ── 图像模型 ──────────────────────────────────

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
      max_images: 1
      steps: 30
      cfg_scale: 7.5
      negative_prompt: "blurry, low quality, distorted..."
    max_size: { width: 1280, height: 720 }

  qwen-image:
    provider: "siliconflow"
    type: "image"
    enable: true
    model: "Qwen/Qwen-Image"
    required_env: ["SILICONFLOW_API_KEY"]
    features: ["txt2img", "aspect_ratio"]
    defaults:
      quality: "1024x1024"
      aspect_ratio: "1:1"

  minimax-image-01:
    provider: "minimax"
    type: "image"
    enable: false
    model: "image-01"
    required_env: ["MINIMAX_API_KEY"]
    features: ["txt2img", "img2img", "aspect_ratio"]
    defaults:
      aspect_ratio: "16:9"

  # ── 视频模型 ──────────────────────────────────

  seedance-1.5-pro:
    provider: "seedance"
    type: "video"
    enable: true
    model: "doubao-seedance-1-5-pro"
    required_env: ["VOLCENGINE_API_KEY"]
    defaults:
      quality: "720p"
      aspect_ratio: "16:9"
      duration: 5
      sound: true
    supports_first_image: true
    supports_last_image: true
    supports_reference_images: true
    max_reference_images: 9

  seedance-2.0-fast:
    provider: "seedance"
    type: "video"
    enable: true
    model: "doubao-video-v2-fast"
    required_env: ["VOLCENGINE_API_KEY"]
    defaults:
      quality: "720p"
      aspect_ratio: "16:9"
      duration: 5
      sound: true
    supports_first_image: true
    supports_last_image: true
    supports_reference_images: true
    max_reference_images: 10
    supports_audio: true
    supports_video_ref: true
```

---

## 5. 模型能力矩阵

### 图像模型

| 能力 | SeaDream 5.0 | Qwen Image | MiniMax Image |
|------|:---:|:---:|:---:|
| **文生图** | ✅ | ✅ | ✅ |
| **图生图** | ✅ | ❌ | ✅ |
| **负面提示词** | ✅ | ❌ | ❌ |
| **画幅选项** | 5 种 | 固定 | 多种 |
| **分辨率** | 2K | 1024² | 可配置 |

### 视频模型

| 能力 | Seedance 1.5 Pro | Seedance 2.0 Fast |
|------|:---:|:---:|
| **首帧参考** | ✅ | ✅ |
| **尾帧参考** | ✅ | ✅ |
| **角色参考图** | ✅ (≤9) | ✅ (≤10) |
| **空间音频** | ✅ | ✅ |
| **视频参考** | ❌ | ✅ |
| **分辨率** | 480p-1080p | 720p |

---

## 6. 关键参数解读

### `type` 字段
标注模型类型为 `"image"` 或 `"video"`，`opsv queue compile` 据此路由到 `StandardAPICompiler` 或 `ComfyUITaskCompiler`。

### `provider` 字段 (v0.6.0 更新)
直接对应 `opsv queue run <provider>` 的参数名。QueueWatcher 根据此字段实例化对应的 Provider 类。

### `global_style_postfix`（全局风格后缀）

定义在 `videospec/project.md` 中，编译器在 `opsv generate` 时自动注入每个任务的 Prompt 末尾：

```
[Shot Prompt] + [Asset Description] + [global_style_postfix]
```

### `required_env` 字段

声明模型所需的 API Key 环境变量名。CLI 在执行前查表校验，无需硬编码。

---

## 7. 添加新模型 (v0.6.0 流程)

1. 在 `api_config.yaml` 中添加新模型配置块（含 `type`、`provider`、`required_env`）
2. 在 `secrets.env` 中添加对应的 API Key
3. 在 `src/executor/providers/` 中实现对应的 Provider 类（实现 `processTask(task)` 方法）
4. 在 `src/commands/queue.ts` 的 `run` 命令中注册新 Provider
5. 更新 `docs/cn/07-API-REFERENCE.md` 添加接口文档

> **v0.6.0 注意**: 不再需要在 Dispatcher 中注册！Provider 直接通过 QueueWatcher 被调用。

---

> *"配置即命令，参数即纪律。"*
> *OpsV 0.6.0 | 最后更新: 2026-04-17*

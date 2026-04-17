# OpsV 配置体系 (Configuration Guide)

> 双重配置体系：密钥归密钥，参数归参数。一切生成行为由配置文件驱动。

---

## 1. 配置架构总览

```
project/
└── .env/                       # 环境配置目录（git 忽略）
    ├── secrets.env             # API 密钥（绝密）
    └── api_config.yaml         # 引擎参数（可共享）
```

| 文件 | 存储内容 | Git 跟踪 | 修改频率 |
|------|---------|---------|---------| 
| `secrets.env` | API Key 等敏感信息 | ❌ 忽略 | 极少（初始化后不变） |
| `api_config.yaml` | 模型参数、默认值、能力描述 | ❌ 忽略 | 偶尔（切换模型/调参时） |

---

## 2. API 密钥配置 (`secrets.env`)

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
2        → .env (文件)          # 标准 dotenv 文件（非目录）
3 (最低) → 系统环境变量         # process.env 兜底
```

### 验证方式

```bash
# 查看环境变量加载状态
opsv gen-image --dry-run
```

---

## 3. 引擎参数配置 (`api_config.yaml`)

### 完整配置模板 (v0.5.19)

```yaml
# OpsV 0.5.x 多模态视频引擎调度配置文件
# 调度器 (Dispatcher) 在发出请求前严格根据此表映射参数并执行优雅降级

models:

  # ── 图像模型 ──────────────────────────────────

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
      steps: 30
      cfg_scale: 7.5
      negative_prompt: "blurry, low quality, distorted..."
    max_size: { width: 1280, height: 720 }

  qwen-image:
    provider: "siliconflow"
    type: "image"
    enable: true
    model: "Qwen/Qwen-Image"
    gen_command: "gen-image"
    required_env: ["SILICONFLOW_API_KEY"]
    features: ["txt2img", "aspect_ratio"]
    defaults:
      quality: "1024x1024"
      aspect_ratio: "1:1"

  qwen-image-edit-2509:
    provider: "siliconflow"
    type: "image"
    enable: true
    model: "Qwen/Qwen-Image-Edit-2509"
    gen_command: "gen-image"
    required_env: ["SILICONFLOW_API_KEY"]
    features: ["img2img", "edit"]
    requires_reference: true          # 编辑模型强制要求参考图
    defaults:
      quality: "original"
      aspect_ratio: "original"

  minimax-image-01:
    provider: "minimax"
    type: "image"
    enable: false
    model: "image-01"
    gen_command: "gen-image"
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
    gen_command: "gen-video"
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
    gen_command: "gen-video"
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

  wan2.2-i2v:
    provider: "siliconflow"
    type: "video"
    enable: false
    model: "wan-ai/Wan2.1-T2V-14B"
    gen_command: "gen-video"
    required_env: ["SILICONFLOW_API_KEY"]
    defaults:
      size: "1280x720"
      fps: 24
      duration: 5
    supports_first_image: true
    max_reference_images: 0
    supports_audio: false

  minimax-video-01:
    provider: "minimax"
    type: "video"
    enable: false
    model: "MiniMax-Hailuo-2.3"
    gen_command: "gen-video"
    required_env: ["MINIMAX_API_KEY"]
    defaults:
      resolution: "1080P"
      duration: 5
    supports_first_image: true
    supports_last_image: true
    supports_reference_images: true
    max_reference_images: 1
    supports_audio: false
```

---

## 4. 模型能力矩阵

### 图像模型

| 能力 | SeaDream 5.0 | Qwen Image | Qwen Edit | MiniMax Image |
|------|:---:|:---:|:---:|:---:|
| **文生图** | ✅ | ✅ | ❌ | ✅ |
| **图生图** | ✅ | ❌ | ✅ (编辑) | ✅ |
| **负面提示词** | ✅ | ❌ | ❌ | ❌ |
| **画幅选项** | 5 种 | 固定 | 原图 | 多种 |
| **分辨率** | 2K | 1024² | 原图 | 可配置 |

### 视频模型

| 能力 | Seedance 1.5 Pro | Seedance 2.0 Fast | Wan 2.1 | MiniMax Hailuo |
|------|:---:|:---:|:---:|:---:|
| **首帧参考** | ✅ | ✅ | ✅ | ✅ |
| **尾帧参考** | ✅ | ✅ | ❌ | ✅ |
| **角色参考图** | ✅ (≤9) | ✅ (≤10) | ❌ | ✅ (≤1) |
| **空间音频** | ✅ | ✅ | ❌ | ❌ |
| **视频参考** | ❌ | ✅ | ❌ | ❌ |
| **分辨率** | 480p-1080p | 720p | 720p | 1080P |

---

## 5. 关键参数解读

### `type` 字段 (v0.5.15+)
标注模型类型为 `"image"` 或 `"video"`，调度器据此路由到 `ImageModelDispatcher` 或 `VideoModelDispatcher`。

### `requires_reference` 字段 (v0.5.16+)
当设为 `true` 时，该模型为编辑类模型，Provider 会自动从分镜的 `frame_ref` 中提取参考图并进行 Base64 编码注入。

### `global_style_postfix`（全局风格后缀）

定义在 `videospec/project.md` 中，编译器在 `opsv generate` 时自动注入每个任务的 Prompt 末尾：

```
[Shot Prompt] + [Asset Description] + [global_style_postfix]
```

### 模型边界与优雅降级 (v0.5.14+)
调度器会在派发前进行动态的资源边界测试 (Graceful Degradation)：
- `max_reference_images`: 如果输入参考图超载，引擎将自动截断并抛出黄色警告。
- `supports_audio` / `supports_video_ref`: 如果输入多模态音频或视频引用而设定为 false，派发器将自动剔除以免执行错误。

### `required_env` / `fallback_env` 字段

声明模型所需的 API Key 环境变量名。CLI 在执行前查表校验，无需硬编码。

| 字段 | 含义 | 示例 |
|------|------|------|
| `required_env` | 必需的 Key（至少一个存在） | `["VOLCENGINE_API_KEY"]` |
| `fallback_env` | 备选 Key（required 不存在时尝试） | `["SEADREAM_API_KEY"]` |

---

## 6. 模板与本地配置的关系

```
安装包（npm 包）               用户项目
templates/.env/                 .env/
├── api_config.yaml      →→→   ├── api_config.yaml   (opsv init 复制)
└── secrets.env          →→→   └── secrets.env        (opsv init 复制)
```

- `opsv init` 将 `templates/.env/` 作为种子模板复制到新项目
- 用户修改本地 `.env/` 不影响全局模板
- 手动升级时可对比 `templates/.env/api_config.yaml` 获取新参数

---

## 7. 添加新模型

1. 在 `api_config.yaml` 中添加新模型配置块（含 `type`、`required_env`）
2. 在 `secrets.env` 中添加对应的 API Key
3. 在 `src/executor/providers/` 中实现对应的 Provider 类
4. 在 `ImageModelDispatcher` 或 `VideoModelDispatcher` 中注册新 Provider
5. 更新 `docs/07-API-REFERENCE.md` 添加接口文档

---

> *"配置即命令，参数即纪律。"*
> *OpsV 0.5.19 | 最后更新: 2026-04-17*

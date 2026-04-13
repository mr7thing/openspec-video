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

# SeaDream 独立 Key（如与火山引擎不同）
SEADREAM_API_KEY=your_seadream_key_here

# SiliconFlow API Key（Wan2.1 视频）
SILICONFLOW_API_KEY=your_siliconflow_key_here
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

输出将显示：
```
🔍 Environment Check:
   - Config Source: .env/secrets.env
   - VOLCENGINE_API_KEY: Present (****abc1)
   - SEADREAM_API_KEY: Missing
```

---

## 3. 引擎参数配置 (`api_config.yaml`)

### 完整配置模板

```yaml
# OpsV 0.4 多模态视频引擎调度配置文件
# 调度器 (Dispatcher) 在发出请求前严格根据此表映射参数
# gen_command 标注该模型由哪个 CLI 命令执行

models:

  # ==========================================
  # 图像模型：火山引擎 SeaDream 5.0 Lite
  # CLI: opsv gen-image -m seadream-5.0-lite
  # ==========================================
  seadream-5.0-lite:
    provider: "seadream"
    model: "doubao-seedream-5-0-260128"
    gen_command: "gen-image"
    required_env: ["VOLCENGINE_API_KEY"]       # ← 0.4.1 声明所需 Key
    fallback_env: ["SEADREAM_API_KEY"]         # ← 备选 Key（任一存在即可）
    features: ["txt2img", "img2img", "negative_prompt", "seed_control", "aspect_ratio", "sequential_generation"]
    defaults:
      quality: "2K"
      aspect_ratio: "1:1"
      max_images: 4
      steps: 30
      cfg_scale: 7.5
      negative_prompt: "blurry, low quality, distorted, deformed, ugly, bad anatomy, text, watermark"
    max_size:
      width: 2048
      height: 2048
    max_batch: 12

  # ==========================================
  # 视频模型：SiliconFlow Wan 2.1
  # CLI: opsv gen-video -m wan2.2-i2v
  # ==========================================
  wan2.2-i2v:
    provider: "siliconflow"
    model: "wan-ai/Wan2.1-T2V-14B"
    api_url: "https://api.siliconflow.cn/v1/video/submit"
    api_status_url: "https://api.siliconflow.cn/v1/video/status"
    gen_command: "gen-video"
    required_env: ["SILICONFLOW_API_KEY"]
    defaults:
      size: "1280x720"
      fps: 24
      duration: 5
    supports_first_image: true
    supports_middle_image: false
    supports_last_image: false
    supports_reference_images: false

  # ==========================================
  # 视频模型：Seedance 1.5 Pro (火山引擎)
  # CLI: opsv gen-video -m seedance-1.5-pro
  # ==========================================
  seedance-1.5-pro:
    provider: "seedance"
    model: "doubao-seedance-1-5-pro"
    api_url: "https://ark.cn-beijing.volces.com/api/v3/video/submit"
    gen_command: "gen-video"
    required_env: ["VOLCENGINE_API_KEY"]
    fallback_env: ["SEEDANCE_API_KEY"]
    quality_map:
      "480p": "480p"
      "720p": "720p"
      "1080p": "1080p"
    defaults:
      quality: "720p"
      aspect_ratio: "16:9"
      duration: 5
      fps: 24
      sound: true
    supports_first_image: true
    supports_middle_image: false
    supports_last_image: true
    supports_reference_images: true
```

---

## 4. 模型能力矩阵

| 能力 | SeaDream 5.0 | Wan 2.1 | Seedance 1.5 Pro |
|------|:---:|:---:|:---:|
| **类型** | 图像 | 视频 | 视频 |
| **首帧参考** | N/A | ✅ | ✅ |
| **尾帧参考** | N/A | ❌ | ✅ |
| **中间帧** | N/A | ❌ | ❌ |
| **角色参考图** | N/A | ❌ | ✅ |
| **组图模式** | ✅ (1-12) | ❌ | ❌ |
| **负面提示词** | ✅ | ❌ | ❌ |
| **种子控制** | ✅ | ❌ | ❌ |
| **空间音频** | N/A | ❌ | ✅ |
| **画幅选项** | 5 种 | 固定 | 7 种 |
| **分辨率** | 2K-4K | 720p | 480p-1080p |

---

## 5. 关键参数解读

### `max_images`（组图数量）

当 `max_images > 1` 时，渲染引擎自动激活"连续生成"模式：
- 系统向 Prompt 注入连贯性引导词
- 同一实体的多张图片保持高度特征一致性
- **推荐值**：`4`（兼顾效率与多样性）
- **上限**：`12`

### `global_style_postfix`（全局风格后缀）

定义在 `videospec/project.md` 中，编译器在 `opsv generate` 时自动注入每个任务的 Prompt 末尾：

```
[Shot Prompt] + [Asset Description] + [global_style_postfix]
```

示例：`"cinematic lighting, ultra detailed, masterpiece, arri alexa 65, 8k"`

### `quality_map`（质量映射）

不同模型的分辨率参数名称不统一。`quality_map` 将 OpsV 标准化的质量等级映射到各模型的原生参数。

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

1. 在 `api_config.yaml` 中添加新模型配置块（含 `required_env`）
2. 在 `secrets.env` 中添加对应的 API Key
3. 在 `src/executor/providers/` 中实现对应的 Provider 类
4. 在 `ImageModelDispatcher` 或 `VideoModelDispatcher` 中注册新 Provider
5. 更新 `docs/07-API-REFERENCE.md` 添加接口文档

```yaml
# api_config.yaml 新增示例
models:
  my-new-model:
    provider: "custom"
    model: "model-endpoint-id"
    api_url: "https://api.example.com/v1/generate"
    gen_command: "gen-image"          # 或 "gen-video"
    required_env: ["MY_MODEL_API_KEY"]
    defaults:
      quality: "720p"
      duration: 5
    supports_first_image: true
    supports_last_image: false
    max_reference_images: 0
    supports_audio: false
    supports_video_ref: false

### 模型边界与优雅降级 (v0.5.14)
调度器会在派发前进行动态的资源边界测试 (Graceful Degradation):
- `max_reference_images`: 如果输入参考图超载，引擎将自动截断并抛出黄色警告。
- `supports_audio` / `supports_video_ref`: 如果输入多模态音频或视频引用而设定为 false，派发器将自动剔除它们以免执行错误。

### `required_env` / `fallback_env` 字段

声明模型所需的 API Key 环境变量名。CLI 在执行前查表校验，无需硬编码。

| 字段 | 含义 | 示例 |
|------|------|------|
| `required_env` | 必需的 Key（至少一个存在） | `["VOLCENGINE_API_KEY"]` |
| `fallback_env` | 备选 Key（required 不存在时尝试） | `["SEADREAM_API_KEY"]` |

---

> *"配置即命令，参数即纪律。"*
> *OpsV 0.5.14 | 最后更新: 2026-04-13*

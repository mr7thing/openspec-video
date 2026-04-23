# OpsV 配置体系 (Configuration Guide) (v0.6.4)

> 三重配置体系：服务归服务，密钥归密钥，参数归参数。一切行为由配置文件驱动。

---

## 1. 配置架构总览

```
project/
├── .env/                       # 环境配置目录（git 忽略）
│   ├── secrets.env             # API 密钥（绝密）
│   └── api_config.yaml         # 引擎参数（可共享）
└── .opsv/                      # 运行时状态（git 忽略）
    └── dependency-graph.json   # 依赖图缓存
```

| 文件 | 存储内容 | Git 跟踪 | 修改频率 |
|------|---------|---------|---------| 
| `.env/secrets.env` | API Key 等敏感信息 | ❌ 忽略 | 极少（初始化后不变） |
| `.env/api_config.yaml` | 模型参数、默认值、能力描述 | ❌ 忽略 | 偶尔（切换模型/调参时） |

---

## 2. API 密钥配置 (secrets.env)

### 格式

```env
# 火山引擎 API Key（SeaDream 图像 + Seedance 视频）
VOLCENGINE_API_KEY=your_volcengine_key_here

# SiliconFlow API Key（Qwen 图像 + Wan 视频）
SILICONFLOW_API_KEY=your_siliconflow_key_here

# MiniMax API Key（MiniMax 图像/视频）
MINIMAX_API_KEY=your_minimax_key_here
```

### 加载优先级

CLI 启动时按以下优先级加载环境变量：

```
1 (最高): .env/secrets.env    # 推荐存放位置
2        : .env (文件)          # 根目录 dotenv 文件（服务配置）
3 (最低): 系统环境变量         # process.env 兜底
```

---

## 3. 引擎参数配置 (api_config.yaml)

位于项目 `.env/api_config.yaml`，由 `opsv init` 从模板复制。

### Schema

```yaml
providers:
  <providerName>:
    required_env:
      - ENV_VAR_NAME
    models:
      <modelKey>:
        enable: true|false
        type: image_generation | video_generation
        model: "model-name"
        api_url: "..."
        api_status_url: "..."
        defaults:
          quality: "1024x1024"
          aspect_ratio: "16:9"
```

### 当前支持的 Provider

| Provider | 类型 | 环境变量 |
|----------|------|----------|
| `volcengine` | 图像/视频 | `VOLCENGINE_API_KEY` |
| `siliconflow` | 图像/视频 | `SILICONFLOW_API_KEY` |
| `minimax` | 图像/视频 | `MINIMAX_API_KEY` |
| `runninghub` | ComfyUI 工作流 | `RUNNINGHUB_API_KEY` |
| `comfyui_local` | 本地 ComfyUI | 无 |

### 完整配置模板 (v0.6.4)

```yaml
# OpsV 0.6.x Circle Queue 模型配置
# QueueWatcher 根据此表实例化对应 Provider

providers:

  volcengine:
    required_env:
      - VOLCENGINE_API_KEY
    models:
      seadream-5.0-lite:
        enable: true
        type: image_generation
        model: "doubao-seedream-5-0-260128"
        api_url: "..."
        defaults:
          quality: "2K"
          aspect_ratio: "16:9"

      seedance-1.5-pro:
        enable: true
        type: video_generation
        model: "doubao-seedance-1-5-pro"
        defaults:
          quality: "720p"
          aspect_ratio: "16:9"
          duration: 5

      seedance-2.0:
        enable: true
        type: video_generation
        model: "doubao-seedance-2-0-260128"
        api_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
        api_status_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
        defaults:
          ratio: "16:9"
          duration: 5
          generate_audio: true
          watermark: false
        max_reference_images: 9

      seedance-2.0-fast:
        enable: true
        type: video_generation
        model: "doubao-seedance-2-0-fast-260128"
        api_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
        api_status_url: "https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks"
        defaults:
          ratio: "16:9"
          duration: 5
          generate_audio: true
          watermark: false
        max_reference_images: 9

  siliconflow:
    required_env:
      - SILICONFLOW_API_KEY
    models:
      qwen-image:
        enable: true
        type: image_generation
        model: "Qwen/Qwen-Image"
        defaults:
          quality: "1024x1024"
          aspect_ratio: "1:1"

  minimax:
    required_env:
      - MINIMAX_API_KEY
    models:
      minimax-image-01:
        enable: false
        type: image_generation
        model: "image-01"
        defaults:
          aspect_ratio: "16:9"

  runninghub:
    required_env:
      - RUNNINGHUB_API_KEY
    models:
      runninghub-default:
        enable: true
        type: image_generation
        defaults: {}

  comfyui_local:
    models:
      comfyui-default:
        enable: true
        type: image_generation
        defaults: {}
```

> **v0.6.4 注意**: Provider 本身没有 `enable` 属性，继承自子模型。只有子模型 `enable !== false` 且 `type` 匹配任务类型的 Provider 才会被选中。

---

## 4. ComfyUI 特殊处理

ComfyUI **不通过** `api_config.yaml` 指定模型，模型由工作流 JSON 本身定义。

- 使用 `opsv comfy compile <workflow.json>` 独立命令
- 参数通过 Node Title 匹配注入（如 `input-prompt`, `input-image1`）
- RunningHub 模式下会自动拦截本地文件路径并上传为 URL

---

## 5. 模型能力矩阵

### 图像模型

| 能力 | SeaDream 5.0 | Qwen Image | MiniMax Image |
|------|:---:|:---:|:---:|
| **文生图** | ✅ | ✅ | ✅ |
| **图生图** | ✅ | ✅ | ✅ |
| **负面提示词** | ✅ | ❌ | ❌ |
| **画幅选项** | 5 种 | 固定 | 多种 |
| **分辨率** | 2K | 1024² | 可配置 |

### 视频模型

| 能力 | Seedance 1.5 Pro | Seedance 2.0 | Seedance 2.0 Fast |
|------|:---:|:---:|:---:|
| **文生视频** | ✅ | ✅ | ✅ |
| **首帧参考** | ✅ | ✅ | ✅ |
| **尾帧参考** | ✅ | ✅ | ✅ |
| **角色参考图** | ✅(1) | ✅(9) | ✅(9) |
| **视频参考** | ❌ | ✅(3) | ✅(3) |
| **音频参考** | ❌ | ✅(3) | ✅(3) |
| **空间音频** | ❌ | ✅ | ✅ |
| **分辨率** | 480p-1080p | 720p | 720p |
| **API 版本** | 旧版 `/video/submit` | 新版 Content Generation | 新版 Content Generation |

---

## 6. 关键参数解读

### `type` 字段
标注模型类型：`image_generation` / `video_generation`，`opsv queue compile` 据此路由到 `StandardAPICompiler` 或 `ComfyUITaskCompiler`。

### `provider` 字段 (v0.6.4 更新)
直接对应 `opsv queue run <provider>` 的参数名。QueueWatcher 根据此字段实例化对应的 Provider 类。

### `global_style_postfix`（全局风格后缀）
定义在 `videospec/project.md` 中，编译器在 `opsv imagen` / `opsv animate` 时自动注入每个任务的 Prompt 末尾：

```
[Shot Prompt] + [Asset Description] + [global_style_postfix]
```

### `required_env` 字段
声明模型所需的 API Key 环境变量名。CLI 在执行前查表校验，无需硬编码。

---

## 7. 添加新模型 (v0.6.4 流程)

1. 在 `api_config.yaml` 中添加新模型配置块（含 `type`、`provider`、`required_env`）
2. 在 `secrets.env` 中添加对应的 API Key
3. 在 `src/executor/providers/` 中实现对应的 Provider 类（实现 `processTask(task)` 方法）
4. 在 `src/commands/queue.ts` 的 `run` 命令中注册新 Provider
5. 更新 `docs/cn/07-API-REFERENCE.md` 添加接口文档

> **v0.6.4 注意**: 不再需要在 Dispatcher 中注册！Provider 直接通过 QueueWatcher 被调用。

---

> *"配置即命令，参数即纪律。"*
> *OpsV 0.6.4 | 最后更新 2026-04-22*

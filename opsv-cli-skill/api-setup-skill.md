---
name: opsv-api-setup
description: 教 Agent 如何根据 API 文档创建 OPSV 模型配置（api_config.yaml），适配各种 provider 类型，以及使用 api-setup 命令添加或更新配置。当用户需添加新模型、按 API 文档配工作流、配置 rh-api/rh-workflow-v2/volcengine 等 provider 时使用。
---

# OPSV API 配置技能

## 核心概念

OPSV 的模型配置在 `api_config.yaml` 中，每个模型 key 对应一个 API 端点。配置包含三部分：

```
inputs           ← 从文档 frontmatter/refs 读取数据
payload_example  ← API 请求体 JSON 骨架
defaults         ← 运行时默认值
node_mappings    ← ComfyUI 工作流用：参数注入到哪个节点
```

**模型 key 命名规则**：`{provider}.{名称}`

| provider | 含义 | API Key | 说明 |
|---|---|---|---|
| `volcengine` | 火山引擎 Ark | `ARK_API_KEY` | SeaDream(图) / Seedance(视频) |
| `siliconflow` | 硅基流动 | `SILICONFLOW_API_KEY` | Qwen(图) / Wan(视频) |
| `minimax` | 稀宇 MiniMax | `MINIMAX_API_KEY` | image-01(图) / Hailuo(视频) |
| `rhapi` | RunningHub 直连 REST | `RH_API_KEY` | 标准模型接口，如 Seedance |
| `rhworkflow-v1` | RunningHub 工作流 v1 | `RH_WORKFLOW_API_KEY` | 旧版 `/task/openapi/create` |
| `rhworkflow-v2` | RunningHub 工作流 v2 | `RH_WORKFLOW_API_KEY` | 新版 `/run/workflow/{apiId}` |
| `comfylocal` | 本地 ComfyUI | 不需要 | `http://127.0.0.1:8188/` |
| `webapp` | 浏览器自动化 | 按站点 | 如 Gemini |

---

## 一、配置结构详解

### 1.1 三层配置文件加载

```
cli/.opsv/api_config.yaml          ← 内置（shipped with CLI）
   ↓ 合并
~/.opsv/api_config.yaml            ← 用户级
   ↓ 合并（最高优先级）
<project>/.opsv/api_config.yaml   ← 项目级
```

### 1.2 完整配置模板

```yaml
models:
  {provider}.{name}:
    # 基本属性
    provider: {provider}        # 编译器/执行器类型
    type: imagen | video | comfy | webapp   # 产出类型
    model: "{model_name}"       # API 的 model 参数（payload 中发送）

    # 网络
    api_url: https://...        # 提交端点
    api_status_url: https://... # 状态查询端点（异步模式需要）

    # 认证
    required_env:
      - API_KEY_NAME            # 环境变量名

    # 功能声明（可选，影响编译行为）
    supports_reference_images: true
    max_reference_images: 5
    supports_first_image: true
    supports_reference_videos: true
    max_reference_videos: 3
    supports_reference_audios: true
    max_reference_audios: 3

    # === 输入映射（从文档数据到 API 参数） ===
    inputs:
      {参数名}:
        source: {数据来源}       # 见 1.3
        target: {注入位置}       # payload 中的 dot-path（可选）

    # === 工作流节点映射（仅 ComfyUI 类） ===
    node_mappings:
      {参数名}:
        nodeId: "{节点ID}"       # ComfyUI 节点编号
        fieldName: "{字段名}"    # 节点上的字段

    # === 默认参数值 ===
    defaults:
      {key}: {value}            # 运行时默认值

    # === 请求体模板（API payload JSON 骨架） ===
    payload_example:
      {key}: {value}            # 完整结构，见 1.4
```

### 1.3 inputs.source 支持的数据来源

| source 语法 | 读取位置 | 示例 |
|---|---|---|
| `prompt` | 文档 `frontmatter.prompt` | 主提示词 |
| `negative_prompt` | `payload.extra.negative_prompt` 或 defaults | 负向提示词 |
| `first_frame` | `payload.frame_ref.first` | 首帧图片路径 |
| `last_frame` | `payload.frame_ref.last` | 尾帧图片路径 |
| `refs[type]` | `refs.image` 的所有路径（数组） | 多张参考图 |
| `refs[type][N]` | `refs.image` 的第 N 个路径 | 单张参考图 |
| `reference_images[N]` | 传统引用图片数组（兼容） | 旧格式 |
| `default.{key}` | `modelConfig.defaults.{key}` | 配置默认值 |
| `job.payload.extra.{key}` | `payload.extra.{key}` | 任意自定义字段 |

### 1.4 payload_example 的作用

`payload_example` 定义 API 请求体的 JSON 骨架。编译器运行时：

1. 深拷贝 `payload_example` 作为初始 payload
2. 通过 `inputs` 将文档数据注入到对应位置
3. 合并 `defaults` 中的值

```yaml
# 无 payload_example 时：payload 形状由编译器代码硬编码
# 有 payload_example 时：完全由配置驱动

payload_example:
  model: "doubao-seedance-2-0-260128"
  content:
    - type: "text"
      text: ""
  duration: 5
  ratio: "16:9"
  generate_audio: true
  watermark: false
```

---

## 二、实战示例

### 2.1 根据 API 文档配置 rh-api.seedance

**API 文档**（`API/runninghub/RHapiseedance2.0多模态视频.md`）：

请求体示例：
```json
{
  "prompt": "@Image 1 图中的两个人...",
  "resolution": "720p",
  "duration": "5",
  "imageUrls": ["https://..."],
  "videoUrls": ["https://..."],
  "audioUrls": [],
  "generateAudio": true,
  "ratio": "adaptive",
  "realPersonMode": true,
  "seed": -1
}
```

**转化为 OPSV 配置**：

```yaml
rh-api.seedance:
  provider: rhapi
  type: video
  api_url: https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video
  api_status_url: https://www.runninghub.cn/openapi/v2/query
  required_env:
    - RH_API_KEY
  inputs:
    prompt:
      source: prompt
    image:
      source: refs[image]
      target: imageUrls
    video:
      source: refs[video]
      target: videoUrls
    audio:
      source: refs[audio]
      target: audioUrls
  defaults:
    resolution: "720p"
    duration: "5"
    ratio: "adaptive"
    generateAudio: true
    realPersonMode: true
    seed: -1
  # == payload_example ==
  payload_example:
    prompt: ""
    resolution: "720p"
    duration: "5"
    imageUrls: []
    videoUrls: []
    audioUrls: []
    generateAudio: true
    ratio: "adaptive"
    realPersonMode: true
    seed: -1
```

**配置推导过程**：

```
API 文档的请求体字段：
  prompt       → 来自文档 frontmatter.prompt
  resolution   → 固定值 "720p"，放 defaults
  duration     → 固定值 "5"，放 defaults
  imageUrls    → 来自 refs.image 的路径数组
  videoUrls    → 来自 refs.video 的路径数组
  audioUrls    → 来自 refs.audio 的路径数组
  generateAudio → 固定值 true，放 defaults
  ratio        → 固定值 "adaptive"，放 defaults
  seed         → 固定值 -1，放 defaults

inputs.target 决定数据注入到 payload 的哪个字段：
  refs[image] 是一个数组 → 目标字段 imageUrls 也是数组 ✓
  refs[video] 是数组 → videoUrls ✓
  refs[audio] 是数组 → audioUrls ✓
```

### 2.2 根据 API 文档配置导演台工作流

**API 文档**（`API/runninghub/runninghub-workflow-api-v2-opsv-导演台.md`）：

请求体示例：
```json
{
  "addMetadata": true,
  "nodeInfoList": [
    {"nodeId": "6", "fieldName": "text", "fieldValue": "prompt..."},
    {"nodeId": "46", "fieldName": "timeline_data", "fieldValue": "{\"segments\":[...]}"}
  ],
  "instanceType": "default",
  "usePersonalQueue": false
}
```

**工作流 JSON**（`opsv-packs/comfyui-workflows/opsv-导演台_api-id-2064630504955142146.json`）：

节点 46（LTXDirector）的 inputs 包含：`timeline_data`, `local_prompts`, `segment_lengths`, `guide_strength`, `frame_rate`, `global_prompt`, `duration_seconds`, `epsilon`, `custom_width`, `custom_height`, `display_mode`, `use_custom_audio` 等。

**转化为 OPSV 配置**：

```yaml
rh-workflow-v2.director:
  provider: rhworkflow-v2
  type: comfy
  api_url: https://api.runninghub.cn/run/workflow/2064630504955142146
  api_status_url: https://www.runninghub.cn/openapi/v2/query
  workflowId: "2064630504955142146"
  workflow: "opsv-packs/comfyui-workflows/opsv-导演台_api-id-2064630504955142146.json"
  required_env:
    - RH_WORKFLOW_API_KEY
  inputs:
    prompt:
      source: prompt
    timeline_data:
      source: job.payload.extra.timeline_data
    local_prompts:
      source: job.payload.extra.local_prompts
    segment_lengths:
      source: job.payload.extra.segment_lengths
    guide_strength:
      source: job.payload.extra.guide_strength
    frame_rate:
      source: job.payload.extra.frame_rate
    duration_seconds:
      source: job.payload.extra.duration_seconds
    global_prompt:
      source: job.payload.extra.global_prompt
    epsilon:
      source: job.payload.extra.epsilon
    use_custom_audio:
      source: job.payload.extra.use_custom_audio
    custom_width:
      source: job.payload.extra.custom_width
    custom_height:
      source: job.payload.extra.custom_height
    display_mode:
      source: job.payload.extra.display_mode
  node_mappings:
    prompt:
      nodeId: "6"
      fieldName: "text"
    timeline_data:
      nodeId: "46"
      fieldName: "timeline_data"
    local_prompts:
      nodeId: "46"
      fieldName: "local_prompts"
    segment_lengths:
      nodeId: "46"
      fieldName: "segment_lengths"
    guide_strength:
      nodeId: "46"
      fieldName: "guide_strength"
    frame_rate:
      nodeId: "46"
      fieldName: "frame_rate"
    duration_seconds:
      nodeId: "46"
      fieldName: "duration_seconds"
    global_prompt:
      nodeId: "46"
      fieldName: "global_prompt"
    epsilon:
      nodeId: "46"
      fieldName: "epsilon"
    use_custom_audio:
      nodeId: "46"
      fieldName: "use_custom_audio"
    custom_width:
      nodeId: "46"
      fieldName: "custom_width"
    custom_height:
      nodeId: "46"
      fieldName: "custom_height"
    display_mode:
      nodeId: "46"
      fieldName: "display_mode"
  defaults:
    addMetadata: false
    usePersonalQueue: false
    upload_method: base64
    epsilon: 0.5
    frame_rate: 24
    display_mode: "seconds"
    custom_width: 1920
    custom_height: 1080
    use_custom_audio: true
  # == payload_example ==
  payload_example:
    addMetadata: false
    nodeInfoList: []
    instanceType: "default"
    usePersonalQueue: false
```

**配置推导过程**：

```
1. API 文档说 payload 结构是 { addMetadata, nodeInfoList, instanceType, usePersonalQueue }
   → 这些放 payload_example

2. 工作流 JSON 有 node 6 (CLIPTextEncode) 和 node 46 (LTXDirector)
   → 需要 node_mappings 定义注入位置

3. 文档 frontmatter 中有 prompt, timeline_data, local_prompts 等字段
   → frontmatter 的自定义字段被 produce 命令自动放入 payload.extra
   → inputs.source = job.payload.extra.{fieldName} 读取
   → node_mappings 告诉 RunningHub 注入到哪个节点

4. 不需要 target（inputs 不设 target），因为值直接通过 node_mappings 注入
```

---

## 三、不同 provider 的配置要点

### 3.1 rh-api（直连 REST）

- 不需要 `node_mappings`
- `inputs` 中的 `target` 指定数据写入 payload 的哪个字段
- `payload_example` 定义完整的请求体结构
- 使用 `RH_API_KEY`

**配置流程**：
1. 看 API 文档的请求体示例 → 写 `payload_example`
2. 看请求参数说明（哪些来自文档、哪些固定） → 写 `inputs` + `defaults`
3. 看认证方式 → 写 `required_env`

### 3.2 rh-workflow-v1/v2（ComfyUI 工作流）

- 需要 `node_mappings` 定义参数到节点的映射
- `inputs` 只设 `source`（不设 `target`），值通过 `node_mappings` 注入
- `workflowId` 从 API 文档或工作流页面获取
- `workflow` 路径指向本地 `.json` 文件（用于本地调试）
- 使用 `RH_WORKFLOW_API_KEY`

**配置流程**：
1. 从 RunningHub 获取工作流的 `workflowId`（API URL 中的数字 ID）
2. 下载工作流 JSON → 分析有哪些节点和 inputs
3. 确定需要注入的节点 → 写 `node_mappings`
4. 确定文档 frontmatter 中的对应字段 → 写 `inputs`

### 3.3 volcengine（火山引擎）

- 不需要 `node_mappings`
- `payload_example` 定义请求体
- `supports_*` 标志影响编译行为（如 `supports_reference_images`）
- `quality_map` 提供 quality → size 映射
- 使用 `ARK_API_KEY`

### 3.4 comfylocal（本地 ComfyUI）

- 需要本地 `workflow` JSON 文件路径
- `node_mappings` 定义注入
- 不需要 API Key
- API URL 固定 `http://127.0.0.1:8188/`

---

## 四、使用 api-setup 命令

### 4.1 查看当前配置

```bash
opsv api-setup --list
# 输出所有模型 key 和它们的 provider/type/状态
```

### 4.2 添加新模型

```bash
# 添加 rh-api.seedance（直连 REST 视频模型）
opsv api-setup --add-model '{
  "modelKey": "rh-api.seedance",
  "config": {
    "provider": "rhapi",
    "type": "video",
    "api_url": "https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video",
    "api_status_url": "https://www.runninghub.cn/openapi/v2/query",
    "required_env": ["RH_API_KEY"],
    "supports_reference_images": true,
    "supports_reference_videos": true,
    "supports_reference_audios": true,
    "max_reference_images": 10,
    "max_reference_videos": 3,
    "max_reference_audios": 3,
    "defaults": {
      "resolution": "720p",
      "duration": "5",
      "ratio": "adaptive",
      "generateAudio": true,
      "seed": -1
    }
  }
}'
```

### 4.3 设置 API Key

```bash
# 交互式补全所有缺失的 key
opsv api-setup

# 设置单个 key
opsv api-setup --set-key RH_WORKFLOW_API_KEY=xxx

# Key 写入时自动 AES-256-GCM 加密（有 master.key 时）
```

### 4.4 同步环境变量

```bash
# 为所有 required_env 创建占位变量
opsv api-setup --sync-env
```

---

## 五、配置调试

### 5.1 编译验证（dry-run）

```bash
# 编译但不执行，观察生成的 task JSON
opsv produce --model rh-api.seedance --manifest ... --dry-run

# 输出示例：
# Compiled: shot_01 → opsv-queue/.../rh-api.seedance_001/shot_01.json
```

### 5.2 常见问题

| 问题 | 原因 | 修复 |
|------|------|------|
| `Model 'xxx' not found` | 模型 key 未在 api_config.yaml 注册 | 检查 provider.名称 拼写 |
| `Unknown provider: xxx` | provider 名不在编译器注册表中 | 必须是 volcengine/siliconflow/minimax/rhapi/rhworkflow-v1/rhworkflow-v2/comfylocal/webapp |
| `node_mapping is required` | rhworkflow 类没有 node_mappings | 运行 `opsv comfy-node-mapping` 生成 |
| `Missing API Key for model` | required_env 对应的环境变量未设 | `api-setup --set-key` 或写 .env |
| `"brief" is missing` | 文档没有 brief 字段 | 添加 brief 描述（warning 级别，非报错） |
| `prompt 字段未注入到期望节点` | inputs 的 source 路径不对 | 检查 `job.payload.extra.{field}` 是否存在 |

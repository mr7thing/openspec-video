# RunningHub 能力 → 端点映射（rhcli provider）

> 来源：提炼自 [OpenClaw_RH_Skills](https://github.com/HM-RunningHub/OpenClaw_RH_Skills) 的
> `data/capabilities.json`（2026-08-01 版，394 端点）、`SKILL.md` 路由表与
> `references/video-models.md` / `image-models.md` 策展菜单。
> 本文档是**可漂移的知识文档**，运行时零依赖；端点可用性以 `rh model list` / `rh model info <endpoint>` 实时查询为准。

opsv 的 `rhcli` provider 通过子进程调用 [RH_CLI](https://github.com/HM-RunningHub/RH_CLI)（`rh --json model run -e <endpoint>` / `rh app run <webappId>`）执行生产。
每个 opsv capability 在 `cli/.opsv/api_config.yaml` 中对应一个 `rhcli.*` 模型条目，端点 ID 填在 `rh.endpoint_id`。

## 通用约定

- **认证**：`RUNNINGHUB_API_KEY`（`fallback_env: RH_API_KEY` 自动兼容存量配置）。
- **严格兼容性检查**：每次采用一个 `rhcli.*` 模型前，OPSV 都会调用 `rh --json check`，且只接受如下最小契约：
  ```json
  { "status": "ready", "capabilities": ["json-check", "model-run"] }
  ```
  app 模型要求 `app-run`。配置中的 `rh.required_capabilities` 可以额外收紧要求；不兼容的同名 `rh` 二进制会被禁用，**不会**继续尝试执行。
- **供应商通道边界**：正常生成始终是 `OPSV → rh 子进程 → RunningHub`。OPSV 不复制 RH CLI 的提交、上传、轮询或重试实现。
- **文件输入**：本地文件必须通过 RH CLI 的媒体 flag 进入上游；URL 作为参数原样透传。模型配置声明了 `rh.media_bindings` 时，它是本地媒体字段的完整 allowlist：新增本地媒体字段必须同步声明，否则任务在 spawn 前失败，不会静默变成 `--param`。
- **参数类型**：`--param k=v`；数组/对象值由 rhcli provider 自动 JSON 序列化。
- **成本**：rh 的 JSON 输出含 `cost`（元）与 `duration`（秒），opsv 会记入任务 `.log`。

## 恢复、重试与供应商切换

RH CLI 是 blocking subprocess；在它退出以前，OPSV 通常拿不到可靠的 RunningHub task id。因此启动子进程前会写入 `submitted-unknown` checkpoint：如果进程超时、崩溃或输出不完整，OPSV 不会自动重跑、也不会自动切换其他供应商，避免重复提交和重复扣费。

只有 `.log` 已经包含**真实** task id，且 `provider`、模型、模式、payload SHA-256 与 credential scope 都匹配时，OPSV 才会调用 RunningHub 的**只读** query/download recovery path 收敛结果；这个恢复 adapter 不包含 submit 或 upload。旧日志里的 `rhcli://...` 只是本地描述符，绝不是 task id，不能自动恢复。远端明确返回 terminal failed 时，才可安全重试或交给其他供应商。

要有意重新提交 `submitted-unknown` 的任务，必须由操作者使用显式 force 流程并接受可能重复扣费的风险；这不是普通 `--retry` 的语义。

## 配置媒体与 AI 应用

模型模式的媒体 binding 示例：

```yaml
rh:
  mode: model
  endpoint_id: "rhart-video-v3.1-fast/image-to-video"
  required_capabilities: [json-check, model-run]
  media_bindings:
    imageUrls: { kind: image, target: images, cardinality: { max: 1 } }
```

app 模式要求每一个非空 payload 字段都有 `node_mappings`，或显式列入 `rh.ignorable_inputs`；OPSV 不会 warning 后丢弃字段。内置 `rhcli.ai-app` 是不可执行模板，必须复制到项目配置、替换真实 `app_id` 与 node IDs 后才能使用。

## 能力映射总表

| opsv capability | rhcli 模型条目 | 默认端点（`rh.endpoint_id`） | 输出 | 备选端点 |
|---|---|---|---|---|
| `image-generation` | `rhcli.t2i` | `rhart-image-n-pro/text-to-image` | image | `seedream-v5-lite/text-to-image`（写实）、`youchuan/text-to-image-v7`（MJ 风）、`alibaba/wan-2.7/text-to-image-pro` |
| `image-editing` | `rhcli.i2i` | `rhart-image-n-pro/edit` | image | `alibaba/qwen-image-2.0-pro/image-edit`（AI 编辑）、`rhart-image-n-g31-flash-official/image-to-image` |
| `video-generation` | `rhcli.t2v` | `rhart-video-v3.1-fast/text-to-video` | video | `kling-v3.0-pro/text-to-video`（人物运动）、`rhart-video/sparkvideo-2.0/text-to-video`（Seedance 2.0，最长 15s/4K/自动配音）、`alibaba/wan-2.7/text-to-video` |
| `image-to-video` | `rhcli.i2v` | `rhart-video-v3.1-fast/image-to-video` | video | `kling-v3.0-pro/image-to-video`、`rhart-video/sparkvideo-2.0/image-to-video` |
| `continuous-i2v` | `rhcli.i2v`（复用） | 同上 | video | opsv 侧尾帧→首帧链式调用，端点同 i2v |
| `tts` | `rhcli.tts` | `rhart-audio/text-to-audio/speech-2.8-hd` | audio | `rhart-audio/text-to-audio/speech-2.8-turbo`（快）、`bytedance/doubao-seed-tts-2.0`、`alibaba/qwen3-tts-flash` |
| `music` | `rhcli.music` | `rhart-audio/text-to-audio/music-2.5` | audio | `rhart-audio/suno-v5.5/single`（描述式）、`rhart-audio/suno-v5.5/custom`（标题+歌词+风格） |
| `voice-clone` | `rhcli.voice-clone` | `rhart-audio/text-to-audio/voice-clone` | audio | `mureka-ai/vocal-clone` |
| `upscale` | `rhcli.upscale-image` | `topazlabs/image-upscale-standard-v2` | image | `topazlabs/image-upscale-high-fidelity-v3`、`topazlabs/image-upscale-detail-faces`（人脸） |
| `video-upscale` | `rhcli.upscale-video` | `rhart-video/video-upscaler` | video | `topazlabs/video-upscale`（含 targetFps） |
| `video-extend` | `rhcli.video-extend` | `rhart-video-v3.1-pro-official/video-extend` | video | `alibaba/wan-2.7/video-extend`、`rhart-video-v3.1-fast-official/video-extend`（更快） |
| `motion-control` | `rhcli.motion-control` | `kling-v3.0-pro/motion-control` | video | `kling-v3.0-std/motion-control`、`kling-v2.6-pro/motion-control` |
| `3d-generation` | `rhcli.t23d` / `rhcli.i23d` | `hunyuan3d-v3.1/text-to-3d` / `hunyuan3d-v3.1/image-to-3d` | 3d | `meshy6/text-to-3d`、`hitem3d-v2/image-to-3d` |
| `ai-app` | `rhcli.ai-app` | （按项目填 `rh.app_id`，无默认） | 任意 | 任意 RunningHub AI 应用（ComfyUI 云端工作流） |

## 端点参数速查

`*` = required。LIST 类型给默认值+可选项。数组型文件参数（`imageUrls` 等）可传单个路径。

### `rhart-image-n-pro/text-to-image`（全能图片PRO · t2i 默认）
- `prompt: STRING*`
- `resolution: LIST* = 1k`（`1k`/`2k`/`4k`）
- `aspectRatio: LIST = 9:16`（`1:1`/`16:9`/`9:16`/`4:3`/`3:4`…）

### `rhart-image-n-pro/edit`（图生图/编辑默认）
- `imageUrls: IMAGE*`（源图，本地路径或 URL）
- `prompt: STRING*`
- `resolution: LIST* = 1k`；`aspectRatio: LIST = empty`（`empty` = 跟随原图）

### `rhart-video-v3.1-fast/text-to-video`（全能视频V3.1 Fast · t2v 默认）
- `prompt: STRING*`
- `aspectRatio: LIST* = 9:16`（`16:9`/`9:16`）
- `resolution: LIST* = 720p`（`720p`/`1080p`/`4k`）
- `duration: LIST = 8`（秒）

### `rhart-video-v3.1-fast/image-to-video`（i2v 默认）
- `imageUrls: IMAGE*`（首帧图）
- `prompt: STRING*`（可描述运动）
- `aspectRatio: LIST* = 16:9`；`resolution: LIST* = 720p`；`duration: LIST = 8`

### `rhart-audio/text-to-audio/speech-2.8-hd`（TTS 默认，minimax）
- `text: STRING*`
- `voice_id: STRING* = Wise_Woman`
- `enable_base64_output: BOOLEAN* = false`、`english_normalization: BOOLEAN* = false`
- `speed: FLOAT = 1.0`、`pitch: INT = 0`、`emotion: LIST = happy`

### `rhart-audio/text-to-audio/music-2.5`（音乐默认，minimax）
- `prompt: STRING*`（风格描述）
- `lyrics: STRING*`（带结构标记 `[Intro]/[Verse]/[Chorus]…`）
- `bitrate: LIST = 256000`、`sampleRate: LIST = 44100`

### `rhart-audio/text-to-audio/voice-clone`（声音克隆默认）
- `audio: AUDIO*`（数秒参考音频）
- `custom_voice_id: STRING*`（克隆音色命名）
- `text: STRING*`（要合成的文本）
- `model: LIST* = speech-02-hd`；`need_noise_reduction`/`need_volume_normalization: BOOLEAN* = false`

### `topazlabs/image-upscale-standard-v2`（图像超分默认）
- `imageUrl: IMAGE*`
- `scale: LIST* = 2x`（`2x`/`4x`/`6x`）
- `faceEnhancement: BOOLEAN = true`、`faceEnhancementStrength: FLOAT = 0.8`

### `rhart-video/video-upscaler`（视频超分默认）
- `videoUrl: VIDEO*`
- `targetResolution: LIST* = 1080p`（`720p`/`1080p`/`2k`/`4k`）

### `rhart-video-v3.1-pro-official/video-extend`（视频续写默认）
- `video: VIDEO*`（源视频）
- `resolution: LIST* = 720p`（`720p`/`1080p`）
- `prompt: STRING`（续写引导，可选）；`seed: INT`

### `kling-v3.0-pro/motion-control`（动作迁移默认）
- `imageUrl: IMAGE*`（角色形象）
- `videoUrl: VIDEO*`（动作参考视频）
- `characterOrientation: LIST* = video`（`image`/`video`）
- `keepOriginalSound: BOOLEAN = true`

### `hunyuan3d-v3.1/text-to-3d` / `image-to-3d`（3D 默认）
- t2 3d：`prompt: STRING*`；i2 3d：`imageUrl: IMAGE*`（可加 `left/right/back/top/bottom ImageUrl` 多视角）
- `enablePbr: BOOLEAN* = false`；`generateType: LIST* = Normal`（`Normal`/`Geometry`/`Sketch`）
- `faceCount: INT = 500000`

## AI 应用模式（`rh app run`）

`rh app run <webappId> --node "nodeId:fieldName=value" --file "nodeId:fieldName=/path"` 可运行任意 RunningHub AI 应用。
rhcli 的 `mode: app` 复用 opsv 现有 `node_mappings`（`{nodeId, fieldName}`）机制做 payload 键 → 节点字段的映射：

```yaml
rhcli.my-app:
  provider: rhcli
  type: comfy
  required_env: [RUNNINGHUB_API_KEY]
  fallback_env: [RH_API_KEY]
  rh: { mode: app, app_id: "1877265245566922800" }
  node_mappings:
    prompt: { nodeId: "52", fieldName: "prompt" }   # → --node "52:prompt=..."
    image:  { nodeId: "39", fieldName: "image" }    # 本地路径 → --file "39:image=./photo.jpg"
```

节点 ID 与字段名用 `rh app info <webappId或链接>` 查询。与原生 `rhworkflow-v2` 的关系：
- **rhworkflow-v2**： opsv 直接驱动 HTTP，resume 完整、可逐节点精细控制，适合高频固定工作流。
- **rhcli app 模式**：零 API 代码、智能上传、节点编辑即用即走，适合长尾/探索性工作流。

## 视频/图片模型选择向导（上游策展菜单摘要）

**视频**（t2v/i2v 通用，替换 `rhcli.t2v`/`rhcli.i2v` 的 endpoint_id 即可）：

| 场景 | 端点 |
|---|---|
| 默认/性价比 | `rhart-video-v3.1-fast/*` |
| 创意天花板（Grok） | `rhart-video-g/*` |
| 人物运动自然 | `kling-v3.0-pro/*` |
| 电影感风景 | `rhart-video-v3.1-pro/*` |
| 最长 15s/4K/自动配音/真人 | `rhart-video/sparkvideo-2.0/*`（Seedance 2.0；`generateAudio`、`realPersonMode` 参数） |
| 多模态混输（图+视频+音频） | `rhart-video/sparkvideo-2.0/multimodal-video`（也可走原生 `rh-api.seedance`） |

**图片**：

| 场景 | 端点 |
|---|---|
| 默认综合 | `rhart-image-n-pro/text-to-image` |
| 最快最便宜 | `rhart-image-n-g31-flash/text-to-image` |
| Midjourney 风 | `youchuan/text-to-image-v7`（无图生图） |
| 语义/编辑稳 | `rhart-image-g-2/*` |
| 写实照片 | `seedream-v5-lite/*` |
| AI 编辑（换背景/去人） | `alibaba/qwen-image-2.0-pro/image-edit` |

## 提示词建议（上游经验）

- 提示词**用英文**效果最佳，即使用户输入中文也应先增强改写。
- 短视频默认 5–8 秒、16:9（竖屏内容 9:16）。
- 失败重试顺序建议：V3.1 Fast → 可灵 → 海螺（上游实测的稳定性排序）。

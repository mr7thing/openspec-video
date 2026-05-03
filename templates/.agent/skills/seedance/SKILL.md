---
name: seedance
description: Seedance 2.0 视频生成专家。精通火山方舟 Seedance 2.0/2.0 fast Content Generation API 的全部能力、content[] 数组构建规则、多模态参考注入、首尾帧控制、视频编辑与延长，以及提示词写法公式。
---

# Seedance 2.0 视频生成技能

## 模型概览

| 模型 | Model ID | 品质 | 速度 | API |
|------|----------|------|------|-----|
| Seedance 2.0 | `doubao-seedance-2-0-260128` | 最高 | 标准 | Content Generation |
| Seedance 2.0 fast | `doubao-seedance-2-0-fast-260128` | 良好 | 更快 | Content Generation |

两个模型能力完全相同，仅品质/速度权衡不同。

## API 端点

| 操作 | 方法 | URL |
|------|------|-----|
| 提交任务 | POST | `/api/v3/contents/generations/tasks` |
| 查询状态 | GET | `/api/v3/contents/generations/tasks/{task_id}` |

状态值：`queued` → `running` → `succeeded` / `failed`

任务 ID 来源：响应体 `data.id`（注意不是 `data.task_id`）

## 五种使用场景

### 1. 文生视频 (T2V) — 纯文本 → 视频
最基础模式。仅提供文本提示词生成视频。

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "一只金色的骏马在草原上奔跑，镜头缓慢推近" }
  ],
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true,
  "watermark": false
}
```

### 2. 图生视频 — 首帧 / 首尾帧
通过 `role: "first_frame"` / `role: "last_frame"` 严格保障帧一致性。

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "镜头缓慢推近，人物微笑转身" },
    { "type": "image_url", "image_url": { "url": "https://..." }, "role": "first_frame" },
    { "type": "image_url", "image_url": { "url": "https://..." }, "role": "last_frame" }
  ],
  "ratio": "16:9",
  "duration": 5
}
```

**关键**：首尾帧必须用 `first_frame`/`last_frame` role，不能用 `reference_image`。

### 3. 多模态参考 — 图+视频+音频 → 视频
继承参考图的角色/风格/构图、参考视频的动作/运镜/特效、参考音频的音色/旋律/对话。

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "参考图片1的女孩，参考视频1的运镜，背景音使用音频1" },
    { "type": "image_url", "image_url": { "url": "https://图1" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://视频1" }, "role": "reference_video" },
    { "type": "audio_url", "audio_url": { "url": "https://音频1" }, "role": "reference_audio" }
  ],
  "ratio": "16:9",
  "duration": 8,
  "generate_audio": true
}
```

**不支持**的组合：
- "文本+音频"（无图/视频）❌
- "纯音频" ❌

### 4. 编辑视频
提供待编辑视频 + 参考图/音频 + 提示词，完成替换主体、增删元素、局部修复等。

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "将视频1礼盒中的香水替换成图片1中的面霜，运镜不变" },
    { "type": "video_url", "video_url": { "url": "https://原始视频" }, "role": "reference_video" },
    { "type": "image_url", "image_url": { "url": "https://替换物图" }, "role": "reference_image" }
  ],
  "ratio": "16:9",
  "duration": 5
}
```

### 5. 延长视频
向前/向后延长 1 段视频，或串联 2~3 段视频补全过渡。

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "视频1中的拱形窗户打开，进入美术馆室内，接视频2，之后镜头进入画内，接视频3" },
    { "type": "video_url", "video_url": { "url": "https://视频1" }, "role": "reference_video" },
    { "type": "video_url", "video_url": { "url": "https://视频2" }, "role": "reference_video" },
    { "type": "video_url", "video_url": { "url": "https://视频3" }, "role": "reference_video" }
  ],
  "ratio": "16:9",
  "duration": 10
}
```

视频延长说明：
- 2~3 段视频串联：模型自动截取首尾衔接部分，补全中间过渡
- 总时长最多 15 秒（输入视频 + 生成视频）

## `content[]` 数组规范

### 结构

```json
"content": [
  { "type": "text", "text": "<提示词>" },
  { "type": "image_url", "image_url": { "url": "<URL|Base64|asset://>" }, "role": "<role>" },
  { "type": "video_url", "video_url": { "url": "<URL>" }, "role": "<role>" },
  { "type": "audio_url", "audio_url": { "url": "<URL|Base64|asset://>" }, "role": "<role>" }
]
```

### 数量限制

| 模态 | 最大数量 | role 值 |
|------|---------|---------|
| text | 1 | — |
| image_url | 9 | `reference_image` / `first_frame` / `last_frame` |
| video_url | 3 | `reference_video` |
| audio_url | 1 | `reference_audio` |

### role 详解

| role | 用途 | 保真度 |
|------|------|--------|
| `reference_image` | 普通参考图（风格/元素/角色参考） | 参考级 |
| `first_frame` | 首帧控制（严格匹配输入图） | 高保真 |
| `last_frame` | 尾帧控制（严格匹配输入图） | 高保真 |
| `reference_video` | 视频参考（动作/运镜/特效） | — |
| `reference_audio` | 音频参考（音色/旋律/对话） | — |

### URL 格式

| 格式 | 示例 | 说明 |
|------|------|------|
| HTTPS URL | `https://example.com/img.png` | 公网可访问 |
| Base64 Data URI | `data:image/png;base64,...` | 图片/音频支持，视频**不支持** |
| Asset URI | `asset://<asset_id>` | 预置虚拟人像/已授权真人素材 |

### 提示词中的指代规则

使用「素材类型 + 序号」指代，序号按 content 数组中**同类素材出现顺序从1起**：

- `图片1` → 第1个 `type: "image_url"` 的素材
- `视频2` → 第2个 `type: "video_url"` 的素材
- `音频1` → 第1个 `type: "audio_url"` 的素材
- **不可用** `asset://ID` 指代，只能用序号

## 完整参数速查

| 参数 | 类型 | 可选值 | 默认值 | 说明 |
|------|------|--------|--------|------|
| `model` | string | 见模型概览 | 必填 | 模型 ID |
| `content` | array | — | 必填 | 多模态内容数组 |
| `ratio` | string | `"16:9"`, `"9:16"`, `"1:1"` | `"16:9"` | 视频宽高比 |
| `duration` | int | `5`, `8`, `10` | `5` | 视频时长（秒） |
| `generate_audio` | bool | `true`, `false` | `true` | 是否生成音频 |
| `watermark` | bool | `true`, `false` | `false` | 是否添加水印 |
| `return_last_frame` | bool | `true`, `false` | `false` | 返回尾帧图像（OpsV 自动注入 `true`） |
| `tools` | array | `[{ type: "web_search" }]` | 无 | 联网搜索（仅纯文本输入） |

## 提示词写法公式

### 基础公式

```
主体 + 行为 + 环境 + [风格/色彩/光影] + [运镜] + [音效]
```

### 多模态参考公式

**图片参考**：
```
参考/提取/结合 +「图片 n」中的「主体/元素」，生成「画面描述」，保持「特征」一致
```

**视频参考**：
```
参考「视频 n」的「动作/运镜/特效」，生成「画面描述」，保持一致
```

**音频参考**：
- 音色参考：「角色」说："台词"，音色参考「音频 n」
- 音频内容：理想出现时机 +「音频 n」

### 编辑视频公式

- **增加元素**：清晰描述「元素特征」+「出现时机」+「出现位置」
- **删除元素**：点明删除目标，强调保持不变的元素
- **修改元素**：将「视频 n」中的「被更换元素」，替换为「理想元素」

### 延长视频公式

- **向前/向后延长**：向前/向后延长「视频 n」+「延长内容描述」
- **轨道补全**：「视频1」+「过渡描述」+ 接「视频2」+「过渡描述」+ 接「视频3」

### 提示词最佳实践

1. **分离主义**：图生视频时，描述"怎么动"而非"长什么样"（外观由参考图决定）
2. **机位优先**：必须指定摄影机运动，防止画面变成 PPT（如 `Dolly in`, `Pan right`, `Crane down`）
3. **物理精准**：动作描述遵循万有引力，极度具体
4. **全程英文**：视频模型对英文理解更好
5. **指代清晰**：多参考图时用"图片1/图片2"明确指代
6. **音视频协同**：如需生成有声视频，在提示词中描述音频时机和内容

### 联网搜索

仅适用于纯文本输入。设置 `tools: [{ type: "web_search" }]`，模型自主判断是否搜索。增加时延但提升时效性。

### 虚拟人像

写实用视频需真人面孔时，通过 `asset://<asset_id>` URL 引用预置虚拟人像或已授权真人素材。提示词中仍使用「图片 n」序号指代，不可用 Asset ID 指代。

**信任产物规则**：同账号下 Seedance 2.0 / Seedream 5.0 lite 生成的含人脸产物（30天内）可作为输入素材。

## 多模态输入限制

| 约束 | 限制 |
|------|------|
| 图片格式 | jpeg, png, webp, bmp, tiff, gif |
| 图片大小 | 单张 ≤ 10 MB |
| 图片宽高比 | [1/16, 16] |
| 图片总像素 | ≤ 36,000,000 |
| 视频格式 | mp4, webm, mov |
| 视频时长 | 单个 ≤ 30s |
| 视频大小 | ≤ 150 MB |
| 音频格式 | mp3, wav, m4a, aac, flac, ogg |
| 音频时长 | 单个 ≤ 60s |
| 音频大小 | ≤ 20 MB |
| 任务数据保留 | 24 小时 |
| 不支持的组合 | "文本+音频"、"纯音频" |

## OpsV 工作流集成

### 编译命令

```bash
# Seedance 2.0
opsv animate --model volcengine.seedance2 --circle circle2

# Seedance 2.0 fast
opsv animate --model volcengine.seedance2-fast --circle circle2
```

### Shot 文件 Frontmatter 格式

```yaml
---
category: shot-production
status: drafting
title: Shot 01 — 描述
duration: "5s"
first_frame: null
last_frame: null
refs:
  - "../../opsv-queue/.../参考图.png"
ref_videos:
  - "https://.../参考视频.mp4"
ref_audios:
  - "https://.../背景音.mp3"
visual_detailed: |
  提示词内容...
---
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `duration` | string | 视频时长，如 `"5s"` |
| `first_frame` | string / null | 首帧图片路径或 URL |
| `last_frame` | string / null | 尾帧图片路径或 URL |
| `refs` | string[] | 参考图片路径（相对路径或 @asset 引用） |
| `ref_videos` | string[] | 参考视频 URL（仅支持 HTTP URL） |
| `ref_audios` | string[] | 参考音频 URL（仅支持 HTTP URL） |

### 常见场景的 global_settings / payload 配置

```json
// 横屏 16:9, 5秒带音频
{ "global_settings": { "ratio": "16:9", "duration": 5, "generate_audio": true } }

// 竖屏 9:16, 8秒带音频
{ "global_settings": { "ratio": "9:16", "duration": 8, "generate_audio": true } }

// 方屏 1:1, 5秒无声
{ "global_settings": { "ratio": "1:1", "duration": 5, "generate_audio": false } }

// 首帧+尾帧控制 (在 shot 文件 frontmatter 中配置 first_frame / last_frame)
{ "frame_ref": { "first": "https://首帧图", "last": "https://尾帧图" } }
```

### 编译后 .json 示例 (I2V 首帧)

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "Camera slowly tracks forward, the girl turns and smiles" },
    { "type": "image_url", "image_url": { "url": "https://首帧图.png" }, "role": "first_frame" }
  ],
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true,
  "watermark": false,
  "return_last_frame": true,
  "_opsv": {
    "provider": "volcengine",
    "modelKey": "seedance-2.0",
    "type": "video",
    "shotId": "shot_01",
    "api_url": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "api_status_url": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "compiledAt": "2026-04-24T12:00:00.000Z",
    "references": ["https://首帧图.png"]
  }
}
```

### 编译后 .json 示例 (多模态参考)

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "参考图片1的女孩形象，参考视频1的运镜方式，背景音乐参考音频1" },
    { "type": "image_url", "image_url": { "url": "https://角色图.png" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://参考视频.mp4" }, "role": "reference_video" },
    { "type": "audio_url", "audio_url": { "url": "https://背景音.mp3" }, "role": "reference_audio" }
  ],
  "ratio": "16:9",
  "duration": 8,
  "generate_audio": true,
  "watermark": false,
  "return_last_frame": true,
  "_opsv": {
    "provider": "volcengine",
    "modelKey": "seedance-2.0",
    "type": "video",
    "shotId": "shot_02",
    "api_url": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "api_status_url": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "compiledAt": "2026-04-24T12:00:00.000Z",
    "references": ["https://角色图.png"]
  }
}
```

### 产物获取

OpsV 自动从成功响应中提取（遵循命名约定 `id_N_1.ext`）：
1. 视频 → `shot_01_1.mp4`（原始任务）或 `shot_01_2_1.mp4`（修改任务）
2. 封面/首帧 → `shot_01_first.png`
3. 尾帧 → `shot_01_last.png`（因 `return_last_frame: true`）

尾帧可用于下游 shot 的 `@FRAME:shot_XX_last` 首帧引用。

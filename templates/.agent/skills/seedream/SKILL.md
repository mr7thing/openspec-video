---
name: seedream
description: Seedream 5.0 lite 图像生成专家。精通火山方舟 Seedream 4.0-5.0 系列模型的全部能力、参数规范、尺寸规则与提示词写法，可指导 Agent 生成符合 API 规范的高质量图像请求。
---

# Seedream 图像生成技能

## 模型概览

| 模型 | Model ID | 分辨率 | 输出格式 | 提示词优化 |
|------|----------|--------|---------|-----------|
| Seedream 5.0 lite | `doubao-seedream-5-0-260128` | 2K, 3K | png, jpeg | standard |
| Seedream 4.5 | `doubao-seedream-4-5-251128` | 2K, 4K | jpeg | standard |
| Seedream 4.0 | `doubao-seedream-4-0-250828` | 1K, 2K, 4K | jpeg | — |

## 六种使用场景

### 1. 文生图 (T2I) — 纯文本 → 单图
最基础模式。提供清晰文字描述即可生成单张图片。

```
prompt: "充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子，
        色彩拼接丰富，眼部焦点锐利，景深较浅，
        具有Vogue杂志封面的美学风格"
size: "2048x2048"
```

### 2. 图文生图 (I2I) — 单图 + 文本 → 单图
基于已有图片，结合文字指令进行图像编辑。支持元素增删、风格转化、材质替换、色调迁移、改变背景/视角/尺寸等。

```
prompt: "保持模特姿势不变。将服装材质从银色金属改为完全透明的清水。
        透过液态水流，可以看到模特的皮肤细节。光影从反射变为折射。"
image: [{ url: "https://..." }]
size: "2048x2048"
```

### 3. 多图融合 — 多图 + 文本 → 单图
融合多张参考图的风格、元素特征。如衣裤鞋帽与模特图融合、人物与风景融合等。最多 14 张参考图。

```
prompt: "将图1的服装换为图2的服装"
image: [{ url: "https://图1" }, { url: "https://图2" }]
size: "2048x2048"
```

### 4. 文生组图 — 纯文本 → 多图
生成漫画分镜、品牌视觉等一组内容关联的图片。需设置 `sequential_image_generation: "auto"`。

```
prompt: "生成一组电影级科幻写实风的4张影视分镜：场景1为宇航员在空间站维修..."
size: "2K"
sequential_image_generation: "auto"
```

### 5. 单图生组图 — 单图 + 文本 → 多图
基于一张参考图生成一组关联图片。

```
prompt: "参考这个LOGO，做一套户外运动品牌视觉设计，品牌名称为GREEN，
        包括包装袋、帽子、卡片、挂绳等。绿色视觉主色调，趣味、简约现代风格。"
image: [{ url: "https://logo图" }]
size: "2K"
sequential_image_generation: "auto"
```

### 6. 多图生组图 — 多图 + 文本 → 多图
多张参考图 + 文本 → 一组关联图片。

```
prompt: "生成3张女孩和奶牛玩偶在游乐园开心地坐过山车的图片，涵盖早晨、中午、晚上"
image: [{ url: "https://图1" }, { url: "https://图2" }]
size: "2K"
sequential_image_generation: "auto"
```

## `size` 参数规范（5.0 lite）

**两种方式不可混用**，必须二选一。

### 方式1：分辨率别名（推荐组图场景）

模型根据 prompt 中的宽高比/形状描述自动判断输出像素。

| 别名 | 含义 | prompt 中建议描述 |
|------|------|------------------|
| `"2K"` | ~2K 级分辨率 | 宽高比、画面形状、用途（如"横向海报""竖屏手机壁纸"） |
| `"3K"` | ~3K 级分辨率 | 同上 |

```json
{ "prompt": "横向宽幅海报，科幻城市天际线...", "size": "2K" }
```

### 方式2：指定像素值（推荐精确控制场景）

默认值 `2048x2048`。约束：
- 宽高比范围：[1/16, 16]
- 总像素范围：[3,686,400, 10,404,496]（即 2560×1440 ~ ~3072²×1.1025）

**推荐像素值速查表（Seedream 5.0 lite）**：

| 宽高比 | 2K | 3K |
|--------|-----|-----|
| 1:1 | `2048x2048` | `3072x3072` |
| 3:4 | `1728x2304` | `2592x3456` |
| 4:3 | `2304x1728` | `3456x2592` |
| 16:9 | `2848x1600` | `4096x2304` |
| 9:16 | `1600x2848` | `2304x4096` |
| 3:2 | `2496x1664` | `3744x2496` |
| 2:3 | `1664x2496` | `2496x3744` |
| 21:9 | `3136x1344` | `4704x2016` |

### 常见错误

| 错误写法 | 问题 | 正确写法 |
|----------|------|---------|
| `size: "2K"` + 像素值意图 | 混用两种方式 | 选一种 |
| `size: "1920x1080"` | 不在推荐列表且低于最小像素 | `size: "2848x1600"` |
| `size: "1280x720"` | 总像素 921,600 < 最小值 3,686,400 | `size: "2048x2048"` |
| `size: "2K-Square"` | API 不存在此别名 | `size: "2048x2048"` |

## 完整参数速查

| 参数 | 类型 | 5.0 lite 可选值 | 默认值 | 说明 |
|------|------|----------------|--------|------|
| `model` | string | `doubao-seedream-5-0-260128` | 必填 | 模型 ID |
| `prompt` | string | — | 必填 | 提示词，建议 ≤300 汉字 / ≤600 英文单词 |
| `size` | string | 见上方规范 | `"2048x2048"` | 输出尺寸，两种方式不可混用 |
| `image` | array | `[{ url: "..." }]` | 无 | 参考图（最多 14 张），Provider 自动注入 |
| `steps` | int | — | 30 | 推理步数 |
| `cfg_scale` | float | — | 7.5 | CFG 引导强度 |
| `negative_prompt` | string | — | 无 | 负面提示词 |
| `output_format` | string | `png`, `jpeg` | `"png"` | 输出文件格式（仅 5.0 lite 支持） |
| `response_format` | string | `url`, `b64_json` | `"url"` | 返回格式 |
| `watermark` | bool | `true`, `false` | `false` | 右下角添加"AI生成"水印 |
| `stream` | bool | `true`, `false` | `false` | 流式输出（生成完任一图即返回） |
| `sequential_image_generation` | string | `"auto"` | 无 | 组图模式，设为 `"auto"` 开启 |
| `optimize_prompt_options` | object | `{ mode: "standard" }` | standard | 提示词优化（5.0 lite 仅支持 standard） |
| `tools` | array | `[{ type: "web_search" }]` | 无 | 联网搜索工具 |

## 参考图传入规范

| 约束 | 限制 |
|------|------|
| 支持格式 | jpeg, png, webp, bmp, tiff, gif |
| URL 方式 | 确保 URL 可公开访问 |
| Base64 方式 | `data:image/<格式>;base64,<编码>`，格式必须小写 |
| 宽高比范围 | [1/16, 16] |
| 宽高最小值 | > 14px |
| 单张大小 | ≤ 10 MB |
| 单张总像素 | ≤ 36,000,000 (6000×6000) |
| 最多参考图 | 14 张 |

## 提示词写法指南

### 基础公式

```
主体 + 行为 + 环境 + [风格/色彩/光影/构图]
```

用简洁连贯的自然语言写明核心要素。若对画面美学有要求，用短语补充美学元素。

### 提示词最佳实践

1. **字数控制**：≤300 汉字或 ≤600 英文单词。字数过多信息分散，模型只关注重点导致细节丢失
2. **多参考图指代**：使用"图1""图2"清晰指代每张参考图
   - 正确：`"将图1的服装换为图2的服装"`
   - 错误：`"把衣服换成另一张图的"`
3. **I2I 编辑指令**：明确指出保持什么不变、改变什么
   - 正确：`"保持模特姿势和液态服装的流动形状不变。将服装材质从银色金属改为清水"`
   - 错误：`"改成水的效果"`
4. **组图指令**：逐一描述每张图的内容和关联
5. **分辨率别名模式**：在 prompt 中描述宽高比/用途
   - `"横向宽幅海报"` → 模型倾向 16:9/21:9
   - `"竖屏手机壁纸"` → 模型倾向 9:16
   - `"方形头像"` → 模型倾向 1:1

### 联网搜索

设置 `tools: [{ type: "web_search" }]` 后，模型根据提示词自主判断是否搜索互联网内容。适用于需要实时信息的场景（如天气预报、新闻事件）。会增加一定时延。搜索次数通过 `usage.tool_usage.web_search` 查询。

### 流式输出

设置 `stream: true`，生成完任一图片后即返回结果，改善等待体验。组图场景尤其实用。

## OpsV 工作流集成

### 编译命令

```bash
# 文生图
opsv queue compile opsv-queue/videospec_zerocircle_1/imagen_jobs.json \
  --model volcengine.seadream-5.0-lite --circle zerocircle_1

# 使用别名
opsv queue compile opsv-queue/videospec_zerocircle_1/imagen_jobs.json \
  --model seedream --circle zerocircle_1
```

### 常见场景的 global_settings 配置

```json
// 宽屏分镜 (16:9, 2K)
{ "global_settings": { "size": "2848x1600" } }

// 竖屏海报 (9:16, 2K)
{ "global_settings": { "size": "1600x2848" } }

// 方形头像 (1:1, 2K)
{ "global_settings": { "size": "2048x2048" } }

// 超宽电影画幅 (21:9, 3K)
{ "global_settings": { "size": "4704x2016" } }

// 组图模式 (分辨率别名 + prompt 描述宽高比)
{ "global_settings": { "size": "2K", "sequential_image_generation": "auto" } }

// 联网搜索
{ "global_settings": { "tools": [{ "type": "web_search" }] } }
```

### 编译后的 .json 示例 (T2I)

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cinematic wide shot of a futuristic cityscape at dusk...",
  "size": "2848x1600",
  "steps": 30,
  "cfg_scale": 7.5,
  "negative_prompt": "blurry, low quality, distorted, deformed, ugly, bad anatomy, text, watermark, signature",
  "output_format": "png",
  "response_format": "url",
  "watermark": false,
  "stream": false,
  "_opsv": {
    "provider": "volcengine",
    "modelKey": "seadream-5.0-lite",
    "type": "image_generation",
    "shotId": "shot_01",
    "api_url": "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    "compiledAt": "2026-04-24T12:00:00.000Z"
  }
}
```

### 编译后的 .json 示例 (I2I 多图融合)

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "将图1的服装换为图2的服装",
  "size": "2048x2048",
  "steps": 30,
  "cfg_scale": 7.5,
  "output_format": "png",
  "response_format": "url",
  "watermark": false,
  "stream": false,
  "image": [
    { "url": "https://example.com/model_photo.png" },
    { "url": "https://example.com/clothing_ref.png" }
  ],
  "_opsv": {
    "provider": "volcengine",
    "modelKey": "seadream-5.0-lite",
    "type": "image_generation",
    "shotId": "shot_05",
    "api_url": "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    "compiledAt": "2026-04-24T12:00:00.000Z",
    "references": [
      "https://example.com/model_photo.png",
      "https://example.com/clothing_ref.png"
    ]
  }
}
```

## 使用限制

| 项目 | 限制 |
|------|------|
| 任务数据保留 | 24 小时后自动清除 |
| RPM 限流 | 按模型版本区分，详见模型价格文档 |
| 输入图格式 | jpeg, png, webp, bmp, tiff, gif |
| 输入图大小 | 单张 ≤ 10 MB |
| 参考图上限 | 14 张 |
| Base64 格式前缀 | `data:image/<格式>;base64,`（格式小写） |

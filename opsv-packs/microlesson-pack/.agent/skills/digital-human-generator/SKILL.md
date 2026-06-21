---
name: digital-human-generator
description: 数字人生成 — 基于 LTX2.3 ComfyUI 工作流，通过 RunningHub API 生成音频驱动的数字人 talking head 视频。支持角色照片 + 背景图 + 语音驱动的完整管线。
---

# 数字人生成 (Digital Human Generator)

> **阶段**: S3 · 数字人生成
> **输入**: S2 dh_plan.md（触发列表 + 背景配置 + 生成队列）
> **产出**: `videospec/lessons/{lesson_id}/assets/dh_{slide_id}.mp4`
> **验收**: 数字人视频文件存在且时长符合预期

---

## 1. 职责边界

**你做**：
- 消费 S2 dh_plan.md 中的每个生成任务
- 为每个任务：
  1. 读取语音稿，通过 TTS 生成音频（mp3）
  2. 根据 dh_position 裁剪背景图
  3. 准备角色照片
  4. 构建 ComfyUI 工作流参数
  5. 调用 RunningHub API 执行 LTX2.3 工作流
  6. 下载生成的数字人视频
- 将生成的视频保存到 `assets/dh_{slide_id}.mp4`

**你不做**：
- 规划哪些页面需要数字人（那是 S2 的事）
- 编写 Remotion 代码（那是 S4 的事）
- 生成 PPT 图片（用户提供）

---

## 2. 触发条件

- S2 dh_plan.md 已 `approved`
- 用户已提供：
  - 角色照片（character.png）
  - 背景图（bg.png）
  - RunningHub API Key（配置在环境变量中）

---

## 3. 工作流程

```
S2 dh_plan.md（生成队列）
      │
      ▼
┌──────────────────────────────────────┐
│ 对每个触发任务（逐个或批量）:         │
│                                      │
│ Step 1: TTS 生成音频（VoxCPM2）        │
│   - 读取 transcript 文件              │
│   - 调用本地 crispasr voxcpm2 后端    │
│   - 输出: audio/{slide_id}.wav        │
│   - 如需音色克隆: --voice ref.wav     │
│                                      │
│ Step 2: 背景裁剪                     │
│   - 根据 dh_position 裁剪 bg.png      │
│   - center → bg_center.png           │
│   - right → bg_right.png             │
│                                      │
│ Step 3: 构建 ComfyUI 工作流参数       │
│   - character_photo → LoadImage       │
│   - background → ResizeImageKJv2      │
│   - audio → LoadAudioUI               │
│   - prompt → 数字人动作描述           │
│   - 分辨率/时长等参数                 │
│                                      │
│ Step 4: 调用 RunningHub API           │
│   - POST /api/v1/comfyui/generate    │
│   - 上传工作流 + 参数                 │
│   - 轮询任务状态                      │
│   - 下载结果视频                      │
│                                      │
│ Step 5: 保存输出                     │
│   - 保存到 assets/dh_{slide_id}.mp4  │
│   - 记录视频时长、分辨率              │
│   - 更新 dh_plan.md 状态              │
└──────────────────────────────────────┘
```

---

## 4. RunningHub API 调用规范

### 4.1 API 端点

```
POST https://www.runninghub.cn/api/v1/comfyui/generate
```

### 4.2 请求头

```
Authorization: Bearer {RUNNINGHUB_API_KEY}
Content-Type: application/json
```

### 4.3 请求体

```json
{
  "api_type": "comfyui",
  "workflow": { ... },  // LTX2.3 工作流 JSON
  "inputs": {
    "character_photo": "base64或URL",
    "background_image": "base64或URL",
    "audio_file": "base64或URL",
    "prompt": "数字人动作描述",
    "width": 1280,
    "height": 720,
    "fps": 30,
    "duration_seconds": 5,
    "switch_text2video": false
  }
}
```

### 4.4 轮询状态

```
GET https://www.runninghub.cn/api/v1/comfyui/task/{task_id}
```

返回状态：`pending` → `running` → `completed` / `failed`

---

## 5. ComfyUI 工作流参数映射

基于 `comfyui-workflows/opsv-ltx2.3-digital-human_api.json`：

| LTX2.3 节点 ID | 节点类型 | 可配置参数 | 默认值 |
|---------------|---------|-----------|--------|
| 269 | LoadImage | `image` (角色照片) | - |
| 290 | ResizeImageMaskNode | `input` (背景图) | - |
| 345 | ImageResizeKJv2 | `width`, `height` | 1280×720 |
| 366 | LoadAudioUI | `audio_file` (TTS音频) | - |
| 303 | PrimitiveStringMultiline | `value` (prompt) | "数字人面向镜头自然讲解" |
| 302 | PrimitiveBoolean | `value` (switch_text2video) | false |
| 281 | CheckpointLoaderSimple | `ckpt_name` | ltx-2.3-22b-distilled.safetensors |
| 346 | Int | `value` (fps) | 30 |

### 5.1 工作流修改策略

每次生成前，需要：
1. 加载基础工作流 JSON
2. 替换以下节点参数：
   - `269.inputs.image` → 角色照片
   - `345.inputs.image` → 背景图
   - `366.inputs.audio` → TTS 音频
   - `303.inputs.value` → 动作 prompt
   - `347.inputs.value` → 宽度（根据 dh_position 调整）
3. 提交到 RunningHub

---

## 6. 输出格式

每个数字人生成任务完成后，生成：

```
videospec/lessons/{lesson_id}/assets/dh_{slide_id}.mp4
```

并在 `dh_plan.md` 中更新状态：

```yaml
generation_results:
  - slide_id: slide-01-01
    status: completed
    video_path: assets/dh_slide-01-01.mp4
    duration_seconds: 5.2
    frames: 156
    prompt_used: "数字人面向镜头，自然讲解"
  - slide_id: slide-01-04
    status: completed
    video_path: assets/dh_slide-01-04.mp4
    duration_seconds: 3.8
    frames: 114
    prompt_used: "数字人侧身面向左侧PPT，右手指示"
  - slide_id: slide-01-08
    status: failed
    error: "音频文件过长，超过LTX2.3最大时长限制"
    retry_after: "拆分语音稿或使用短片段"
```

---

## 7. 注意事项

1. **时长限制**: LTX2.3 单次生成有最大时长限制（通常 5-10 秒）。如果语音稿超过此限制，需要：
   - 方案 A: 拆分语音稿为多段，生成多个数字人视频
   - 方案 B: 使用静音片段填充，保持数字人视频时长与 PPT 展示时间一致

2. **背景一致性**: 数字人生成的背景必须与 Remotion 中的背景图完全一致。因此：
   - 先生成背景裁剪图
   - 将裁剪图传给 LTX2.3 工作流
   - Remotion 使用同一张裁剪图作为底层

3. **角色一致性**: 角色照片在整个课程中保持一致。确保使用同一张 character.png。

4. **TTS 引擎**: 使用本地 CrispASR voxcpm2 后端，命令示例：

   ```bash
   # 中性音色
   crispasr --tts "你的文本" --backend voxcpm2 --model /path/to/voxcpm2.gguf --tts-output output.wav

   # 音色克隆（需 --i-have-rights）
   crispasr --tts "你的文本" --backend voxcpm2 --model /path/to/voxcpm2.gguf \
     --voice speaker.wav --ref-text "参考文本" --i-have-rights --tts-output output.wav
   ```

   批量处理可使用脚本 `scripts/tts-batch.sh`。

5. **批量生成**: 可以并行生成多个数字人视频以加速处理，但要注意 RunningHub 的并发限制。

6. **错误重试**: 如果生成失败，检查：
   - 音频文件是否存在且格式正确
   - 角色照片是否清晰
   - 背景图尺寸是否符合要求
   - RunningHub API 是否正常

---
name: remotion-renderer
description: Remotion渲染 — 执行 Remotion 渲染命令，将 React 组件编译为最终微课视频 MP4。支持本地渲染和远程渲染。
---

# Remotion 渲染 (Remotion Renderer)

> **阶段**: S5 · Remotion 渲染
> **输入**: S4 remotion/index.tsx + 所有素材文件
> **产出**: `output/{lesson_id}.mp4`（最终微课视频）
> **验收**: 视频文件存在，分辨率 1920×1080，时长符合预期

---

## 1. 职责边界

**你做**：
- 确认所有前置资源就绪（PPT 图片、数字人视频、背景图、Remotion 组件）
- 执行 `remotion render` 命令渲染视频
- 处理渲染过程中的错误
- 输出最终 MP4 文件
- 可选：录制屏幕作为备选方案

**你不做**：
- 编写 Remotion 组件（那是 S4 的事）
- 生成数字人视频（那是 S3 的事）
- 处理 PPT 图片（S1 已组织）

---

## 2. 触发条件

- S4 remotion/index.tsx 已生成并通过 `remotion studio` 预览验证
- 所有素材文件存在于正确路径
- Remotion 项目已安装依赖（`npm install`）

---

## 3. 工作流程

```
S4 Remotion 组件 + 所有素材
         │
         ▼
┌──────────────────────────────────────┐
│ Step 1: 验证前置条件                  │
│   - 检查 remotion/index.tsx 存在      │
│   - 检查所有图片素材存在              │
│   - 检查所有数字人视频存在            │
│   - 检查 package.json 有 remotion 依赖│
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: 安装依赖（首次）              │
│   cd remotion-project                 │
│   npm install                         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 3: 本地渲染                      │
│   npx remotion render \               │
│     ./src/index.tsx \                 │
│     LessonComposition \               │
│     ./output/lesson-01.mp4 \          │
│     --props=./props.json              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 4: 验证输出                      │
│   - 检查输出文件存在                  │
│   - 检查分辨率 1920×1080              │
│   - 检查时长符合预期                  │
│   - 播放测试（可选）                  │
└──────────────────────────────────────┘
```

---

## 4. 渲染命令

### 4.1 本地渲染（推荐开发阶段使用）

```bash
cd /path/to/remotion-project

npx remotion render \
  ./src/lessons/lesson-01/index.tsx \
  LessonComposition \
  ./output/lesson-01.mp4 \
  --props='{"slides":[...],"bgImage":"../assets/bg.png","totalDuration":3000}' \
  --image-format=jpg \
  --codec=h264
```

### 4.2 批量渲染

```bash
# 渲染所有课程
for lesson in videospec/lessons/*/; do
  lesson_id=$(basename "$lesson")
  npx remotion render \
    "./src/lessons/${lesson_id}/index.tsx" \
    LessonComposition \
    "./output/${lesson_id}.mp4" \
    --codec=h264
done
```

### 4.3 远程渲染（生产环境）

```bash
# 使用 Remotion Cloud
npx remotion render-remote \
  ./src/index.tsx \
  LessonComposition \
  --codec=h264
```

---

## 5. Props 文件生成

渲染前需要生成 props.json，包含所有 slide 数据：

```json
{
  "slides": [
    {
      "id": "slide-01-01",
      "trigger": "intro",
      "dhPosition": "center",
      "durationFrames": 300,
      "imagePath": "../../assets/slides/lesson-01-slide-01-01.png",
      "dhVideoPath": "../../assets/dh_slide-01-01.mp4"
    },
    {
      "id": "slide-01-02",
      "trigger": "none",
      "dhPosition": null,
      "durationFrames": 180,
      "imagePath": "../../assets/slides/lesson-01-slide-01-02.png",
      "dhVideoPath": null
    },
    ...
  ],
  "bgImage": "../../assets/bg.png",
  "totalDuration": 4500
}
```

---

## 6. 备选方案：屏幕录制

如果 Remotion 渲染遇到问题，可以使用屏幕录制作为备选：

```bash
# 1. 启动 Remotion Studio
npx remotion studio ./src/index.tsx

# 2. 使用 OBS 或其他录屏软件录制浏览器窗口
# 3. 导出为 MP4
```

---

## 7. 输出验证

渲染完成后，验证：

```bash
# 检查文件存在
ls -la output/lesson-01.mp4

# 检查视频信息
ffprobe -v error -show_entries stream=width,height,duration,r_frame_rate \
  -of json output/lesson-01.mp4

# 预期输出：
# {
#   "streams": [{
#     "width": 1920,
#     "height": 1080,
#     "duration": "150.000",
#     "r_frame_rate": "30/1"
#   }]
# }
```

---

## 8. 注意事项

1. **内存**: 1920×1080 @ 30fps 的视频渲染需要较多内存。如果渲染慢，考虑降低分辨率或使用远程渲染。

2. **编码**: 使用 `--codec=h264` 确保兼容性。如需更小文件，可使用 `--codec=libvpx-vp9`。

3. **音频**: 如果需要在视频中保留 TTS 音频，使用 `--override-arguments` 传入音频文件。

4. **缓存**: Remotion 会缓存渲染结果，修改素材后使用 `--force` 强制重新渲染。

5. **错误处理**: 如果渲染失败，查看错误日志，通常是路径问题或组件编译错误。

6. **批量处理**: 对于多课项目，建议逐课渲染，避免单次渲染过长导致内存溢出。

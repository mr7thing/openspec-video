---
name: remotion-compiler
description: Remotion编排 — 基于所有素材（PPT图片 + 数字人视频 + 背景图）编译 Remotion React 组件，编排场景切换、PPT动画、数字人出场。
---

# Remotion 编排 (Remotion Compiler)

> **阶段**: S4 · Remotion 编排
> **输入**: S1 slides 元数据 + S3 数字人视频 + S2 背景配置
> **产出**: `videospec/lessons/{lesson_id}/remotion/index.tsx`
> **验收**: `remotion studio` 可正常预览，所有 Composition 通过编译

---

## 1. 职责边界

**你做**：
- 读取所有 slide 元数据，了解场景序列
- 读取所有数字人视频路径
- 生成 Remotion React 组件（index.tsx）
- 定义 Composition（每个 lesson 一个主 composition）
- 编排场景切换逻辑：
  - 开场：数字人居中（300帧）
  - 讲解：数字人右侧 + PPT（每 slide 根据 duration_frames 切换）
  - 聚焦：PPT 全屏（无数字人）
  - 过渡：数字人再次出现
  - 谢幕：数字人居中（300帧）
- 使用 Remotion 的 `useCurrentFrame()`、`interpolate()` 等 hook 实现动画

**你不做**：
- 实际渲染视频（那是 S5 remotion-renderer 的事）
- 生成数字人视频（那是 S3 的事）
- 修改 PPT 图片（用户提供）

---

## 2. 触发条件

- S1 slides 全部 `approved`
- S3 数字人视频全部生成完毕（`assets/dh_*.mp4` 存在）
- 背景图已就位（`assets/bg.png`）

---

## 3. 工作流程

```
S1 slides + S3 数字人视频 + S2 背景配置
         │
         ▼
┌──────────────────────────────────────┐
│ Step 1: 分析场景序列                  │
│   - 遍历所有 slides，按顺序排列       │
│   - 标记每个 slide 的 trigger 类型    │
│   - 计算总时长（frames）              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 2: 生成 Remotion 组件            │
│   - 定义 Composition                  │
│   - 实现 Scene 切换逻辑               │
│   - 添加 PPT 缩放/平移动画            │
│   - 添加数字人出场/退场动画           │
│   - 添加过渡效果（fade/slide）        │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ Step 3: 生成配置文件                  │
│   - remotion/config.ts               │
│   - 分辨率、FPS、总时长               │
└──────────────────────────────────────┘
```

---

## 4. 输出格式

生成 `videospec/lessons/{lesson_id}/remotion/index.tsx`：

```tsx
import { Composition, interpolate, useCurrentFrame } from "remotion";
import { img, seq, spring } from "remotion";

// Props 接口
interface LessonProps {
  slides: Array<{
    id: string;
    trigger: "intro" | "highlight" | "outro" | "none";
    dhPosition: "center" | "right" | null;
    durationFrames: number;
    imagePath: string;
    dhVideoPath: string | null;
  }>;
  bgImage: string;
  totalDuration: number;
}

// 场景组件
export const LessonScene: React.FC<LessonProps> = ({
  slides,
  bgImage,
  totalDuration,
}) => {
  const frame = useCurrentFrame();
  
  // 计算当前应该显示的 slide
  let cumulativeFrame = 0;
  let currentSlide = slides[0];
  let slideLocalFrame = 0;
  
  for (const slide of slides) {
    if (frame >= cumulativeFrame && frame < cumulativeFrame + slide.durationFrames) {
      currentSlide = slide;
      slideLocalFrame = frame - cumulativeFrame;
      break;
    }
    cumulativeFrame += slide.durationFrames;
  }
  
  // 背景层
  const bgScale = interpolate(slideLocalFrame, [0, 10], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  
  // 数字人层（如果有）
  const dhOpacity = currentSlide.trigger !== "none"
    ? spring({ frame: slideLocalFrame, config: { duration: 15 } })
    : 0;
    
  const dhX = currentSlide.dhPosition === "right"
    ? interpolate(slideLocalFrame, [0, 30], [1920, 1440], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 960; // center
  
  return (
    <div style={{ width: 1920, height: 1080, position: "relative" }}>
      {/* 背景 */}
      <img
        src={bgImage}
        style={{
          width: 1920 * bgScale,
          height: 1080 * bgScale,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />
      
      {/* PPT 层 */}
      {currentSlide.trigger !== "intro" && currentSlide.trigger !== "outro" && (
        <img
          src={currentSlide.imagePath}
          style={{
            position: "absolute",
            width: currentSlide.trigger === "none" ? 1920 : 1440,
            height: currentSlide.trigger === "none" ? 1080 : 810,
            left: currentSlide.trigger === "none" ? 0 : 0,
            opacity: spring({ frame: slideLocalFrame, config: { duration: 10 } }),
          }}
        />
      )}
      
      {/* 数字人层 */}
      {currentSlide.dhVideoPath && dhOpacity > 0 && (
        <video
          src={currentSlide.dhVideoPath}
          style={{
            position: "absolute",
            width: 480,
            height: 270,
            left: dhX,
            top: 405,
            opacity: dhOpacity / 100,
          }}
          muted
        />
      )}
    </div>
  );
};

// 主 Composition
export const LessonComposition: React.FC = () => {
  // 从 metadata 读取 slides 数据
  const slides = [/* ... */];
  const bgImage = "../assets/bg.png";
  
  return (
    <Composition
      id="lesson-01"
      component={LessonScene}
      durationInFrames={totalDuration}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ slides, bgImage, totalDuration }}
    />
  );
};
```

---

## 5. Remotion 动画模式

### 5.1 开场 (Intro)

```
帧 0-30:   数字人淡入（center）
帧 30-270: 数字人稳定讲解
帧 270-300: 数字人淡出
```

### 5.2 讲解模式 (Highlight)

```
帧 0-15:   PPT 淡入 + 数字人滑入右侧
帧 15-165: 数字人右侧讲解 + PPT 显示
帧 165-180: 数字人淡出
```

### 5.3 聚焦模式 (None)

```
帧 0-10:   PPT 从较小放大到全屏
帧 10-170: PPT 全屏显示（无数字人）
帧 170-180: PPT 缩小退出
```

### 5.4 谢幕 (Outro)

同开场模式，但内容为总结性话语。

---

## 6. 注意事项

1. **文件路径**: Remotion 组件中使用相对路径引用素材。确保路径正确。

2. **时长同步**: 数字人视频的时长必须 ≥ 对应 slide 的 `duration_frames`。如果不够，循环播放或添加静音。

3. **性能优化**: 使用 `spring()` 而非 `interpolate()` 获得更自然的动画效果。

4. **样式一致**: 所有场景使用统一的 1920×1080 分辨率，30fps。

5. **调试**: 生成后可用 `remotion studio` 实时预览，调整动画参数。

6. **代码自动生成**: 本技能生成的 index.tsx 是模板代码，实际路径和数据需要从 metadata 文件中读取。

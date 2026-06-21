# Design Decisions — Micro-lesson Production Pack

## 1. 为什么选择 Remotion 而不是直接 ComfyUI 编排？

**决策**: 使用 Remotion (React) 作为视频编排层，ComfyUI LTX2.3 仅用于数字人生成。

**理由**:
- Remotion 是声明式的 React 框架，天然适合处理"场景切换 + 时间轴"这种复杂编排
- 数字人位置、PPT 大小变化、淡入淡出等动画效果，在 Remotion 中只需几行代码
- ComfyUI 擅长单段视频生成，但不擅长多素材的时序编排
- Remotion 支持精确到帧的控制，适合教学视频对节奏的要求

## 2. 数字人生成的背景处理策略

**决策**: 数字人视频生成时，背景必须是最终合成时的背景图（Remotion 中的 bg.png）。

**理由**:
- LTX2.3 工作流接受一张参考图片作为背景
- 数字人需要"站"在这个背景上，否则 Remotion 合成时会出现背景不一致
- 不同场景（中央/左侧）需要不同位置的背景裁剪
- 策略：先生成背景图 → 根据数字人位置裁剪 → 传给 LTX2.3 工作流

### 2.1 背景裁剪规则

| 场景 | 数字人位置 | 背景处理方式 |
|------|-----------|-------------|
| 开场 | 画面中央 | 原图居中裁剪为 1920×1080 |
| 讲解侧位 | 画面右侧 1/4 区域 | 原图偏左裁剪（留右侧空间）|
| 聚焦PPT | 不出现 | 无需数字人生成 |

## 3. 数字人触发时机设计

**决策**: 在 lesson-planner 阶段定义数字人触发点，后续技能消费此信息。

**理由**:
- 触发点是课程内容的一部分，应该在剧本阶段就确定
- 使用 `digital_human_trigger` 字段标记每个 slide
- 触发类型：`intro`（开场）、`highlight`（强调）、`outro`（谢幕）

### 3.1 触发规则

```yaml
# 第一讲第一页（开场）
slide_1_1:
  digital_human_trigger: intro
  dh_position: center
  
# 中间随机触发（每 3-5 页触发一次）
slide_1_4:
  digital_human_trigger: highlight
  dh_position: right
  
# 最后一页（谢幕）
slide_1_N:
  digital_human_trigger: outro
  dh_position: center
```

## 4. PPT 命名规范

**决策**: 采用三层命名法 `lesson-{课号}-slide-{讲号}-{页号}`。

**理由**:
- 便于 Remotion 按顺序读取
- 便于数字人生成时定位到具体页面
- 示例：`lesson-01-slide-01-03.png` = 第一课第一讲第三页

## 5. 语音稿与数字人生成的关系

**决策**: 每页 PPT 对应一段语音稿，语音稿驱动 LTX2.3 数字人视频生成。

**流程**:
```
语音稿 (markdown) 
  → TTS 生成音频 (wav, voxcpm2)
  → LTX2.3 工作流 (音频 + 角色图 + 背景图)
  → 数字人视频 (mp4)
```

**注意**: 
- 不需要数字人的页面（聚焦模式）跳过此流程
- 需要数字人的页面，语音稿中的文本直接用作 LTX2.3 的 prompt

## 6. Remotion 组件架构

**决策**: 每个 lesson 一个独立的 Remotion 组件，复用共享的基础组件。

```
remotion-root/
├── compositions/
│   ├── LessonIntro.tsx      # 开场（数字人中央）
│   ├── LessonSlide.tsx      # 讲解模式（数字人侧位 + PPT）
│   ├── LessonFocus.tsx      # 聚焦模式（全屏PPT）
│   └── LessonOutro.tsx      # 谢幕（数字人中央）
├── lessons/
│   └── lesson-01/
│       └── index.tsx        # 该课的场景编排
└── shared/
    ├── Background.tsx       # 背景图层
    ├── SlideImage.tsx       # PPT图片层
    └── DigitalHuman.tsx     # 数字人视频层
```

## 7. 批量处理策略

**决策**: 支持单课独立渲染，也支持多课批量流水线处理。

```bash
# 单课
opsv render --course lessons/01-intro

# 批量
opsv render --batch lessons/01-10  # 第一课到第十课
```

## 8. 与 multi-ref-pack 的协作

**决策**: 数字人角色形象可以使用 multi-ref-pack 的 multi-ref-design 技能生成。

**流程**:
```
multi-ref-pack → 角色多视图设计 → 选定角色形象
                                    ↓
                            microlesson-pack → 角色照片传入 LTX2.3
```

## 9. LTX2.3 工作流参数映射

**决策**: 将 ComfyUI 工作流的内部节点参数暴露为技能可配置的 frontmatter 字段。

| LTX2.3 节点 | 暴露字段 | 默认值 | 说明 |
|------------|---------|--------|------|
| LoadImage | `character_photo` | - | 角色照片路径 |
| LoadAudioUI | `audio_file` | - | 驱动音频路径 |
| PrimitiveStringMultiline | `prompt` | - | 数字人动作描述 |
| PrimitiveInt | `bg_width` | 1280 | 背景图宽度 |
| PrimitiveBoolean | `switch_text2video` | false | 是否启用文生视频 |
| LoadImage (bg) | `background_image` | - | 最终背景图 |

## 10. 错误处理策略

- **数字人生成失败**: 跳过该页的数字人视频，Remotion 中用静态占位符替代
- **PPT 图片缺失**: 报错并列出缺失文件清单
- **音频生成失败**: 使用上一段成功的音频或静音
- **Remotion 渲染失败**: 输出 partial 视频 + 错误日志

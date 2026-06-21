# LTX Director 节点参数详解

## 核心参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `global_prompt` | string | "" | 整条时间线的整体叙事 |
| `duration_frames` | int | 120 | 总帧数 |
| `duration_seconds` | float | 5.0 | 总时长（秒） |
| `timeline_data` | JSON string | — | 分段数组（核心） |
| `local_prompts` | string | — | 分段 prompt，用 `\|` 分隔 |
| `segment_lengths` | string | — | 每段帧数，用 `,` 分隔 |
| `epsilon` | float | 0.5 | 音频同步容差 |
| `guide_strength` | string | "1.0,1.0,..." | 每段引导强度 |
| `use_custom_audio` | bool | true | 是否使用自定义音频 |
| `frame_rate` | int | 24 | 帧率 |
| `custom_width` | int | 1920 | 输出宽度 |
| `custom_height` | int | 1080 | 输出高度 |
| `resize_method` | string | "crop" | 适配方式：crop/fit/pad |
| `divisible_by` | int | 32 | 尺寸对齐倍数 |
| `img_compression` | int | 18 | JPEG 压缩质量 |

## 节点连接

```
LTXDirector (node 46)
├── model → PathchSageAttentionKJ (node 111)
│   └── unet → LTX2SamplingPreviewOverride (node 79)
│       └── unet → UNETLoader (node 110): ltx-2.3-22b
├── clip → DualCLIPLoader (node 84)
│   ├── clip_name1: gemma_3_12B_it_fp8_e4m3fn
│   └── clip_name2: ltx-2.3_text_projection_bf16
├── audio_vae → VAELoaderKJ (node 4): LTX23_audio_vae
├── global_prompt → 输入
├── timeline_data → 输入
├── local_prompts → 输入
├── segment_lengths → 输入
├── guide_strength → 输入
└── frame_rate → 输出 [5] (连接到 VHS_VideoCombine)
```

## 输出

- `[0]` model (处理后)
- `[1]` positive conditioning
- `[2]` video latent
- `[3]` audio latent
- `[4]` guide_data
- `[5]` frame_rate
- `[6]` audio (解码后)

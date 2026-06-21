# Director Timeline Guide — 时间线组装指南

## 1. Segment 编写规范

每个 segment 必须包含以下字段：

```json
{
  "id": "segment_001",
  "start": 0,
  "length": 24,
  "prompt": "女人推开宫殿门走进去",
  "type": "image",
  "imageFile": "path/to/scene_dojo_day.png"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 唯一标识符 |
| `start` | number | 是 | 起始帧（从 0 开始） |
| `length` | number | 是 | 该 segment 的帧数 |
| `prompt` | string | 是 | 该 segment 的画面描述 |
| `type` | string | 是 | 固定为 `"image"` |
| `imageFile` | string | 是 | 参考图像路径（已 approved 的资产） |
| `imageB64` | string | 否 | Base64 编码图像（可选，大图像用路径引用） |

## 2. 时间线参数

### global_prompt

整条时间线的整体叙事描述。示例：

```
A woman enters an ancient palace, approaches a stone stele, touches it, 
then turns around as phoenix wings light up behind her.
```

### local_prompts

各 segment 的 prompt 列表，用 `|` 分隔：

```
女人推开宫殿门走进去 | 女人走向宫殿里的石碑 | 女人触碰石碑 | 镜头切换，女人在石碑前面等待 | 女人转过身，身后亮起一片凤凰羽翼
```

### segment_lengths

各 segment 的帧数，用 `,` 分隔：

```
24,24,24.57,24,23.43
```

### guide_strength

各 segment 的引导强度，用 `,` 分隔（通常全为 `1.00`）：

```
1.00,1.00,1.00,1.00,1.00
```

## 3. 常见错误

1. **segment 数量不匹配** — `segment_lengths` 的逗号数量必须等于 `local_prompts` 的 `|` 分隔数 + 1
2. **imageFile 路径错误** — 必须是已 approved 资产的实际路径
3. **start 帧不连续** — 下一个 segment 的 start 必须等于上一个 segment 的 start + length
4. **total duration 超出** — 所有 segment length 之和不能超过 `duration_frames`

## 4. 最佳实践

- 每个 segment 建议 24-48 帧（1-2 秒），太短会导致转场突兀
- 关键动作（如转身、挥手）放在 segment 中间而非开头/结尾
- 使用 `resize_method: "crop"` 保持画面一致性
- `img_compression: 18` 是推荐值（平衡质量和速度）

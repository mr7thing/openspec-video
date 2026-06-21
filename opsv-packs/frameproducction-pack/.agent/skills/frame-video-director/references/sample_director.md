# Sample Director Document — 导演台文档范本

```yaml
---
category: frame_video_director
status: drafting
id: director-EP01
prompt: >
  A woman enters an ancient palace, approaches a stone stele, touches it,
  then turns around as phoenix wings light up behind her.
duration: 5.0
generation_type: video
fps: 24
refs:
  image:
    - "@Woman-Character"
    - "@Palace-Scene"
    - "@Stone-Stele"
---

# EP01 导演台合成

## 时间线

| Segment | 描述 | 参考图 | 帧数 |
|---------|------|--------|------|
| 1 | 女人推开宫殿门走进去 | @Woman-Character + @Palace-Scene | 24 |
| 2 | 女人走向宫殿里的石碑 | @Woman-Character + @Palace-Scene | 24 |
| 3 | 女人触碰石碑 | @Woman-Character + @Stone-Stele | 25 |
| 4 | 镜头切换，女人在石碑前面等待 | @Woman-Character + @Stone-Stele | 24 |
| 5 | 女人转过身，身后亮起凤凰羽翼 | @Woman-Character + @Palace-Scene | 23 |

## 参数

- `duration_frames`: 120
- `duration_seconds`: 5.0
- `frame_rate`: 24
- `custom_width`: 1920
- `custom_height`: 1080
- `resize_method`: crop
- `divisible_by`: 32
- `img_compression`: 18
```

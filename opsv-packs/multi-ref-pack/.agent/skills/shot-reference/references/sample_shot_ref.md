# 镜头参考帧范本 — S01-Shot01

> shot-reference 完整产出参考。Agent 生成镜头参考帧时参照此格式和字段。

---

```yaml
---
category: shot_ref
status: drafting
id: shot-ref-S01-Shot01
shot_id: S01-Shot01
generation_type: image
key_moment: "陆然步入道场，晨光初照的起手式停顿"
prompt: >
  @LuRan-multiview standing at the center of @Dojo-Day temple courtyard,
  bathed in warm golden morning light streaming from the left.
  Long shadows stretch across the stone floor, crimson robes catching
  the sunlight with a soft rim glow. Wide shot, low angle, emphasizing
  the towering temple architecture behind him. Dust particles float in
  the sunbeams.
  Chinese ancient fantasy style, 3D render, cinematic lighting, Unreal Engine quality.
refs:
  image:
    "@LuRan-multiview":
      - <path/to/LuRan-multiview.png>
    "@Dojo-Day":
      - <path/to/Dojo-Day.png>
---
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `shot_ref`，对齐 `_category_validate.yaml` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `id` | string | `shot-ref-{shot_id}`，如 `shot-ref-S01-Shot01` |
| `shot_id` | string | 对应 S1 Script.md 中的 shot id |
| `generation_type` | string | 固定 `image`（视觉资产） |
| `key_moment` | string | 中文描述，说明为什么选这个瞬间作为参考帧 |
| `prompt` | string | 英文完整 prompt，必须包含角色描述 + 场景描述 + 光影融合，面向图像生成 Engine |
| `refs.image` | list | 固定 2 项：角色多视图 `@id` + 场景定稿 `@id` |

## 编写要点

1. **`key_moment` 要有说服力** — 说明这个瞬间为什么代表整个镜头。是起手式？是对峙定格？是落幅？不要只写"某个瞬间"
2. **光影融合是核心** — prompt 必须描述"角色在这个场景里看起来什么样"。光源方向、色调、阴影都要写清楚
3. **引用角色多视图而非白底图** — `@LuRan-multiview` 有姿势信息，比白底单图有价值得多
4. **场景空镜提供空间布局** — `@Dojo-Day` 告诉 AI 场景的空间结构，不需要在 prompt 中重复描述场景细节
5. **prompt 面向 Engine** — 英文，含风格标签（3D render / cinematic lighting / Unreal Engine quality）
6. **YAML 多行字符串用 `>`** — 换行会合并为空格，保证 prompt 是一段完整文本

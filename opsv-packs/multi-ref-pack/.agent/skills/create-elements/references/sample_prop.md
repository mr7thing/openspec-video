# 道具设计范本 — 婚碑 (Stele)

> create-elements Phase 3 完整产出参考。Agent 生成道具设计时参照此格式和字段。

---

```yaml
---
category: prop
status: drafting
id: Stele
generation_type: image
used_by: [LuRan, YunLi]
appears_in: [Temple-Day]
frequency: high
design:
  name: "婚碑"
  description: "三丈高的白玉石碑，碑面刻有龙凤纹，顶部龙纹金箔镶边"
  material: "白玉质地，龙纹金箔镶边，碑座青石"
  dimensions: "高约 9 米，宽约 2 米"
  reference_style: "中国古代石碑，巍峨感，皇室规格"
  key_features:
    - "碑面龙凤浮雕——场景的视觉中心"
    - "金箔反光——需考虑不同光照下的材质表现"
prompt: >
  Massive white jade wedding stele, approximately 9 meters tall,
  2 meters wide. Dragon and phoenix reliefs carved into the surface,
  trimmed with gold leaf that catches sunlight. Gray stone base.
  Towering and majestic against temple courtyard backdrop.
  Chinese ancient imperial stele, 3D render, cinematic quality.
---
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `prop`，对齐 `_category_validate.yaml` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `generation_type` | string | 固定 `image`（视觉资产） |
| `used_by` | string[] | 从 `shots[].props` 反查：哪些角色用了此道具 |
| `appears_in` | string[] | 从 `shots[]` 反查：道具出现在哪些场景 |
| `frequency` | string | 跨 Shot 出现次数：high（3+）/ medium（2）/ single（1） |
| `design.name` | string | 中文道具名 |
| `design.description` | string | 一句话概括 |
| `design.material` | string | 材质描述（影响渲染和物理模拟） |
| `design.dimensions` | string | 预估尺寸，给具体米数（Engine 需要比例参照） |
| `design.reference_style` | string | 风格关键词 |
| `design.key_features` | string[] | 视觉锚点，供 S5/S6 做一致性约束 |
| `prompt` | string | 英文完整 prompt，面向图像生成 Engine |

## 编写要点

1. **`used_by` 从 shots[] 反查** — 遍历 `shots[].props` 找出所有引用该道具 id 的 Shot，再从 `shots[].characters` 拿使用者
2. **`frequency` 按跨 Shot 计算** — 与角色 frequency 相同逻辑
3. **`key_features` 以视觉锚点为主** — 场景焦点级道具（如婚碑）锚点要描述体量和画面位置
4. **dimensions 给具体数字** — 不要写"三丈"，写成"高约 9 米"
5. **prompt 面向 Engine** — 英文，风格关键词明确

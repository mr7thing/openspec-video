# 角色视觉范本 — 陆然 (LuRan)

> create-elements Phase 1 完整产出参考。Agent 生成角色设计时参照此格式和字段。

---

```yaml
---
category: character
status: drafting
id: LuRan
generation_type: image
frequency: high
appears_in: [Temple-Day, Seashore-Night]
interacts_with: [YunLi, Guard]
design:
  appearance: "青年男性，身材修长，面容清俊，目光坚定"
  height: 178
  height_baseline: "以现代男性平均 175cm 为参照，178 属于中等偏高，与 YunLi(165cm) 有 13cm 高度差，俩人同框时陆然需微微低头看她"
  outfit_default: "赤红长袍，腰间玉带，发束银冠"
  material: "丝绸质感红袍，金属龙纹腰带扣，白玉发冠"
  reference_style: "中国古风，三维写实，写意光影"
  key_features:
    - "标志性赤红长袍——所有镜头中的识别锚点"
    - "左眉尾一道细疤——近景特写可见"
    - "腰带龙纹扣——单手可解，动作戏关键道具"
wardrobe:
  - id: LuRan-RedRobe
    description: "赤红丝绸长袍，金线龙纹刺绣领口袖口"
    occasion: default
  - id: LuRan-NightCloak
    description: "深灰斗篷，毛呢质感，Seashore-Night 场景用"
    occasion: Seashore-Night
carried_props:
  - id: Sword
    description: "随身佩剑，银鞘青锋"
    carried_in: [Temple-Day]
prompt: >
  Young man, tall and lean, 178cm, with sharp features and determined eyes.
  Flowing crimson silk robes with gold dragon embroidery at collar and cuffs.
  Silver crown binding dark hair, a thin scar at the end of left eyebrow.
  Standing proud in ancient temple courtyard.
  Chinese ancient fantasy style, 3D render, Unreal Engine quality, cinematic lighting.
---
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 固定 `character`，对齐 `_category_validate.yaml` |
| `status` | string | 固定 `drafting` → `review` → `approved` |
| `generation_type` | string | 固定 `image`（视觉资产） |
| `frequency` | string | 从 shortlist.md frontmatter `characters[].frequency` 复制 |
| `appears_in` | string[] | 从 `shots[]` 汇总：该角色出现的所有 scene |
| `interacts_with` | string[] | 从 `shots[]` 汇总：同框的其他角色 |
| `design.appearance` | string | 一句话外观概括 |
| `design.height` | number | 身高（cm），供多视图和同框比例参考 |
| `design.height_baseline` | string | 身高参照说明，写清楚和其他角色的高度差 |
| `design.outfit_default` | string | 默认服饰描述 |
| `design.material` | string | 材质说明（影响渲染） |
| `design.reference_style` | string | 风格关键词（Engine 用） |
| `design.key_features` | string[] | 视觉锚点，至少 2 个，供 S5/S6 做一致性约束 |
| `wardrobe` | list | 所有服装列表，多视图生成时从这里取 |
| `wardrobe[].id` | string | 服装唯一标识 |
| `wardrobe[].description` | string | 服装描述 |
| `wardrobe[].occasion` | string | 穿着场景，default = 所有场景通用 |
| `carried_props` | list | 随身/常用道具列表，多视图生成时从这里取 |
| `carried_props[].id` | string | 道具唯一标识 |
| `carried_props[].description` | string | 道具描述 |
| `carried_props[].carried_in` | string[] | 携带场景 |
| `prompt` | string | 英文完整 prompt，面向图像生成 Engine |

## 编写要点

1. **`key_features` 是下游的锚** — 每个特征是 S5/S6 的视觉约束。要具体（"左眉尾细疤"），不要抽象（"帅气"）
2. **`wardrobe` + `carried_props` 为多视图服务** — 做角色多角度/多表情/多姿势图时，直接从这两张列表拿服装道具，不需跨文件查找
3. **`height` + `height_baseline` 做同框参照** — 两人同框时，比例差从这两个字段推算
4. **`prompt` 面向 Engine** — 用英文，含风格关键词（3D render / Unreal Engine / cinematic lighting）
5. **frequency 从 shortlist 拿** — 不自己估算
6. **YAML 多行字符串用 `>`** — 换行会合并为空格，保证 prompt 是一段完整文本

# OPSV-ASSET-0.4 资产规范

> 定义所有视觉资产（角色、场景、道具）的文档格式。本版本引入 **d-ref / a-ref 双通道参考图体系**，废弃 0.3.2 的 `has_image` 二元开关。

---

## 核心规则

```
生成自身 → 使用自己的 Design References (d-ref)
被引用时 → 提供自己的 Approved References (a-ref)
```

此规则统一适用于 element、scene、shot 所有实体类型。

---

## 1. 文件结构

每个资产文件由 **YAML Frontmatter + Markdown Body** 组成：

```markdown
---
# YAML 元数据（机器消费）
---
# Markdown Body（人类+机器双消费）
```

---

## 2. YAML Frontmatter

### 必填字段

```yaml
---
name: "@prefix_identifier"       # 唯一标识（@ + 类型前缀 + 名称）
type: "character"                # character | scene | prop
brief_description: "一句话描述"   # ≤ 20 字
prompt_en: >                     # 英文渲染提示词
  Dense English prompt for generation models...
---
```

### 可选字段

```yaml
detailed_description: >          # 无参考图时的详尽描述
schema_version: "0.4"            # Schema 版本
```

> **`has_image` 已废弃**。是否有参考图由 Markdown Body 中的 `## Approved References` 节是否存在且非空自动推导。

---

## 3. Markdown Body — 双通道参考图

### 3.1 `## Design References`（d-ref：生成输入）

**用途**：当 `opsv generate` 生成**本实体自身**时，将此节中的图片作为 img2img 输入参考图传给模型。

**使用场景**：
- 外部灵感图（服装参考、配色参考、情绪板）
- 已有资产的 a-ref（用于生成变体：老年版、卡通版、职业形象等）
- 草图/手绘稿

**格式**：标准 Markdown 链接，`[用途描述](图片路径)`

```markdown
## Design References
- [服装灵感 - 赛博朋克风衣](refs/costume_mood.png)
- [年轻版原型 - 用于生成老年变体](../elements/@role_K.md → a-ref)
```

### 3.2 `## Approved References`（a-ref：定档输出）

**用途**：当**其他实体引用本实体**时（如 Shot 中 `@role_K`），将此节中的图片注入引用方的 `reference_images`。

**使用场景**：
- 经导演审批确认的定档图
- 角色三视图 / 正脸特写
- 场景全景定稿

**格式**：同上

```markdown
## Approved References
- [角色三视图](artifacts/drafts_3/role_K_turnaround.png)
- [角色正脸特写](artifacts/drafts_3/role_K_closeup.png)
```

### 3.3 `has_image` 自动推导

```
## Design References 或 ## Approved References 任一存在且包含有效链接
  → 等价 has_image: true

两节均不存在或为空
  → 等价 has_image: false → 依赖 detailed_description 全文描述
```

---

## 4. 完整示例

### 示例 A：有参考图的角色

```markdown
---
name: "@role_K"
type: "character"
brief_description: "30多岁赛博侦探，黑色高领大衣"
prompt_en: >
  A cyber detective in his 30s, wearing a black turtleneck coat,
  left eye glowing with red cybernetic implant, rain-soaked,
  moody cinematic lighting, 8k ultra detailed.
---

## Design References
- [服装灵感 - 赛博朋克风衣](refs/costume_mood.png)
- [义眼参考 - 红色光效](refs/cyber_eye_ref.jpg)

## Approved References
- [角色三视图](artifacts/drafts_3/role_K_turnaround.png)
- [角色正脸特写](artifacts/drafts_3/role_K_closeup.png)
```

### 示例 B：纯文字描述的场景（无参考图）

```markdown
---
name: "@scene_neon_alley"
type: "scene"
brief_description: "赛博朋克霓虹小巷"
detailed_description: >
  赛博朋克风格的狭窄幽暗小巷，持续不断的大雨，
  地面水洼倒映着闪烁的紫色和青色霓虹灯招牌。
  两侧是生锈的金属管道和满是涂鸦的砖墙。
prompt_en: >
  Narrow cyberpunk alley, heavy rain, neon reflections in puddles,
  rusty pipes, graffiti walls, purple and cyan neon signs...
---
```

> 无 `## Design References` 和 `## Approved References` → 自动等价 `has_image: false`。编译器使用 `detailed_description` + `prompt_en` 纯文生图。

### 示例 C：变体链（从已有角色生成新形象）

```markdown
---
name: "@role_K_old"
type: "character"
brief_description: "60岁老年版 K，灰白头发，伤疤累累"
prompt_en: >
  An aged version of the cyber detective K, now 60 years old,
  gray-white hair, deep facial scars, worn leather coat...
---

## Design References
- [年轻版定档图 - 作为生成基础](artifacts/drafts_3/role_K_turnaround.png)
- [老化参考 - 皱纹与伤疤纹理](refs/aging_reference.jpg)
```

> d-ref 引用了 `@role_K` 的 a-ref，形成变体链。`opsv generate` 会将这些图片传给模型做 img2img。

---

## 5. 编译约束

### 生成自身（`opsv generate` 处理 elements/ 和 scenes/）

1. 检查 `## Design References` 节 → 提取图片路径 → 设为 `reference_images`
2. 无 d-ref 时 → 纯文生图（txt2img）
3. 文字部分：有 a-ref 时用 `brief_description`，否则用 `detailed_description`

### 被引用（Shot 分镜中 `@entity` 解析）

1. 解析被引用实体的 `## Approved References` → 提取第一张图 → 注入 Shot 的 `reference_images`
2. 无 a-ref 时 → fallback：搜索 `artifacts/drafts_*` 中最新生成的对应文件
3. 仍未找到 → 告警 `[WARN] No approved ref for @xxx`

---

## 6. 向后兼容

| 旧格式 | 新系统行为 |
|--------|-----------|
| `has_image: true` + body `![img](path)` | 按 `## Approved References` 处理 |
| `has_image: false` 无图片 | `detailed_description` 纯文生图 |
| 无 d-ref / a-ref 节 | 完全兼容旧逻辑 |

---

> *OPSV-ASSET-0.4 | OpsV 0.4.1 | 2026-03-24*

> 简化是最高形式的复杂。OpsV v0.5 摒弃了繁琐的配置数组，回归 Markdown 的自然叙事与依赖图的自动化处理。
> 
> **核心哲学：** 让创意如流水般流淌，让规范如堤坝般坚固。OpsV 0.5 将“规范技能 (Core Skills)”与“创作技能 (Addons)”完全解耦，通过强制质检 (Validation) 确保系统稳健。

---

## 1. 项目配置规范 (Project Specification)

所有项目必须在根目录下（或 `videospec/` 下）包含一个 `project.md` 文件。

### Frontmatter 结构 (Zod Validated)
```yaml
---
name: "项目名称"
version: "0.5.x"
context:
  narrative: "核心叙事内核，描述故事的主旨与氛围"
  style:
    visual_style: "视觉风格描述"
    aspect_ratio: "16:9" # 默认值
    resolution: "2K"    # 默认值
---
```

### 资产花名册 (Asset Manifest)
在配置下方，使用 Markdown 列表列出所有语义实体：
```markdown
## 核心角色 (Main Characters)
- @role_hero
- @role_villain

## 核心场景 (Scenes)
- @scene_base
```

---

## 2. 资产定义规范 (Asset & Scene Spec)

每个资产文件（如 `elements/@role_hero.md`）应遵循以下结构：

### 头部元数据
- **name**: 必须以 `@` 开头，且与文件名一致。
- **type**: `character` | `scene` | `prop`。
- **visual_brief**: 一句话视觉特征（用于参考生成）。
- **visual_detailed**: 详尽视觉描写（用于初始建模）。

### 引用体系 (Dual-Channel)
- **Design References**: 设计采集。
- **Approved References**: 经 `opsv review` 审定后的正式参考，由系统自动回写。

---

## 3. 分镜编导规范 (Shot Specification)

分镜文件 `Script.md` 严禁使用 YAML 数组，采用 **纯 Markdown 块** 定义。

### 结构示例
```markdown
## Shot N (时长)
[叙事描述，必须嵌入 @锚点 引用目标实体]

**Prompt:** [视觉生成提示词]
```

### 依赖继承 (Dependency)
- **图像继承**：使用 `(@REF:shot_N_start)`。
- **视频继承**：使用 `(@FRAME:shot_N_last)` 实现无缝镜头衔接。

---

> *OpsV 0.5.19 | 语义对齐版本: 2026-04-17*

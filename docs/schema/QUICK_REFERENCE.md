# OpenSpec-Video Schema 快速参考

> 一份简洁的 OpsV 0.3.2 Schema 速查表

---

## 文件结构速查

```
project/
├── videospec/
│   ├── project.md           # 项目配置 (ProjectConfig)
│   ├── stories/
│   │   └── story.md         # 故事大纲
│   ├── elements/            # 角色/道具资产
│   │   ├── @role_hero.md    # Character Schema
│   │   └── @prop_sword.md   # Prop Schema
│   ├── scenes/              # 场景资产
│   │   └── @scene_forest.md # Scene Schema
│   └── shots/
│       ├── Script.md        # 静态分镜 (Shot Schema)
│       └── Shotlist.md      # 动态台本 (Shotlist Schema)
├── queue/
│   ├── jobs.json            # 图像任务队列 (Job Schema)
│   └── video_jobs.json      # 视频任务队列 (Job Schema)
└── artifacts/
    └── drafts_N/            # 生成产物
```

---

## YAML Frontmatter 模板

### 项目配置 (project.md)

```yaml
---
name: "Project Name"
aspect_ratio: "16:9"
resolution: "2K"
schema_version: "0.3.2"
---
```

### 角色资产 (@role_*.md)

```yaml
---
name: "@role_name"
type: "character"
has_image: false
visual_traits:
  age_group: "young adult"
  clothing: "description"
schema_version: "0.3.2"
---
```

### 场景资产 (@scene_*.md)

```yaml
---
name: "@scene_name"
type: "scene"
has_image: false
atmosphere:
  mood: "tense and mysterious"
schema_version: "0.3.2"
---
```

### 道具资产 (@prop_*.md)

```yaml
---
name: "@prop_name"
type: "prop"
has_image: false
prop_category: "weapon"
significance: "key"
schema_version: "0.3.2"
---
```

### 分镜 (Script.md)

```yaml
---
shots:
  - id: "shot_001"
    environment: "@scene_name or description"
    subject: "@role_name action"
    camera:
      shot_type: "medium_shot"
    duration: "5s"
---
```

---

## 关键字段速查表

### 资产字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | `@identifier` 格式 |
| `type` | enum | ✅ | character/scene/prop/... |
| `has_image` | boolean | ✅ | 是否有参考图 |
| `reference_images` | array | 条件 | `has_image=true` 时必填 |
| `visual_traits` | object | 条件 | character 类型必填 |
| `atmosphere` | object | 条件 | scene 类型必填 |

### 任务字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识 |
| `type` | enum | ✅ | image_generation/video_generation |
| `prompt_en` | string | - | 英文渲染提示词 |
| `payload` | object | ✅ | 结构化数据 |
| `output_path` | string | ✅ | 输出绝对路径 |
| `reference_images` | array | - | 参考图路径 |

### 分镜字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | `shot_NNN` 格式 |
| `environment` | string | ✅ | 场景引用或描述 |
| `subject` | string | ✅ | 主体描述（可含@引用） |
| `camera.shot_type` | enum | ✅ | 景别 |
| `duration` | string | - | 视频必填 (e.g., "5s") |

---

## @引用语法

### 基本语法

```markdown
# 方括号引用（推荐）
[entity_id]           # 例如: [@role_hero]

# @直接引用
@entity_id            # 例如: @role_hero

# 在 YAML 中
subject: "[@role_hero] enters [@scene_bar]"
```

### 引用解析优先级

1. `videospec/elements/{id}.md` - 角色/道具
2. `videospec/scenes/{id}.md` - 场景
3. 内联描述（fallback）

---

## 相机术语表

### 景别 (Shot Type)

| 术语 | 缩写 | 说明 |
|------|------|------|
| `extreme_wide` | EWS | 大远景，环境为主 |
| `wide_shot` | WS | 全景，人物全身 |
| `medium_shot` | MS | 中景，膝盖以上 |
| `medium_close` | MCU | 中近景，胸部以上 |
| `close_up` | CU | 特写，面部 |
| `extreme_close` | ECU | 大特写，局部细节 |

### 角度 (Angle)

| 术语 | 说明 |
|------|------|
| `eye_level` | 平视，最常用 |
| `low_angle` | 仰拍，显高大 |
| `high_angle` | 俯拍，显渺小 |
| `dutch` | 荷兰角，倾斜不安 |

### 运动 (Movement)

| 术语 | 说明 |
|------|------|
| `static` | 固定机位 |
| `dolly_in/out` | 推/拉 |
| `pan_left/right` | 左右摇 |
| `truck_left/right` | 左右移 |
| `crane_up/down` | 升降 |

---

## 枚举值速查

### 画幅比例
```yaml
aspect_ratio:
  - "16:9"    # 宽屏（默认）
  - "9:16"    # 竖屏
  - "1:1"     # 方形
  - "21:9"    # 超宽
  - "4:3"     # 经典
  - "2.39:1"  # 电影宽屏
```

### 分辨率
```yaml
resolution:
  - "480p"
  - "1080p"
  - "2K"      # 默认
  - "4K"
  - "8K"
```

### 视频时长上限
```yaml
duration:
  - "3s"
  - "5s"      # 推荐
  - "10s"
  - "15s"     # 上限
```

---

## 验证命令

```bash
# 验证整个项目
opsv validate

# 验证特定文件
opsv validate ./videospec/elements/@role_hero.md

# 验证任务队列
opsv validate ./queue/jobs.json --type job

# 使用 JSON Schema 验证
npx ajv-cli validate \
  -s docs/schema/json/job.schema.json \
  -d queue/jobs.json
```

---

## 常见错误码

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| E1001 | 资产不存在 | 检查 `@name` 是否有对应文件 |
| E1002 | 缺少参考图 | `has_image=true` 时提供 `reference_images` |
| E2001 | 配置无效 | 检查 `aspect_ratio` 是否在允许值中 |
| E3001 | 任务ID重复 | 确保同一批次内ID唯一 |
| E3003 | 视频缺少时长 | 视频任务必须设置 `duration` |

---

## 扩展阅读

- [完整 Schema 规范](./OPSV-SCHEMA-SPEC-0.3.2.md)
- [JSON Schema: Job](./json/job.schema.json)
- [JSON Schema: Asset](./json/asset.schema.json)
- [JSON Schema: Project Config](./json/project-config.schema.json)

---

*版本: 0.3.2 | 最后更新: 2026-03-15*

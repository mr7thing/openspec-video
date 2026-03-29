# OpenSpec-Video Schema 规范文档 (v0.3.2)

> **版本**: 0.3.2  
> **日期**: 2026-03-15  
> **状态**: 正式版  
> **适用**: OpsV CLI, Agent Skills, 第三方集成

---

## 目录

1. [概述](#1-概述)
2. [Schema 设计原则](#2-schema-设计原则)
3. [资产 Schema (Asset Schema)](#3-资产-schema-asset-schema)
4. [任务 Schema (Job Schema)](#4-任务-schema-job-schema)
5. [项目配置 Schema](#5-项目配置-schema)
6. [分镜 Schema (Shot Schema)](#6-分镜-schema-shot-schema)
7. [动态台本 Schema (Shotlist Schema)](#7-动态台本-schema-shotlist-schema)
8. [枚举类型定义](#8-枚举类型定义)
9. [验证规则](#9-验证规则)
10. [版本兼容性](#10-版本兼容性)
11. [示例集合](#11-示例集合)

---

## 1. 概述

### 1.1 什么是 OpsV Schema

OpsV Schema 是一套**严格类型化**的数据结构规范，用于定义：
- 视觉资产（角色、场景、道具）的元数据
- AI 生成任务的输入输出格式
- 项目级配置参数
- 分镜和动态台本的数据结构

### 1.2 Schema 层级

```
┌─────────────────────────────────────────────────────────────┐
│                     Schema 层级架构                          │
├─────────────────────────────────────────────────────────────┤
│  L1: 资产层 (Asset Layer)                                    │
│      ├─ Character Schema (角色)                              │
│      ├─ Scene Schema (场景)                                  │
│      └─ Prop Schema (道具)                                   │
├─────────────────────────────────────────────────────────────┤
│  L2: 任务层 (Job Layer)                                      │
│      ├─ ImageGenerationJob (图像生成)                        │
│      └─ VideoGenerationJob (视频生成)                        │
├─────────────────────────────────────────────────────────────┤
│  L3: 项目层 (Project Layer)                                  │
│      └─ ProjectConfig (项目配置)                             │
├─────────────────────────────────────────────────────────────┤
│  L4: 叙事层 (Narrative Layer)                                │
│      ├─ Script Schema (静态分镜)                             │
│      └─ Shotlist Schema (动态台本)                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 格式约定

- **文件格式**: YAML frontmatter + Markdown body
- **编码**: UTF-8
- **换行**: LF (\n)
- **缩进**: 2 个空格 (YAML)
- **命名规范**: snake_case (YAML keys), @prefix_id (资产引用)

---

## 2. Schema 设计原则

### 2.1 单一真相源 (Single Source of Truth)

每个数据实体只在一个位置定义，通过 `@引用` 建立关联。

### 2.2 向后兼容 (Backward Compatibility)

- 新增字段必须是 `optional`
- 废弃字段保留至少 2 个主版本周期
- 使用 `version` 字段标记 Schema 版本

### 2.3 渐进式增强 (Progressive Enhancement)

基础字段保证核心功能，扩展字段提供增强能力。

### 2.4 人类可读 (Human Readable)

YAML/Markdown 格式优先，便于版本控制和人工编辑。

---

## 3. 资产 Schema (Asset Schema)

### 3.1 基础资产接口 (BaseAsset)

所有资产类型的共同基础：

```typescript
interface BaseAsset {
  // === 标识字段 ===
  /** 唯一标识符，必须以 @ 开头 */
  name: string;                    // 示例: "@role_hero", "@scene_forest"
  
  /** 资产类型 */
  type: AssetType;                 // character | scene | prop | costume
  
  /** 显示名称（可选，默认从 name 提取） */
  display_name?: string;           // 示例: "主角 - 李明"
  
  // === 状态字段 ===
  /** 是否有确认的视觉参考图 */
  has_image: boolean;              // 关键开关，决定编译策略
  
  /** 资产状态 */
  status?: AssetStatus;            // draft | confirmed | deprecated
  
  // === 元数据 ===
  /** 创建时间 */
  created_at?: string;             // ISO 8601: "2026-01-15T10:30:00Z"
  
  /** 最后修改时间 */
  updated_at?: string;             // ISO 8601
  
  /** 创建者/来源 */
  author?: string;                 // 示例: "opsv-asset-designer"
  
  /** Schema 版本 */
  schema_version?: string;         // 默认: "0.3.2"
  
  /** 标签数组 */
  tags?: string[];                 // 示例: [" protagonist", "cyberpunk"]
}
```

### 3.2 角色资产 (Character)

```typescript
interface CharacterAsset extends BaseAsset {
  type: 'character';
  
  // === 角色设定 ===
  /** 角色在故事中的定位 */
  role?: string;                   // 示例: "protagonist", "antagonist", "supporting"
  
  /** 角色背景描述 */
  backstory?: string;
  
  /** 性格特征 */
  personality?: string[];          // 示例: ["brave", "reckless", "loyal"]
  
  // === 视觉特征 ===
  visual_traits: {
    /** 年龄阶段 */
    age_group?: string;            // 示例: "young adult", "middle-aged"
    
    /** 性别表现 */
    gender?: string;               // 示例: "male", "female", "androgynous"
    
    /** 身高体型 */
    build?: string;                // 示例: "tall and athletic", "petite"
    
    /** 肤色 */
    skin_tone?: string;
    
    /** 眼睛颜色 */
    eye_color?: string;            // 示例: "deep blue with flecks of gold"
    
    /** 发型描述 */
    hair_style?: string;           // 示例: "short undercut, silver-white"
    
    /** 发色 */
    hair_color?: string;
    
    /** 服装描述 */
    clothing?: string;             // 详细描述服装风格和材质
    
    /** 配饰 */
    accessories?: string[];        // 示例: ["red scarf", "leather bracer"]
    
    /** 显著特征 */
    distinctive_features?: string[]; // 示例: ["scar on left cheek", "mechanical arm"]
    
    /** 表情特征 */
    default_expression?: string;   // 示例: "stoic", "cheerful"
  };
  
  // === 参考图 ===
  /** 参考图路径数组（相对于项目根目录） */
  reference_images?: string[];     // 示例: ["artifacts/hero_ref.png"]
  
  /** 参考图状态 */
  reference_status?: {
    [imagePath: string]: {
      status: 'draft' | 'confirmed' | 'rejected';
      source?: string;             // 生成工具: "gemini", "midjourney"
      prompt?: string;             // 生成提示词（用于追溯）
    }
  };
}
```

**Markdown 示例**:

```markdown
---
name: "@role_cyber_detective"
type: "character"
has_image: true
role: "protagonist"
schema_version: "0.3.2"
tags: ["cyberpunk", "detective", "noir"]
visual_traits:
  age_group: "35-40"
  gender: "male"
  eye_color: "glowing red cybernetic left eye, natural brown right eye"
  hair_style: "slicked back, gray at temples"
  clothing: "worn charcoal trench coat over tactical vest"
  distinctive_features:
    - "visible neural port at base of skull"
    - "tattooed circuit patterns on forearms"
reference_images:
  - "artifacts/detective_main.png"
  - "artifacts/detective_profile.png"
---

# Subject Identity
资深赛博侦探，退役警官，在霓虹闪烁的下城区经营私人调查事务所。

# Detailed Description
## Physical Appearance
中等身材，略微驼背，常年抽烟留下的痕迹。左眼是廉价但可靠的义眼，在暗处会发出微弱的红光。右眼的疲惫透露出无数不眠之夜。

## Clothing Style
标志性的黑色高领大衣，内衬是改装过的防弹材质。腰间别着改装过的电磁脉冲手枪。

## 参考图
![Main Reference](../artifacts/detective_main.png)
![Profile View](../artifacts/detective_profile.png)
```

### 3.3 场景资产 (Scene)

```typescript
interface SceneAsset extends BaseAsset {
  type: 'scene';
  
  // === 场景设定 ===
  /** 场景类型 */
  scene_type?: string;             // interior | exterior | transitional
  
  /** 时间段 */
  time_of_day?: string;            // dawn | morning | noon | afternoon | dusk | night | midnight
  
  /** 天气/气候 */
  weather?: string;                // 示例: "heavy rain", "clear sky"
  
  /** 地理位置 */
  location?: string;               // 示例: "downtown tokyo", "abandoned space station"
  
  // === 视觉氛围 ===
  atmosphere: {
    /** 整体氛围描述 */
    mood: string;                  // 示例: "tense and mysterious", "serene and peaceful"
    
    /** 主色调 */
    color_palette?: string[];      // 示例: ["deep blues", "neon purples", "pitch black"]
    
    /** 光照条件 */
    lighting?: string;             // 示例: "low-key dramatic", "soft diffused"
    
    /** 光照来源 */
    light_sources?: string[];      // 示例: ["neon signs", "street lamps", "moonlight"]
    
    /** 雾气/粒子效果 */
    atmospheric_effects?: string[]; // 示例: ["thick fog", "falling ash", "light dust"]
  };
  
  // === 环境细节 ===
  environment_details?: {
    /** 建筑风格 */
    architecture?: string;
    
    /** 关键物体 */
    key_objects?: string[];
    
    /** 纹理材质 */
    textures?: string[];           // 示例: ["rusted metal", "cracked concrete"]
    
    /** 损坏/陈旧程度 */
    condition?: string;            // 示例: "dilapidated", "pristine", "under construction"
  };
  
  // === 声音设计（参考）===
  audio_notes?: {
    /** 环境音 */
    ambient?: string[];            // 示例: ["distant traffic", "rain on metal"]
    
    /** 音乐情绪 */
    musical_mood?: string;
  };
  
  reference_images?: string[];
}
```

### 3.4 道具资产 (Prop)

```typescript
interface PropAsset extends BaseAsset {
  type: 'prop';
  
  // === 道具分类 ===
  /** 道具类别 */
  prop_category?: string;          // weapon | tool | vehicle | furniture | wearable | consumable
  
  /** 重要性级别 */
  significance?: 'key' | 'supporting' | 'background'; // 关键道具 | 辅助道具 | 背景道具
  
  // === 物理属性 ===
  physical_properties?: {
    /** 材质 */
    material?: string[];           // 示例: ["brushed steel", "polished wood"]
    
    /** 尺寸（相对描述） */
    size?: string;                 // 示例: "palm-sized", "life-sized", "towering"
    
    /** 重量感 */
    weight?: string;               // 示例: "heavy and solid", "lightweight"
    
    /** 状态 */
    condition?: string;            // 示例: "brand new", "ancient and worn"
  };
  
  // === 视觉特征 ===
  visual_description: {
    /** 形状概述 */
    shape?: string;
    
    /** 颜色 */
    color?: string;
    
    /** 装饰细节 */
    decorations?: string[];
    
    /** 特殊效果 */
    effects?: string[];            // 示例: ["glowing runes", "steam venting"]
  };
  
  // === 故事关联 ===
  /** 关联角色 */
  associated_characters?: string[]; // @role_name 数组
  
  /** 关联场景 */
  associated_scenes?: string[];     // @scene_name 数组
  
  /** 剧情功能 */
  narrative_function?: string;
  
  reference_images?: string[];
}
```

---

## 4. 任务 Schema (Job Schema)

### 4.1 基础任务接口

```typescript
interface BaseJob {
  // === 标识 ===
  /** 任务唯一ID */
  id: string;                      // 示例: "shot_001", "role_hero_main"
  
  /** 任务类型 */
  type: JobType;                   // image_generation | video_generation
  
  /** 任务批次 */
  batch_id?: string;               // 示例: "batch_20260315_001"
  
  // === 提示词（双通道架构）===
  /** 英文渲染提示词（给 SD/Flux/ComfyUI） */
  prompt_en?: string;
  
  /** 结构化 Payload（给多模态大模型） */
  payload: PromptPayload;
  
  // === 参考资源 ===
  /** 参考图绝对路径数组 */
  reference_images?: string[];
  
  /** 工作流配置（ComfyUI） */
  workflow?: WorkflowConfig;
  
  // === 输出配置 ===
  /** 输出文件绝对路径 */
  output_path: string;
  
  /** 输出格式 */
  output_format?: OutputFormat;    // png | jpg | webp | mp4 | mov
  
  // === 元数据 ===
  /** 优先级 */
  priority?: number;               // 1-10, 默认 5
  
  /** 依赖任务ID数组 */
  dependencies?: string[];         // 用于依赖图谱
  
  /** 任务元数据 */
  meta?: JobMeta;
  
  // === 运行时状态（不序列化）===
  /** UI 跳过标记 */
  _skip?: boolean;
  
  /** UI 选中标记 */
  _selected?: boolean;
}
```

### 4.2 图像生成任务

```typescript
interface ImageGenerationJob extends BaseJob {
  type: 'image_generation';
  
  payload: ImagePromptPayload;
  
  /** 输出必须是图像格式 */
  output_format: 'png' | 'jpg' | 'webp';
  
  /** 种子值（用于复现） */
  seed?: number;
}

interface ImagePromptPayload {
  /** 中文叙事提示词 */
  prompt: string;
  
  /** 全局设置 */
  global_settings: {
    aspect_ratio: AspectRatio;     // 16:9 | 9:16 | 1:1 | 21:9 | 4:3
    quality: Quality;              // 2K | 4K | 8K | 1080p
    style_preset?: string;         // cinematic | anime | photographic
  };
  
  /** 主体描述 */
  subject?: {
    description: string;
    pose?: string;
    expression?: string;
  };
  
  /** 环境描述 */
  environment?: {
    description: string;
    depth_of_field?: 'shallow' | 'deep';
  };
  
  /** 相机设置 */
  camera?: {
    type: CameraType;              // wide_shot | close_up | medium_shot | etc.
    angle?: CameraAngle;           // eye_level | low_angle | high_angle
    movement?: CameraMovement;     // static | pan | tilt | dolly
  };
  
  /** 0.3.2 扩展 Schema */
  schema_0_3_2?: {
    /** 首帧参考（用于图生图） */
    first_image?: string;
    
    /** 尾帧参考（用于序列） */
    last_image?: string;
    
    /** 参考图数组 */
    reference_images?: string[];
    
    /** ControlNet 参数 */
    controlnet?: {
      type: 'canny' | 'depth' | 'pose' | 'openpose';
      image: string;
      strength: number;            // 0.0 - 1.0
    }[];
  };
}
```

### 4.3 视频生成任务

```typescript
interface VideoGenerationJob extends BaseJob {
  type: 'video_generation';
  
  payload: VideoPromptPayload;
  
  /** 输出必须是视频格式 */
  output_format: 'mp4' | 'mov' | 'webm';
}

interface VideoPromptPayload {
  /** 中文叙事提示词 */
  prompt: string;
  
  /** 全局设置 */
  global_settings: {
    aspect_ratio: AspectRatio;
    quality: Quality;
    duration: Duration;            // 5s | 10s | 15s (最大)
    fps?: number;                  // 24 | 30 | 60
  };
  
  /** 主体运动描述 */
  subject?: {
    description: string;
    motion: string;                // "walking slowly from left to right"
    entrance?: string;             // "fade in" | "enter from left"
    exit?: string;                 // "fade out" | "exit to right"
  };
  
  /** 环境变化 */
  environment?: {
    description: string;
    lighting_change?: string;      // "gradual sunset transition"
    weather_change?: string;       // "rain starts falling"
  };
  
  /** 相机运动 */
  camera: {
    type: CameraType;
    motion: CameraMovement;        // 必填，视频关键
    speed?: 'slow' | 'normal' | 'fast';
    easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
  };
  
  /** 时长 */
  duration: string;                // "5s", "10s"
  
  /** 0.3.2 扩展 Schema */
  schema_0_3_2: {
    /** 首帧图（图生视频必填） */
    first_image: string;
    
    /** 中间帧参考（可选，用于复杂运动） */
    middle_image?: string;
    
    /** 尾帧参考（可选，用于精确结束） */
    last_image?: string;
    
    /** 额外参考图 */
    reference_images?: string[];
    
    /** @FRAME 指针（因果依赖） */
    frame_pointer?: {
      source_job_id: string;
      frame_type: 'first' | 'middle' | 'last';
    };
  };
  
  /** 向后兼容的 0.3 Schema */
  schema_0_3?: {
    first_image?: string;
    middle_image?: string;
    last_image?: string;
    reference_images?: string[];
  };
}
```

---

## 5. 项目配置 Schema

### 5.1 ProjectConfig

```typescript
interface ProjectConfig {
  // === 项目标识 ===
  /** 项目名称 */
  name: string;
  
  /** 项目版本 */
  version?: string;                // 默认: "0.1.0"
  
  /** 项目描述 */
  description?: string;
  
  // === 视觉规范 ===
  /** 画幅比例 */
  aspect_ratio: AspectRatio;       // 项目全局默认
  
  /** 分辨率 */
  resolution: Resolution;          // 2K | 4K | 1080p
  
  /** 渲染引擎 */
  engine?: string;                 // "wan2.2", "veo", "luma"
  
  /** 全局风格后缀 */
  global_style_postfix?: string;   // 自动追加到所有 prompt_en
  
  /** 视觉愿景 */
  vision?: string;                 // 首条任务的系统提示词
  
  // === 风格指南 ===
  style?: {
    /** 视觉风格 */
    visual_style?: string;         // "cinematic noir", "anime"
    
    /** 类型 */
    genre?: string;                // "sci-fi", "fantasy", "documentary"
    
    /** 主色调 */
    palette?: string[];
    
    /** 参考作品 */
    references?: string[];         // 示例: ["Blade Runner 2049", "Ghost in the Shell"]
  };
  
  // === 技术配置 ===
  technical?: {
    /** 默认输出格式 */
    default_image_format?: 'png' | 'jpg';
    
    /** 默认视频时长 */
    default_video_duration?: string; // "5s"
    
    /** 批处理大小 */
    batch_size?: number;           // 默认: 1 (保守)
    
    /** 自动重试次数 */
    retry_attempts?: number;       // 默认: 3
    
    /** 并发限制 */
    concurrency?: number;          // 默认: 1
  };
  
  // === 元数据 ===
  /** 创建时间 */
  created_at?: string;
  
  /** 最后更新 */
  updated_at?: string;
  
  /** Schema 版本 */
  schema_version: string;          // "0.3.2"
}
```

**Markdown 示例**:

```markdown
---
name: "Cyberpunk Detective"
version: "0.1.0"
aspect_ratio: "16:9"
resolution: "2K"
engine: "wan2.2"
global_style_postfix: "cinematic lighting, film grain, 8k resolution, highly detailed"
vision: "Create visually stunning cyberpunk noir imagery with dramatic lighting"
style:
  visual_style: "cinematic noir with cyberpunk elements"
  genre: "sci-fi neo-noir"
  palette: ["deep blues", "neon purples", "warm oranges", "pitch blacks"]
  references:
    - "Blade Runner 2049"
    - "Altered Carbon"
    - "Ghost in the Shell (1995)"
technical:
  default_image_format: "png"
  default_video_duration: "5s"
  batch_size: 1
  retry_attempts: 3
schema_version: "0.3.2"
---

# Project Overview
## Logline
In a rain-soaked megacity where memories can be bought and sold, a retired cyber-detective takes on one last case that threatens to unravel his own fragmented past.

## Visual Philosophy
High contrast, low-key lighting with selective neon accents. Focus on reflective surfaces and atmospheric haze.
```

---

## 6. 分镜 Schema (Shot Schema)

### 6.1 Shot 定义

```typescript
interface Shot {
  // === 标识 ===
  /** 分镜ID */
  id: string;                      // 格式: "shot_{number}", 示例: "shot_001"
  
  /** 幕/场次 */
  act?: number;
  scene?: number;
  
  /** 在剧本中的顺序 */
  sequence?: number;
  
  // === 内容描述 ===
  /** 分镜描述（中文） */
  description: string;
  
  /** 分镜描述（英文，用于生成） */
  description_en?: string;
  
  // === 视觉规范 ===
  /** 场景引用 */
  environment: string;             // @scene_name 或直接描述
  
  /** 主体描述 */
  subject: string;                 // 可包含 @role_name 引用
  
  /** 相机设置 */
  camera: CameraConfig;
  
  /** 光照描述 */
  lighting?: string;
  
  // === 动态信息 ===
  /** 时长 */
  duration: Duration;              // 静态图可忽略，视频必填
  
  /** 动作/运镜 */
  motion?: string;
  motion_en?: string;              // 英文描述用于视频生成
  
  // === 参考图（审阅后填充）===
  /** 确认的首帧 */
  confirmed_first_image?: string;
  
  /** 确认的尾帧（用于序列衔接） */
  confirmed_last_image?: string;
  
  /** 画廊候选图 */
  candidate_images?: string[];
  
  // === 生成提示词（自动编译）===
  /** 自动生成的英文提示词 */
  prompt_en?: string;
  
  /** 靶向补帧提示词 */
  target_last_prompt?: string;     // 用于生成精确的尾帧
  
  // === 状态 ===
  status?: ShotStatus;             // pending | draft | approved | revision
  
  /** 备注 */
  notes?: string;
}

interface CameraConfig {
  /** 景别 */
  shot_type: CameraType;
  
  /** 角度 */
  angle?: CameraAngle;
  
  /** 高度 */
  height?: 'eye' | 'low' | 'high' | 'bird' | 'worm';
  
  /** 镜头焦距感 */
  lens?: 'wide' | 'normal' | 'telephoto' | 'macro';
  
  /** 特殊镜头 */
  special?: 'POV' | 'OTS' | 'aerial' | 'dutch';
  
  /** 焦点 */
  focus?: string;                  // "on protagonist's face"
  
  /** 景深 */
  depth_of_field?: 'shallow' | 'deep';
}
```

### 6.2 Script.md 结构

Script.md 是分镜的静态美术版本：

```markdown
---
act: 1
scene: 3
location: "Neon Alley"
schema_version: "0.3.2"
shots:
  - id: "shot_001"
    environment: "@scene_neon_alley"
    subject: "@role_detective stands under flickering neon sign"
    camera:
      shot_type: "medium_shot"
      angle: "eye_level"
      lens: "normal"
    lighting: "low-key, neon rim lighting"
    duration: "5s"
    motion: "Detective lights a cigarette, smoke drifts upward"
    motion_en: "A man lights a cigarette, smoke slowly rising"
    prompt_en: "medium shot, man in trench coat lighting cigarette under neon sign, smoke rising"
    target_last_prompt: "close-up of cigarette ember glowing red"
    
  - id: "shot_002"
    environment: "@scene_neon_alley"
    subject: "@role_detective walking away, rain falling"
    camera:
      shot_type: "wide_shot"
      angle: "low_angle"
      lens: "wide"
    duration: "5s"
    motion: "Camera dollies back as detective walks into shadows"
    motion_en: "Slow dolly back, man walks away into dark alley"
    prompt_en: "wide shot from low angle, man walking away into dark alley, heavy rain"
---

# Act 1, Scene 3 - The Alley

## Shot 1
**Setup**: 侦探在闪烁的霓虹灯下停下，点燃一支烟。

**Mood**: 孤独、沉思、雨夜的忧郁。

## Shot 2
**Setup**: 侦探掐灭烟头，走进黑暗的小巷深处。

**Mood**: 决绝、神秘、未知的危险。
```

---

## 7. 动态台本 Schema (Shotlist Schema)

### 7.1 Shotlist.md 结构

Shotlist.md 是机器执行的动态版本，与 Script.md 分离：

```typescript
interface Shotlist {
  // === 元数据 ===
  version: string;                 // "0.3.2"
  generated_at: string;            // ISO 8601
  generator: string;               // "opsv-animator"
  
  // === 时间轴配置 ===
  timeline?: {
    total_duration: string;        // "2m 30s"
    fps: number;                   // 24
  };
  
  // === 分镜数组 ===
  shots: ShotlistItem[];
  
  // === 依赖图谱 ===
  dependencies?: {
    [jobId: string]: string[];     // jobId -> [dependencyJobIds]
  };
}

interface ShotlistItem {
  // === 标识 ===
  id: string;                      // 继承自 Script.md
  shot: number;                    // 序号 (1-based)
  
  // === 图像锚点（关键）===
  /** 首帧图路径 */
  first_image: string;             // 绝对路径或 @FRAME:指针
  
  /** 中间帧（复杂运动） */
  middle_image?: string;
  
  /** 尾帧图路径 */
  last_image?: string;
  
  // === 动态描述 ===
  /** 中文动作描述 */
  motion_prompt_zh: string;
  
  /** 英文动作描述（API 使用） */
  motion_prompt_en: string;
  
  // === 技术参数 ===
  /** 时长 */
  duration: string;                // "5s"
  
  /** 帧率 */
  fps?: number;
  
  // === 参考图数组 ===
  reference_images?: string[];
  
  // === 输出配置 ===
  output_path: string;             // 视频输出路径
  
  // === 特殊标记 ===
  /** 是否是关键帧 */
  is_keyframe?: boolean;
  
  /** 是否启用补帧 */
  use_frame_interpolation?: boolean;
}
```

### 7.2 示例

```markdown
---
version: "0.3.2"
generated_at: "2026-03-15T14:30:00Z"
generator: "opsv-animator v0.3.2"
timeline:
  total_duration: "45s"
  fps: 24
shots:
  - id: "shot_001"
    shot: 1
    first_image: "artifacts/drafts_1/shot_001_draft_1.png"
    last_image: "@FRAME:shot_002_first"  # 延迟指针，运行时解析
    motion_prompt_zh: "侦探点燃香烟，烟雾缓缓上升，霓虹灯光在湿漉漉的地面上反射"
    motion_prompt_en: "A man lights a cigarette, smoke slowly rising, neon lights reflecting on wet ground"
    duration: "5s"
    reference_images:
      - "videospec/elements/@role_detective_ref.png"
    output_path: "artifacts/videos/shot_001.mp4"
    is_keyframe: true
    
  - id: "shot_002"
    shot: 2
    first_image: "@FRAME:shot_001_last"  # 承接上一镜尾帧
    middle_image: "artifacts/drafts_2/shot_002_mid.png"
    motion_prompt_zh: "侦探转身走入黑暗，镜头缓缓后拉"
    motion_prompt_en: "Man turns and walks into darkness, camera slowly dollies back"
    duration: "5s"
    output_path: "artifacts/videos/shot_002.mp4"
    use_frame_interpolation: true
---

# Shotlist - Act 1 Sequence

> 此文件由 `/opsv-animator` 自动生成
> 手动编辑可能导致编译错误
```

---

## 8. 枚举类型定义

### 8.1 AssetType

```typescript
enum AssetType {
  CHARACTER = 'character',       // 角色
  SCENE = 'scene',               // 场景
  PROP = 'prop',                 // 道具
  COSTUME = 'costume',           // 服装
  VEHICLE = 'vehicle',           // 载具
  WEAPON = 'weapon',             // 武器
  CREATURE = 'creature',         // 生物
  FX = 'fx'                      // 特效
}
```

### 8.2 AssetStatus

```typescript
enum AssetStatus {
  DRAFT = 'draft',               // 草稿
  CONFIRMED = 'confirmed',       // 已确认
  DEPRECATED = 'deprecated',     // 已废弃
  ARCHIVED = 'archived'          // 已归档
}
```

### 8.3 JobType

```typescript
enum JobType {
  IMAGE_GENERATION = 'image_generation',
  VIDEO_GENERATION = 'video_generation'
}
```

### 8.4 CameraType (景别)

```typescript
enum CameraType {
  EXTREME_WIDE = 'extreme_wide',     // 大远景
  WIDE_SHOT = 'wide_shot',           // 全景
  LONG_SHOT = 'long_shot',           // 远景
  MEDIUM_LONG = 'medium_long',       // 中远景
  MEDIUM_SHOT = 'medium_shot',       // 中景
  MEDIUM_CLOSE = 'medium_close',     // 中近景
  CLOSE_UP = 'close_up',             // 特写
  EXTREME_CLOSE = 'extreme_close',   // 大特写
  INSERT = 'insert'                  // 插入镜头
}
```

### 8.5 CameraAngle

```typescript
enum CameraAngle {
  EYE_LEVEL = 'eye_level',           // 平视
  LOW_ANGLE = 'low_angle',           // 仰拍
  HIGH_ANGLE = 'high_angle',         // 俯拍
  DUTCH = 'dutch',                   // 荷兰角
  OVERHEAD = 'overhead',             // 正俯视
  WORM = 'worm'                      // 仰角极大
}
```

### 8.6 CameraMovement

```typescript
enum CameraMovement {
  STATIC = 'static',                 // 固定
  PAN_LEFT = 'pan_left',             // 左摇
  PAN_RIGHT = 'pan_right',           // 右摇
  TILT_UP = 'tilt_up',               // 上摇
  TILT_DOWN = 'tilt_down',           // 下摇
  DOLLY_IN = 'dolly_in',             // 推
  DOLLY_OUT = 'dolly_out',           // 拉
  TRUCK_LEFT = 'truck_left',         // 左移
  TRUCK_RIGHT = 'truck_right',       // 右移
  CRANE_UP = 'crane_up',             // 升
  CRANE_DOWN = 'crane_down',         // 降
  HANDHELD = 'handheld',             // 手持
  STEADICAM = 'steadicam',           // 斯坦尼康
  GIMBAL = 'gimbal'                  // 云台
}
```

### 8.7 AspectRatio

```typescript
enum AspectRatio {
  WIDESCREEN = '16:9',               // 宽屏
  VERTICAL = '9:16',                 // 竖屏
  SQUARE = '1:1',                    // 方形
  ULTRAWIDE = '21:9',                // 超宽
  CLASSIC = '4:3',                   // 经典
  CINEMASCOPE = '2.39:1'             // 电影宽屏
}
```

### 8.8 Quality

```typescript
enum Quality {
  SD = '480p',
  HD = '1080p',
  TWO_K = '2K',                      // 2048px
  FOUR_K = '4K',                     // 4096px
  EIGHT_K = '8K'                     // 8192px
}
```

### 8.9 Duration

```typescript
enum Duration {
  THREE_SEC = '3s',
  FIVE_SEC = '5s',
  TEN_SEC = '10s',
  FIFTEEN_SEC = '15s'                // 视频上限
}
```

### 8.10 ShotStatus

```typescript
enum ShotStatus {
  PENDING = 'Pending',               // 待处理
  DRAFT = 'Draft',                   // 草稿
  APPROVED = 'Approved',             // 已批准
  REVISION = 'Revision'              // 需修改
}
```

---

## 9. 验证规则

### 9.1 资产验证规则

```yaml
规则集:
  - id: asset_name_format
    描述: "资产名称必须以 @ 开头，只能包含字母、数字、下划线"
    正则: "^@[a-zA-Z][a-zA-Z0-9_]*$"
    错误码: E1001
    
  - id: has_image_consistency
    描述: "has_image=true 时必须提供 reference_images"
    条件: "has_image == true"
    要求: "reference_images != null && reference_images.length > 0"
    错误码: E1002
    
  - id: image_exists
    描述: "参考图路径必须存在"
    条件: "has_image == true"
    要求: "所有 reference_images 路径存在"
    错误码: E1003
    
  - id: visual_traits_required
    描述: "character 类型必须提供 visual_traits"
    条件: "type == 'character'"
    要求: "visual_traits != null"
    错误码: E1004
```

### 9.2 任务验证规则

```yaml
规则集:
  - id: job_id_unique
    描述: "任务ID在同一批次必须唯一"
    范围: "batch"
    错误码: E3001
    
  - id: image_job_format
    描述: "图像任务输出必须是图片格式"
    条件: "type == 'image_generation'"
    要求: "output_path 以 .png/.jpg/.webp 结尾"
    错误码: E3002
    
  - id: video_job_duration
    描述: "视频任务必须有时长"
    条件: "type == 'video_generation'"
    要求: "payload.duration != null"
    错误码: E3003
    
  - id: video_first_image
    描述: "视频任务首帧图必须存在"
    条件: "type == 'video_generation'"
    要求: "schema_0_3_2.first_image 存在且非 @FRAME: 指针时可访问"
    错误码: E3004
    
  - id: dependency_exists
    描述: "依赖的任务ID必须存在"
    条件: "dependencies != null"
    要求: "所有 dependency IDs 在项目中存在"
    错误码: E3005
```

### 9.3 项目配置验证规则

```yaml
规则集:
  - id: aspect_ratio_valid
    描述: "画幅比例必须是预设值之一"
    允许值: ["16:9", "9:16", "1:1", "21:9", "4:3"]
    错误码: E2001
    
  - id: schema_version_match
    描述: "Schema 版本必须兼容"
    要求: "schema_version 与 CLI 版本兼容"
    错误码: E2002
```

---

## 10. 版本兼容性

### 10.1 版本策略

| 版本变更 | 说明 | 示例 |
|----------|------|------|
| **Major** (X.0.0) | 破坏性变更，不向后兼容 | 1.0.0 → 2.0.0 |
| **Minor** (0.X.0) | 功能新增，向后兼容 | 0.2.0 → 0.3.0 |
| **Patch** (0.0.X) | Bug修复，完全兼容 | 0.3.1 → 0.3.2 |

### 10.2 0.3.x 版本演进

```
0.3.0 (执行时代)
├── 新增: VideoModelDispatcher
├── 新增: SiliconFlow 集成
└── 变更: 绝对路径输出

0.3.1 (因果时代)
├── 新增: @FRAME 延迟指针
├── 新增: FrameExtractor
└── 新增: 依赖图谱执行

0.3.2 (审阅时代) [当前]
├── 新增: target_last_prompt
├── 新增: Draft 延迟绑定
├── 新增: Script.md 画廊化
└── 新增: JobValidator
```

### 10.3 向后兼容保证

- **0.3.2** 可以完全读取 **0.3.0** 和 **0.3.1** 的项目
- **0.3.2** 新增的字段都是 `optional`
- 废弃字段保留到 **0.4.0**

---

## 11. 示例集合

### 11.1 最小可用项目

```markdown
# project.md
---
name: "Minimal Project"
aspect_ratio: "16:9"
resolution: "2K"
schema_version: "0.3.2"
---
```

```markdown
# videospec/elements/@role_actor.md
---
name: "@role_actor"
type: "character"
has_image: false
visual_traits:
  age_group: "adult"
  clothing: "casual t-shirt and jeans"
---

Simple character for testing.
```

```markdown
# videospec/shots/Script.md
---
shots:
  - id: "shot_001"
    environment: "simple studio background"
    subject: "@role_actor standing still"
    camera:
      shot_type: "medium_shot"
    duration: "3s"
---
```

### 11.2 复杂项目示例

参见 `templates/` 目录中的示例项目。

---

## 附录

### A. JSON Schema 定义

完整的 JSON Schema 文件位于 `docs/schema/json/` 目录：
- `character-asset.schema.json`
- `scene-asset.schema.json`
- `job.schema.json`
- `project-config.schema.json`

### B. TypeScript 类型导出

```typescript
// 从 PromptSchema.ts 导出所有类型
export * from './src/types/PromptSchema';
export * from './src/errors/OpsVError';
```

### C. 验证工具

```bash
# 验证项目结构
opsv validate

# 验证单个文件
opsv validate ./videospec/elements/@role_hero.md

# 验证任务队列
opsv validate ./queue/jobs.json --schema job
```

---

**文档结束**

*Schema 版本: 0.3.2*  
*最后更新: 2026-03-15*  
*维护者: OpsV Core Team*

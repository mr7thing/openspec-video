# 文件规范 (File Spec)

> 适用于 Multi-Ref Pack 所有技能

---

## 1. 目录结构

### 1.1 默认模式（一级目录）

```
<project>/
├── project.md                    # 项目元信息（S1 graphify-drama 产出）
├── .opsv/
│   ├── api_config.yaml           # API 密钥
│   └── input_types.yaml          # 输入类型注册（可选）
├── videospec/
│   ├── Script.md                 # 剧本拆解（S2 beat-script 产出）
│   ├── shortlist.md              # Shortlist（S3 create-shortlist 产出）
│   ├── _category_validate.yaml   # 验证规则
│   ├── elements/                 # 共享资产（角色/道具等，category 可自定义）
│   │   ├── LuRan.md              # 角色定档（S4 create-elements 产出）
│   │   ├── Sword.md              # 道具定档（S4 create-elements 产出）
│   │   └── voice_LuRan.md        # 配音资产（S4 create-elements 产出）
│   ├── scenes/                   # 场景（固定目录，不可改名）
│   │   ├── Dojo-Day.md           # 场景定档（S4 create-elements 产出）
│   │   └── Dojo-Night.md         # 场景变体
│   └── shots/                    # 当前拍摄中的 EP 镜头
│       ├── S01-Shot01.md         # 单个镜头（S3 create-shortlist / S5+ 后续阶段产出）
│       ├── S01-Shot02.md
│       ├── EP01/                 # 已完成的 EP，移入子目录
│       │   ├── S01-Shot01.md
│       │   └── S01-Shot02.md
│       └── EP02/                 # 空目录占位，下一批
└── opsv-queue/                   # OPSV 自动管理（只增不删）
    └── videospec_circle1/
        └── _manifest.json
```

### 1.2 EP 目录模式（指定 `--dir`）

多集并行时，每集独立一个 EP 目录，所有集级文档（Script、Shortlist、Storyboard、Shot）集中在 EP 目录内。`project.md`、`elements/`、`scenes/` 仍放根目录跨集共享。

```
videospec/
├── project.md                    # 项目级（跨集共享）
├── elements/                     # 共享资产（跨集共享）
├── scenes/                       # 场景定义（跨集共享）
├── EP01/                         # EP01 独立工作区
│   ├── Script.md                 # S2 产出
│   ├── shortlist.md              # S3 产出
│   ├── Storyboard.md             # S5 产出
│   └── shots/                    # S3 镜头文档
│       ├── S01-Shot01.md
│       └── S01-Shot02.md
└── EP02/                         # 下一集独立工作区
    └── ...
```

**模式选择**：默认用一级目录快速启动；明确多集并行时用 EP 目录模式，`--dir videospec/EP{XX}` 跑完整任务环。两种模式可混用——默认模式跑完后手动整理到 EP 目录归档。

## 2. 命名规范

### 2.1 基本原则

- **统一 CamelCase**（驼峰命名）：`Storyboard` 非 `storyboard`，`Shot` 非 `shot`
- **名称 + 属性用分隔符连接**：`{Name}-{Attribute}`，便于理解
- **`shot-` 前缀**用于可跨包复用的技能（`shot-reference`、`shot-storyboard`）

### 2.2 命名表

| 对象 | 规则 | 示例 |
|------|------|------|
| 角色 id | PascalCase | `LuRan`, `YunLi` |
| 场景 id | PascalCase | `Dojo-Day`, `Street-Night` |
| 道具 id | PascalCase | `Sword`, `Lantern` |
| shot_id | `S{场景号}-Shot{镜头号}` | `S01-Shot01`, `S02-Shot03` |
| 资产文件 id | `{Name}-{Attribute}` | `LuRan-Portrait`, `Dojo-Wide` |
| 分镜文档 id | `storyboard-{shot_id}` | `storyboard-S01-Shot01` |
| 视频文档 id | `shot-{shot_id}` | `shot-S01-Shot01` |
| 声音文档 id | `Voice-{Name}` / `BGM-{Name}` | `Voice-LuRan` |
| 技能名（可复用） | `shot-{name}` | `shot-reference`, `shot-storyboard` |
| 技能名（本包专属） | `{作用}-{对象}` | `graphify-drama`, `beat-script`, `create-elements` |

## 3. 元素分类

### 3.1 目录职责

| 目录 | 内容 | 规则 |
|------|------|------|
| `elements/` | 共享资产（跨镜头复用）：角色、道具、配音 | Category 用户可自定义（`character`/`role` 均可） |
| `scenes/` | 场景 | **固定目录**，不可改名 |
| `shots/` | 当前 EP 的单个镜头 `.md` | 第一层 `.md` 被 Circle 扫描 |

### 3.2 EPXX 规则

- `shots/` 根目录放**当前正在拍**的 EP 的单个 shot `.md`
- 一个 EP 拍完后，全部移入 `shots/EP{XX}/` 子目录
- Circle 只扫描第一层 `.md`（不递归），子目录内已完成镜头不会被扫到
- 下一批镜头放 `shots/` 根目录，`shots/EP{下一集}/` 创建空目录占位

## 4. 文件格式

- 全部 UTF-8 编码
- frontmatter 用 `---` 包围，**必须成对**
- YAML 缩进 2 空格
- 同一文档多处 YAML frontmatter 之间用 `---` 隔开
- `@` 是文档引用语法，**不是文件名前缀**。文件名不含 `@`

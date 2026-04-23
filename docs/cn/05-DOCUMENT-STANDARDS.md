# 文档规范 (v0.6.4)

> OpenSpec-Video 采用 **四层规范体系**，确保文档即代码的确定性。

## 一、四层规范架构

```
Layer 1: @ 引用语法        — 文档间链接的标准化表达
Layer 2: Frontmatter Schema — YAML 元数据的类型约束
Layer 3: Markdown Body      — 人类可读的正文区域规范
Layer 4: Execution Rules    — 编译期 + 执行期的语义校验
```

---

## 二、Frontmatter Schema

所有 `.md` 文件必须以 YAML frontmatter 开头（`---` 包裹）。

### 2.1 元素文档 (elements/*.md)

```yaml
---
type: character | prop | costume    # 资产类型（必填）
status: drafting | approved         # 状态（必填）
visual_brief: >
  视觉描述简述（折叠块语法）
visual_detailed: >
  视觉详细特征描述。支持双引号内容如 "Cinematic Lighting" 而不报错。
prompt_en: >
  Core MJ/SD Prompt. Derived from visual_detailed.
refs:                               # 引用与变体依赖
  - elder_brother
reviews:                            # 审阅记录
  - "2025-03-15: approved"
---
```

### 2.2 场景文档 (scenes/*.md)

与元素文档结构相同。`type: scene`。

### 2.3 分镜设计文档 (shots/Script.md)

```yaml
---
type: shot-design                   # 固定值
status: drafting | approved
total_shots: 48                     # 分镜总数
refs:                               # 本文件引用的所有资产 ID
  - elder_brother
  - younger_brother
  - classroom
---
```

### 2.4 动态分镜表 (shots/Shotlist.md)

```yaml
---
type: shot-production               # 固定值
status: drafting | approved
---
```

正文每个 Shot 包含 YAML 状态块：

```markdown
## Shot 01 (5s)

```yaml
id: shot_01
status: pending
first_frame: "@FRAME:shot_01_first"
last_frame: "@FRAME:shot_01_last"
duration: 5s
```

Prompt: @elder_brother 走进教室...
```

### 2.5 项目配置 (videospec/project.md)

```yaml
---
type: project
aspect_ratio: "16:9"
resolution: "1920x1080"
global_style_postfix: "cinematic lighting, film grain"
vision: "一个关于兄弟情的短片"
---
```

---

## 三、@ 引用语法

### 3.1 基本格式

```
@asset_id           — 引用资产的默认变体
@asset_id:variant   — 引用资产的指定变体
```

### 3.2 示例

```markdown
## Shot 01 - 教室重逢
@elder_brother 走进教室，看见 @younger_brother 坐在窗边。
背景是 @classroom:morning 的晨光氛围。
```

### 3.3 解析规则

| 引用 | 解析目标 |
|------|---------|
| `@elder_brother` | `elements/elder_brother.md` → `## Approved References` → `default` 变体 |
| `@elder_brother:childhood` | 同上，`childhood` 变体 |
| `@classroom:morning` | `scenes/classroom.md` → `morning` 变体 |
| `@FRAME:shot_01_last` | `opsv-queue/frames/shot_01_last.png`（视频尾帧） |

### 3.4 约束

- 引用目标必须存在于 `elements/` 或 `scenes/` 目录
- 引用的变体必须在 `## Approved References` 区域中已 approve
- 未 approve 的依赖会被 DependencyGraph 阻塞，任务暂缓执行

---

## 四、Markdown Body 规范

### 4.1 必须保留的标题骨架

以下标题是文档的"骨架"，即使没有内容也必须保留：
- `## Vision`: 记录导演的艺术直觉
- `## Design References`: 设计参考与附件（`![name](path)`）
- `## Approved References`: 审批回写区域（由 Review UI 自动维护）

### 4.2 Approved References 区域

当资产被 `opsv review` 审批通过后，自动在正文末尾追加：

```markdown
## Approved References

![default](../../opsv-queue/approved/elder_brother_default.png)
![childhood](../../opsv-queue/approved/elder_brother_childhood.png)
```

### 4.3 Script.md 正文结构

分镜信息由**正文 `## Shot NN` 标题**解析，不使用 frontmatter `shots[]` 数组。

```markdown
## Shot 01 - 教室重逢
@elder_brother 推开教室门，晨光洒入走廊。
Camera: 中景跟拍，缓慢推进。

## Shot 02 - 窗边对视
@younger_brother 回头看向门口，微笑。
Camera: 特写，浅景深。
```

---

## 五、Execution Rules (编译 + 校验)

### 5.1 编译期通用校验（JobValidator）

- 双引号清洗（YAML → JSON 边界问题）
- 必填字段检查（id, prompt）
- 残留引号检测

### 5.2 Provider 参数防御（StandardAPICompiler）

| Provider | 防御逻辑 |
|----------|----------|
| `siliconflow` | 强制尺寸对齐到推荐列表，清理冗余字段 |
| `volcengine` | `2K` → `1920x1080`，默认 `1280x720` |
| `minimax` | 默认启用 `prompt_optimizer: true` |

### 5.3 frame_ref (视频任务)

视频生成任务使用 `frame_ref` 结构引用首帧/尾帧：

```json
{
  "frame_ref": {
    "first": "/path/to/first_frame.png",
    "last": "/path/to/last_frame.png"
  }
}
```

- 首帧/尾帧可以是文件路径，也可以是 `@FRAME:shot_id_last` 指针
- `@FRAME` 指针由 `RefResolver` 解析为 `opsv-queue/frames/` 下的文件

---

## 六、依赖图

### 6.1 依赖关系来源

- `refs` 字段：内容引用依赖（变体依赖统一并入）

### 6.2 严格模式

```bash
opsv deps    # 查看依赖图分析
```

生成任务时，DependencyGraph 自动过滤：
- ✅ 依赖全部 approved → 可执行
- ⏸️ 依赖未 approved → 阻塞等待

### 6.3 拓扑排序与 Circle 计算

```
第1层: elder_brother, classroom    (无依赖 → ZeroCircle)
第2层: younger_brother             (依赖 elder_brother → FirstCircle)
第3层: shot_01, shot_02            (依赖多个资产 → SecondCircle)
```

Circle 序号由 `DependencyGraph` 的拓扑排序自动计算：
- 每个 Circle 内的资产互相无依赖，可并行生成
- 高 Circle 的资产必须等待其所有依赖在低 Circle 中完成并 **Approve** 后才能生成
- 目录命名：`opsv-queue/<circle>_<iteration>/`（如 `zerocircle_1`, `secondcircle_1`）

---

## 七、版本规范演进记录 (Incremental Specs Logic)

- **v0.6.4 (Circle 架构与统一队列)**:
  - **Circle 引入**: 采用 DND 五环施法概念管理资产生成依赖层次
  - **统一 opsv-queue/**: 取代 `.opsv-queue/`, `artifacts/`, `queue/`，所有运行时数据统一在 `opsv-queue/` 下
  - **命令拆分**: `opsv generate` 拆分为 `opsv imagen / animate / comfy`
  - **全局唯一序号**: `{jobId}_{seq}.{ext}` 取代旧的覆盖式命名
  - **queue_{N} 批次**: 每次 compile 新建 batch，独立递增
  - **Review 回写优化**: Approve 后直接回写源 Markdown 文档，图片保持在原队列目录中

- **v0.6.0 (Spooler Queue 架构革命)**:
  - **Dispatcher 灭亡**: `ImageModelDispatcher` / `VideoModelDispatcher` 被彻底删除，所有执行通过 Spooler Queue 管线完成
  - **三步式管线**: `opsv generate` → `opsv queue compile` → `opsv queue run` 取代旧版 `gen-image` / `gen-video` 一步到位模式
  - **服务拓扑标准化**: Global Daemon / Local Review / Task Worker 三层服务分类，端口配置解耦至 `.env`
  - **项目初始化增强**: `opsv init` 自动创建 `.opsv/`、`.opsv-queue/` 运行时目录并内建生成 `.gitignore`
  - **Provider 降级**: 所有原生 API Provider 降级为纯 `processTask()` 消费者，被动订阅物理信箱

- **v0.5.19 (工业管线稳定)**:
  - **CI/CD 集成**: 新增 GitHub Actions 自动 npm 发布工作流
  - **Agent 三角色定型**: 3 层 7 Agent 结构正式化，Creative/Guardian/Runner 三角色取代旧结构

- **v0.5.16 (精修与混合模型驱动)**:
  - **SiliconFlow 图像接入**: 支持 Qwen 文生图与指令式编辑
  - **混合驱动架构**: `SiliconFlowProvider` 重构为影/像双修架构，根据模型语义自动切换端点

- **v0.5.15 (多模态引擎调教)**:
  - **Seedance Provider**: 实现 Seedance 视频生成 Provider，支持 1.5 Pro / 2.0 Fast 双模式
  - **api_config 能力化**: 模型配置新增 `type`、`max_reference_images`、`supports_audio`、`supports_video_ref` 等能力边界字段

- **v0.5.14 (全模态纯净指令)**:
  - **文档纯净**: `Shotlist.md`、`Script.md` 严禁硬编码基座模型或执行流配置

- **v0.5.8 (架构鲁棒性)**: 
  - 长文本字段强制使用折叠块语法 (`>`)，彻底消除引号冲突

- **v0.5.7 (视觉语义标准化)**:
  - 引入 `visual_brief` / `visual_detailed` 语义标签

- **v0.5.6 (SSOT 2.0)**:
  - YAML 为先：渲染管线彻底剥离对 Markdown 正文的描述提取

- **v0.5.0 (架构进化)**:
  - 引入 `DependencyGraph` 实现非线性任务解析
  - 废弃 YAML 数组分镜，改为 Markdown `## Shot NN` 标题解析

> [!IMPORTANT]
> **规范维护准则**: 任何版本更新必须以增量方式记录规范变更（记录 `vX.Y.Z` 路径），严禁覆盖式删除过往决策，以保证设计决策的全貌可追溯。

---

> *"四层规范，层层递进，从语法到语义，从编译到执行。"*
> *OpsV 0.6.4 | 最后更新 2026-04-22*

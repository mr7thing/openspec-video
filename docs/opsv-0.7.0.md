# OpsV v0.7.0 Plan

## 发布日期
2026-04-26

---

## 一、Git Commit 绑定机制（已有实现）

### 规则
- `opsv init` — git init + 首次 commit（已有）
- `opsv review` — 两阶段 commit
  - 启动时：`[review] {timestamp}` — checkpoint
  - 关闭时：`[review done] {timestamp} ({reason})`
  - 关闭原因：manual / sigint / ttl-expired / idle-timeout

### commit message 格式
```
[review] 2026-04-26T02:48:00.000Z — started
[review done] 2026-04-26T05:12:00.000Z — approved 12 files (ttl-expired)
```

### 范围
- 仅 review 命令，其他命令（imagen / queue compile 等）不绑定 git commit

---

## 二、Circle 机制重构

### 核心原则
**目录创建触发条件 = 文件列表变化（谁在哪个环），不是内容/状态变化。**

### 2.1 目录命名规则

| 类型 | 格式 | 示例 |
|------|------|------|
| 默认 circle 目录 | `{dir}_zerocircle_{n}` | `videospec_zerocircle_1` |
| 多剧集 circle 目录 | `{name}_zerocircle_{n}` | `episode_2_zerocircle_1` |
| manifest | `{dir}_manifest.json` | `videospec_manifest.json` |
| 依赖图 | `{dir}_graph.json` | `videospec_graph.json` |

### 2.2 状态文件路径（`.opsv/`）

```
.opsv/
  ├── api_config.yaml
  ├── videospec_graph.json       # 依赖图
  └── videospec_manifest.json    # manifest
```

### 2.3 opsv-queue 目录结构

```
opsv-queue/
  └── videospec_zerocircle_1/    # 任务目录
      ├── imagen_jobs.json
      ├── video_jobs.json
      ├── comfy_jobs.json
      ├── volcengine-seadream5/queue_1/
      │   ├── shot_01_1.png
      │   ├── shot_01_1.json
      │   └── ...
      └── siliconflow-wan22/queue_1/
```

### 2.4 命令改造

#### 合并 `status` + `manifest`
```
opsv circle status
```
- 实时检查各 Circle 状态（approved 数量）
- 同时写入 `.opsv/videospec_manifest.json`
- 不再有独立的 `manifest` 子命令

#### 新增 `create` 命令
```
opsv circle create [--dir <path>] [--skip-middle-circle]
```
- `--dir <path>`：指定目录（默认 `videospec`）
- `--skip-middle-circle`：简化模式，所有非 shotlist → zerocircle，shotlist → endcircle
- 行为：生成图文件 → 激活为当前图（旧图改名为 `.back`）

### 2.5 统一目录创建逻辑

在 `DependencyGraph` 里新增方法：

```typescript
// 确保指定圈层的目录存在，文件列表变化才新建
ensureCircleDirectories(circleIndex: number): Promise<{
  dir: string,           // 如 "videospec_zerocircle_1"
  isNew: boolean,        // 是否新建
  iteration: number      // 序号
}>

// 内部对比文件列表
private diffFileList(circleIndex: number, newFiles: string[]): Promise<boolean>
```

**触发条件：**
- `opsv imagen` / `opsv animate` / `opsv comfy compile` 都调用此方法
- 文件列表（资产 ID 列表）变化了才新建目录

### 2.6 圈层隔离规则

```
opsv imagen zerocircle
  → 只处理属于 ZeroCircle 的资产
  → 如果显式指定了 firstcircle 的文件 → 报错

opsv imagen firstcircle
  → 只处理属于 FirstCircle 的 shots
  → 如果指定了 zerocircle 的文件 → 报错
```

报错信息：`{asset_id} 属于 {circle_name}，请先执行 opsv imagen {circle_name}`

---

## 三、Shot 文件系统

### 3.1 目录结构

```
videospec/shots/
  ├── shot_01.md      ← 独立数据源
  ├── shot_02.md      ← 独立数据源
  ├── Script.md       ← 聚合展示（opsv script 刷新）
  └── Shotlist.md     ← 末环，独立处理（不参与依赖图）
```

### 3.2 Shot 文件格式

```yaml
---
id: shot_01
status: draft
first_frame: "@shot_01:first"
last_frame: "@shot_01:last"
duration: "5s"
refs:
  - "@character_01"
  - "@scene_forest"
---

## Shot 01 - 开场森林

角色走进阴暗的森林，镜头缓慢推进...

## Design References

## Approved References
```

### 3.3 关键设计点

- `id` 来自文件名（`shot_01.md` → `shot_01`）
- frontmatter 不重复 `id` 字段
- `first_frame` / `last_frame` 用 `@shot_XX:first/last` 语法
- `refs` 参与拓扑排序
- `status`：`draft` / `approved` / `syncing` / `drafting`

### 3.4 Shotlist.md 规则（末环）

- **不参与依赖图**，独立处理
- **不参与圈层序号递增逻辑**
- 包含 YAML 状态块（status / first_frame / last_frame / duration）
- 视频生成结果提取首尾帧截图，同目录保存：
  - `shot_01_first.png`
  - `shot_01_last.png`

### 3.5 Script.md

```bash
opsv script
```

- **新命令**，聚合 shot_*.md 生成 Script.md
- review 之后需要手动刷新：`opsv script`
- 格式：引用加注来源

```markdown
## Shot 01 - 开场森林
> 来源：shot_01.md

[正文内容]
```

### 3.6 管线分离

```
管线1（图片）：imagen → queue → review → approved
  → 依赖图驱动
  → 生成图片结果

管线2（视频）：animate → queue → review → video → extract frames
  → 不走依赖图
  → Shotlist.md 自己读 YAML 状态
```

---

## 四、DependencyGraph 改造

### 4.1 新增方法

```typescript
class DependencyGraph {
  // 统一目录创建
  async ensureCircleDirectories(
    circleIndex: number
  ): Promise<{ dir: string; isNew: boolean; iteration: number }>

  // 图文件操作
  async saveGraph(projectRoot: string, graphName?: string): Promise<void>
  static async loadGraph(projectRoot: string, graphName?: string): Promise<DependencyGraph>
  static async activateGraph(projectRoot: string, graphName: string): Promise<void>
  static async getActiveGraph(projectRoot: string): Promise<string>

  // 文件列表对比
  private diffFileList(circleIndex: number, newFiles: string[]): Promise<boolean>
}
```

### 4.2 图文件结构

```json
{
  "circles": {
    "0": ["character_01", "scene_forest"],
    "1": ["shot_01", "shot_02"]
  },
  "activeGraph": "videospec"
}
```

### 4.3 多图管理

```
opsv circle create --dir episode_2
  → 生成 episode_2_graph.json
  → 激活 episode_2
  → 其他图文件改名为 .back

opsv circle status
  → 只操作当前激活的图
```

### 4.4 简化模式

```
opsv circle create --dir videospec --skip-middle-circle
  → 所有非 shotlist → zerocircle
  → shotlist → endcircle
  → 中间层消失
```

---

## 五、Comfy 类型

### 5.1 核心概念

- **Comfy 是类型（type）**，不是具体 Provider
- `provider: "runninghub"` / `provider: "comfyui_local"` 是具体供应商
- 工作流存储在技能目录下：`.agent/skills/{skill_name}/scripts/`

### 5.2 技能目录结构

```
.agent/skills/comfy-flux-schnell/
├── SKILL.md
└── scripts/
    └── flux_schnell.json   # 标准 ComfyUI workflow

.agent/skills/角色三视图工作流/
├── SKILL.md
└── scripts/
    └── three_view.json
```

### 5.3 工作流契约

标准 ComfyUI workflow JSON，约定输入节点名称包含 `input-`：

```json
{
  "_opsv_contract": {
    "type": "comfy",
    "inputs": ["input-prompt", "input-image1"],
    "outputs": ["output-images"]
  },
  "1": { "_meta": { "title": "input-prompt" }, "inputs": { "text": "INSERT_HERE" } }
}
```

### 5.4 compile 生成的 task JSON

```json
{
  "_opsv": {
    "type": "comfy",
    "provider": "runninghub",
    "skill": "角色三视图工作流"
  },
  "task": {
    "id": "character_01",
    "inputs": [
      { "node": "input-prompt", "type": "text", "description": "角色描述" },
      { "node": "input-image1", "type": "image", "description": "参考图" }
    ],
    "outputs": [
      { "node": "output-images", "type": "image" }
    ]
  }
}
```

### 5.5 Agent 工作流

1. `opsv comfy compile` → 生成任务描述 JSON
2. Agent 读取技能目录下 workflow JSON
3. Agent 复制 workflow 到队列目录
4. Agent 注入 input-prompt、input-image1 等节点的值
5. Agent 填入输出文件名
6. `opsv queue run` → 执行

### 5.6 Provider 配置

```yaml
providers:
  runninghub:
    type: comfy
    api_url: https://www.runninghub.cn/task/openapi
```

技能目录不需要配置，Agent 自己从 `.agent/skills/` 发现。

---

## 六、待下版本

- App 类型（浏览器扩展 + 队列消费）
- 多剧集管理的完整迁移路径
- Shot 文件迁移脚本（Script.md → shot_*.md）

---

## 七、文件改动清单

### 新增文件
- `docs/opsv-0.7.0.md` — 本文档
- `src/commands/script.ts` — 新命令

### 重写文件
- `src/core/DependencyGraph.ts` — 多图管理 + ensureCircleDirectories
- `src/commands/circle.ts` — 合并 status+manifest + 新增 create
- `src/automation/JobGenerator.ts` — 调用 ensureCircleDirectories
- `src/automation/AnimateGenerator.ts` — 调用 ensureCircleDirectories
- `src/utils/circleStatus.ts` — 适配新路径
- `src/commands/imagen.ts` — 圈层隔离检查
- `src/commands/animate.ts` — 适配新路径

### 路径改动
- manifest：`opsv-queue/circle_manifest.json` → `.opsv/videospec_manifest.json`
- 依赖图：`dependency-graph.json` → `videospec_graph.json`
- circle 目录：`zerocircle_1` → `videospec_zerocircle_1`

---

## 八、实现顺序

1. DependencyGraph 改造（基础）
2. circle 命令合并 + create（基础）
3. 目录路径改动（适配基础）
4. imagen / animate / comfy compile 接入 ensureCircleDirectories
5. Shot 文件格式落地
6. opsv script 命令
7. 圈层隔离检查逻辑
8. 收尾测试

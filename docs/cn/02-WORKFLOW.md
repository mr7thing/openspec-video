# OpsV 工作流程说明 (Workflow Guide)

> 从灵感到成片的三角色循环，理解 Agent 协作与 CLI 命令的完整交互逻辑。

---

## 全景流程图 (三角色协作)

```mermaid
flowchart TD
    START["💡 创意/Addon 入伙"] --> INIT["opsv init (项目初始化)"]
    
    subgraph Creative["🎨 Creative-Agent 领域"]
        BRAIN["🧠 opsv-brainstorming (脑暴优先)"]
        ARCH["🏛️ opsv-architect (世界观锚定)"]
        ASSET["🎨 opsv-asset-designer (资产建模)"]
        SCRIPT["📐 opsv-script-designer (分镜编导)"]
        
        BRAIN --> ARCH
        ARCH -->|"project.md + story.md"| ASSET
        ASSET -->|"elements/ + scenes/"| SCRIPT
    end

    INIT --> BRAIN
    
    subgraph Guardian["🛡️ Guardian-Agent 领域"]
        PREGEN["🔍 opsv-pregen-review (审前评审)"]
        OPS["⚙️ opsv-ops-mastery (规范哨兵)"]
        
        PREGEN --> OPS
    end

    SCRIPT -->|"Script.md"| PREGEN
    
    subgraph Runner["🚀 Runner-Agent 领域"]
        GEN["opsv generate (意图编译)"]
        COMPILE["opsv queue compile (原子化拆解)"]
        RUN["opsv queue run (单线程消费)"]
        REVIEW["opsv review (可视化审阅)"]
        ANIM["animation-director + opsv-animator"]
    end

    OPS -->|"✅ PASS"| GEN
    GEN -->|"jobs.json"| COMPILE
    COMPILE -->|".opsv-queue/pending/"| RUN
    RUN --> REVIEW
    REVIEW -->|"Approve ✅"| ANIM
    ANIM -->|"Shotlist.md"| GEN
    REVIEW -->|"Draft 📝 回滚"| BRAIN

    style Creative fill:#fef3e2,stroke:#e67e22,stroke-width:2px
    style Guardian fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style Runner fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
```

---

## 阶段一：项目初始化 (Init)

### 触发命令
```bash
opsv init [projectName]
```

### 发生了什么
1. **交互式选择** AI 助手（Gemini / Claude / OpenCode / Trae）或通过 CLI flag 非交互指定
2. **复制模板**：
   - `.agent/` — 3 个 Agent 角色定义 + 9 个 Skills 技能手册
   - `.env/` — API 配置模板
   - `AGENTS.md` — 按选择复制
3. **创建目录骨架**：
   - `videospec/stories/`、`videospec/elements/`、`videospec/scenes/`、`videospec/shots/`
   - `artifacts/`、`queue/`
   - `.opsv/`（运行时状态）、`.opsv-queue/`（Spooler 物理信箱）
4. **生成 `.gitignore`**：内建生成默认忽略规则，自动排除运行时目录

### 产物
```
my-project/
├── .agent/
│   ├── Creative-Agent.md
│   ├── Guardian-Agent.md
│   ├── Runner-Agent.md
│   └── skills/...
├── .env/api_config.yaml
├── .opsv/                  ← v0.6 新增
├── .opsv-queue/            ← v0.6 新增
│   ├── inbox/
│   ├── working/
│   ├── done/
│   └── corrupted/
├── videospec/
│   ├── stories/
│   ├── elements/
│   ├── scenes/
│   └── shots/
├── artifacts/
├── queue/
└── .gitignore              ← v0.6 内建生成
```

---

## 阶段二：脑暴与文档锚定 (Brainstorming & Spec Anchoring)

### 负责 Agent
**Creative-Agent** → 调用 `opsv-brainstorming` + `opsv-architect`

### 协作逻辑
任何**创作类技能 (Creative Skills)** 或 **Addon**（如 Comic Pack）注入的创意，最终都必须落地为 `videospec/` 目录下的 Markdown 文档。

### 核心动作
1. **脑暴优先**：严禁在未确认创意细节前直接落盘。通过三向提案（标准/先锋/意境）深挖导演意志。
2. **Spec 落盘**：由创作插件或用户定义技能生成初稿（`project.md` 和 `story.md`）。
3. **移交守卫**：文档初稿完成后，必须交由 **Guardian-Agent** 执行反射同步。

### 同步反馈回路 (The Sync Loop) — 核心要求
**原则：正文是意志（Soul），YAML 是指令（CMD）。**
- **反射同步**：当 Markdown 正文（Body）被修改后，Guardian-Agent 负责同步更新 YAML 中的 `visual_detailed` 字段。
- **对话一致性**：每轮 Review 对话结束后，正文描述与 YAML 表头必须 100% 语义对齐。

---

## 阶段三：资产建模 (Asset Specification)

### 负责 Agent
**Creative-Agent** → 调用 `opsv-asset-designer`

### 工作规则

1. **先读全局上下文**：必须读取 `project.md` 了解时代氛围和风格
2. **双通道参考图体系**：
   - `## Design References`（d-ref）：放入生成本实体时需要的输入参考图
   - `## Approved References`（a-ref）：放入定档后的正式参考图（经 `opsv review` 审批确认）
   - 两节均为空时 → 纯文生图，使用 `visual_detailed`
   - 任一节非空时 → 使用 `visual_brief` + 参考图
3. **YAML 存元数据，Markdown Body 存参考图链接** — 用户只维护一处

### 质检门禁 (Dams)
由 **Guardian-Agent** 执行：
1. **`opsv validate`**：检测 Markdown 与 YAML 头部是否符合 Zod 校验。
2. **`opsv-pregen-review`**：审前评审，确保视觉颗粒度达标后方可进入生成。

---

## 阶段四：编译 → 投递 → 消费 → 审阅 (Spooler Queue Pipeline)

这是 v0.6.0 的核心架构变革。旧版的 `gen-image` / `gen-video` 一步到位模式已被分解为三步式 Spooler 管线。

### 4.1 分镜设计

**负责 Agent**：**Creative-Agent** → 调用 `opsv-script-designer`

- 输出 `videospec/shots/Script.md`（**纯 Markdown 正文，无 YAML 配置数组**）
- 每个 Shot 设计时长 **3-5 秒**，上限 **15 秒**
- 分镜中**严禁刻画角色外貌**，必须用 `@实体名` 引用
- **严禁硬编码** `target_model` 等执行流配置

### 4.2 意图编译 (Generate)

```bash
# 从 Markdown 文档编译纯意图大纲
opsv generate
```
- 产出 `queue/jobs.json` — **纯粹的业务意图**，不含任何 API 特定参数
- 集成 DependencyGraph 严格模式，依赖未 approved 自动阻塞

### 4.3 原子化投递 (Queue Compile)

```bash
# 将意图编译为特定 API 的原子任务卡片
opsv queue compile queue/jobs.json --provider seadream

# ComfyUI 工作流编译
opsv queue compile queue/jobs.json --provider runninghub
```
- 每个 Job 被切碎为独立的 `UUID.json` 文件
- 投递进 `.opsv-queue/pending/{provider}/` 物理信箱
- 原生 API 使用 `StandardAPICompiler`，ComfyUI 使用 `ComfyUITaskCompiler`

### 4.4 单线程消费 (Queue Run)

```bash
# 启动 QueueWatcher，逐一消费任务
opsv queue run seadream
opsv queue run minimax
opsv queue run runninghub
```
- 单线程顺序提取，**原子 fs.rename** 杜绝并发冲突
- 成功 → `done/{provider}/`，失败 → `done/{provider}/`（含错误信息）
- 支持 Ctrl+C 断点恢复：`working/` 中任务自动回滚至 `inbox/`

### 4.5 Web 页面可视化审阅

```bash
# 启动本地 Review 服务（端口通过 OPSV_REVIEW_PORT 配置）
opsv review
```

1. **网格选图**：在多个并发生成的渲染草图中，挑选最佳的 1-2 张。
2. **变体命名**：为选中的设计图指定命名（如 `morning`）。
3. **Approve / Draft 双态**：
   - **Approve**：系统自动将图片作为 `Approved References` 回写，更新 `status: approved`
   - **Draft**：记录修改意见，回滚至 Creative-Agent 重新迭代

---

## 阶段五：动画编导 (Animation)

### 负责 Agent
**Runner-Agent** → 调用 `opsv-animator` + `animation-director`

### 核心任务
读取已审阅确认的 `Script.md`，提取纯动态控制指令，输出 `Shotlist.md`。

### 动静分离原则
- **不描述**穿什么衣服（已有参考图）
- **只描述**：镜头怎么动？角色怎么动？场景有什么动态变化？
- `motion_prompt_en` 必须**全英文**
- **机位优先**：强制指定摄影机运动，避免 AI 视频沦为 PPT

### 编译发布

```bash
# 将 Shotlist.md 编译为视频意图
opsv animate

# 编译为特定视频 API 任务
opsv queue compile queue/video_jobs.json --provider seedance

# 执行视频生成
opsv queue run seedance
```

### 长镜头继承
当连续运动需要无缝衔接时，后续 Shot 的 `first_image` 设为 `@FRAME:<前一个shot_id>_last`，系统会自动截取前一视频的尾帧作为下一镜头的首帧。

---

## 循环迭代

以上五个阶段并非一次通过。实际场景中，导演会基于审阅结果反复迭代：

```
Creative-Agent → Guardian-Agent → Runner-Agent → Review → (不满意) → 回滚至 Creative-Agent
```

三角色协作确保每一轮迭代中，创意、规范、执行三个维度各司其职、互不越界。

---

> *"让创意如流水般流淌，让规范如堤坝般坚固。"*
> *OpsV 0.6.1 | 最后更新: 2026-04-20*

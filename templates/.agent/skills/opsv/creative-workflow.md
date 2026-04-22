# OpsV 创意管线 (Creative Workflow)

从模糊灵感到可编译视频工程的完整创作管线。分为 5 个阶段，每个阶段有明确的输入、输出与文档规范。

---

## 阶段 0：脑暴定调 (Brainstorming)

**触发时机**：项目初始化后，收到导演初始灵感。

### 响应禁令
收到初始灵感（如"帮我写个短剧大纲"）时，**严禁**立即落盘文件。

**第一动作**：
- 提出 3 个关乎"核心冲突"、"视觉风格"或"情感底色"的追问。
- 引导导演进行审美定调。

### 三向提案 (The Trinity Choice)
在确认初步意图后，必须提供三种截然不同的创作方向：
- **方案 A (标准制式)**：符合主流审美的叙事与构图。
- **方案 B (风格化实验)**：具有极强视觉冲击力或先锋实验色彩。
- **方案 C (意境/禅意)**：强调留白、慢镜头与深度情感共鸣。

### 视觉提纯 (Visual Alchemy)
在讨论方案时，展现概念设计师的专业素养：
- **解构维度**：将角色/场景拆解为面料质感、光影布局（如伦勃朗光、体积光）、镜头语言（如微距、长焦压缩感）。
- **英文 Prompt 铸造**：生成超高密度的英文提示词，为后续渲染提供弹药。

### 共识落盘
只有当导演给出明确倾向（如"这就是我要的方向"）后，方可启动阶段 1 将创意沉淀为文档。

---

## 阶段 1：架构落盘 (Architect)

**触发时机**：脑暴结束，创意方向已确认。

### 1.1 全局配置 (`project.md`)
```yaml
---
aspect_ratio: "16:9"
resolution: "1920x1080"
engine: "siliconflow"
vision: >
  一句话阐述整个视频的总体调性和气氛。
global_style_postfix: >
  high quality, cinematic, 8k, masterpiece
status: draft
---

# Asset Manifest

## Characters
- @role_hero
- @role_villain

## Scenes
- @scene_bar

## Props
- @prop_gun
```

**硬性约束**：
- `aspect_ratio`: 默认 `"16:9"`。
- `vision`: 一两句话说明总调性。
- `global_style_postfix`: 全局绘画提示词后缀。
- `status`: 文档本身的审查状态（`draft` | `approved`）。

### 1.2 故事大纲 (`stories/story.md`)
```yaml
---
type: story-outline
status: approved
review: []
---
```

**硬性约束**：
- 采用 `## Act N` 标题结构，方便后续剧本引用。
- 文本中凡是提到已注册的资产，必须立刻使用 `@` 锚点包裹。
- 设定分段必须清晰，作为剧本 `refs` 的锚点目标。

---

## 阶段 2：资产设计 (Asset Designer)

**触发时机**：`project.md` 资产花名册已建立。

### 协同工作流
你只是"铸模者"，不负责实际产生优美的 Prompt：
1. **调用通用创作技能**（如 `visual-concept-artist`）获取视觉配方。
2. **提取并转换**：拿到外貌提示词与短句后。
3. **格式化落盘**：严格采用 OpsV 标准，写回 `videospec/elements/` 或 `videospec/scenes/`。

### 文档输出规范：双通道参考图体系

**角色/道具模板** (`elements/@id.md`)：
```yaml
---
type: "character"
status: "draft"
visual_brief: >
  视觉描述简述。
visual_detailed: >
  视觉详细特征描述。
prompt_en: >
  Core Prompt.
refs:
  - "@elder_brother"
  - "@classroom:morning"
reviews: []
---

## Vision
<!-- 导演原意 -->

## Design References
<!-- 外部参考与附件 -->

## Approved References
<!-- 审批回写区域 -->
```

**场景模板** (`scenes/@id.md`)：与角色模板语法互通，`type: "scene"`。

**硬性约束**：
- 文件名必须精确匹配花名册里的标签（如 `@boss` → `elements/@boss.md`）。
- 顶部必须由符合规范的 YAML 字典组成。
- `status: approved` 代表实体已定档可用；刚起草则为 `draft`。
- 必须设立 `## Design References`（输入参考图）和 `## Approved References`（定档后视觉形象）。

---

## 阶段 3：剧本设计 (Script Designer)

**触发时机**：资产文件已定稿（`status: approved`）。

### 多集连续剧架构
- **文件命名**：支持 `script-01.md`, `script-02.md` 等。
- **YAML 声明**：每一个剧本文件必须包含 `episode: N` 字段。
- **发现机制**：编译器通过 `type: shot-design` 自动扫描 `videospec/shots/` 下的所有剧本。

### 创意溯源 (Cross-Document Refs)
- **链接大纲**：在 YAML `refs` 中引用故事大纲的具体段落（如 `refs: ["story.md#Act 1"]`）。
- **同步工作流**：撰写剧本前，必须先吸收 `refs` 所指的大纲意图，确保叙事逻辑不发生偏离。

### 分镜设计准则
- **时长管理**：单镜头 3~5s，上限 15s。
- **资产穿透**：必须且只能使用 `@id` 引用全局资产。
- **镜头语言**：必须包含具体的景别、光影、运动描述。

### 状态机管理
- **初始状态**：新剧本默认为 `status: draft`。
- **打回流转**：若审查未通过，记录不满意的视频/图路径到 `draft_ref`，导演意见记入 `review`。
- **变现迭代**：下一轮生成时，引导模型参考 `draft_ref` 进行针对性修正。

---

## 阶段 4：动画管线 (Animator)

**触发时机**：`Script.md` 定稿，需要生成视频工程图纸。

### 协同工作流
你是"模具封装者"：
1. **调用编导能力**：调用 `animation-director` 技能构思机位、推拉摇移、特效指令。
2. **格式化落盘**：严格按照本节规范重写输出到 `videospec/shots/Shotlist.md`。

### 文档输出规范

**核心约束（显式账本模式）**：
- **混合状态图纸 (Hybrid Shot Block)**：每个 `## Shot NN` 必须严格分为"机器状态追踪 yaml 区"和"人类文案编辑 Markdown 区"。
- **显式 Video Prompt**：严禁只写 `Motion`。模型最终收到的 Prompt 仅来源于此文件。必须把 `Script.md` 中的"场景角色客观描述"与新设计的"镜头运动"**融合并完整写在 Markdown 正文里**。
- **YAML 追踪块**：
  ```yaml
  id: shot_NN
  status: pending
  first_frame: "指向定稿的参考图，若是继承则用 @FRAME:shot_XX_last"
  ```
- **多模态扩展库**：环境音效、参考视频建议放置在 `> [!note] 附加资源` 区域。

**关键帧塌缩 (@FRAME)**：
如果是连贯分镜，首帧应指向上镜的尾帧。写法：`first_frame: "@FRAME:shot_01_last"`。

**@FRAME 路径解析**（v0.6.4）：`@FRAME:shot_XX_last` 解析到 `opsv-queue/frames/` 目录。

### 视频任务生成
Shotlist.md 定稿后，由 Runner-Agent 调用：
```bash
opsv animate [--cycle auto]
```
- 默认 `--cycle auto`，自动推断依赖图末端 Circle（EndCircle）。
- 产出：`opsv-queue/<endcircle>/video_jobs.json`。
- 后续：`opsv queue compile` + `opsv queue run <provider>` 执行渲染。

---

## 阶段衔接速查表

| 阶段 | 输入 | 输出文件 | 准入条件 |
|------|------|---------|---------|
| 脑暴 | 导演灵感 | 无（对话共识） | 项目已 init |
| 架构 | 共识方向 | `project.md` + `story.md` | 脑暴完成 |
| 资产 | 花名册 | `elements/*.md` + `scenes/*.md` | 架构完成 |
| 剧本 | 定稿资产 | `shots/Script.md` | 资产 approved |
| 动画 | 定稿剧本 | `shots/Shotlist.md` | 剧本 approved |

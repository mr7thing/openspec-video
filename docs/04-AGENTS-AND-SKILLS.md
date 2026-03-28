# OpsV Agent 与 Skill 体系 (Agents & Skills)

> Agent 定义"做什么"，Skill 定义"怎么做"。理解这两层分离是驾驭 OpsV 多角色协作的关键。

---

## 架构哲学

```
┌──────────────────────────────────────────────────┐
│                   导演 (柒叔)                      │
│              ↓ 发出自然语言指令                      │
├──────────────────────────────────────────────────┤
│ Agent 层 — "人格与职责"                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐       │
│ │Architect │ │Screenwr. │ │AssetDesigner │ ...   │
│ └────┬─────┘ └────┬─────┘ └──────┬───────┘       │
│      ↓              ↓              ↓               │
├──────────────────────────────────────────────────┤
│ Skill 层 — "操作手册与规范"                         │
│ ┌───────────────┐ ┌────────────────┐ ┌──────────┐│
│ │opsv-architect │ │opsv-screenwr.  │ │opsv-a-d. ││
│ └───────────────┘ └────────────────┘ └──────────┘│
├──────────────────────────────────────────────────┤
│ CLI 层 — "编译与执行"                               │
│ opsv generate → opsv execute-image → opsv review  │
└──────────────────────────────────────────────────┘
```

- **Agent**（`.agent/*.md`）：定义角色身份、核心职责和调用哪些 Skill
- **Skill**（`.agent/skills/*/SKILL.md`）：定义具体执行规范、格式模板和质量门限
- **CLI**（`opsv` 命令）：Agent 产出 Markdown 后，由 CLI 编译执行

---

## Agent 角色矩阵

| Agent | 文件 | 职责 | 绑定 Skill |
|-------|------|------|-----------|
| **Architect** | `Architect.md` | 总架构师：将灵感锚定为项目世界观，生成 `project.md` + `story.md` | `opsv-architect` |
| **Screenwriter** | `Screenwriter.md` | 主编剧：撰写故事大纲，提纯实体资产，埋设 `@` 指针 | `opsv-screenwriter` |
| **AssetDesigner** | `AssetDesigner.md` | 资产设计师：创建 `elements/` 和 `scenes/` 下的实体定义 | `opsv-asset-designer` |
| **ScriptDesigner** | `ScriptDesigner.md` | 脚本设计师：将故事翻译为带 YAML 的结构化分镜 `Script.md` | `opsv-script-designer` |
| **Animator** | `Animator.md` | 动画编导：提取动态控制指令，生成 `Shotlist.md` | `opsv-animator` |
| **Supervisor** | `Supervisor.md` | 质检监制：自动化审查，输出 PASS/FAIL 报告 | `opsv-supervisor` |

---

## Skill 详细说明

### 1. `opsv-architect` — 项目军师手册

**触发场景**：从无到有建立新视频项目

**两阶段工作流**：

| 阶段 | 输入 | 输出 | 是否生成文件 |
|------|------|------|------------|
| Phase 1: 概念发散 | 一句歌词/模糊概念 | 3 个差异化故事方案 | ❌ 仅文字 |
| Phase 2: 世界观锚定 | 导演选择方案 | `project.md` + `story.md` | ✅ |

**关键规则**：
- 禁止在信息不足时直接生成 `project.md`
- `vision` 字段中文，`global_style_postfix` 字段纯英文
- 3 个方案必须风格差异化

---

### 2. `opsv-screenwriter` — 编剧手册

**触发场景**：充实故事血肉，撰写 `story.md`

**核心任务**：
1. **实体提纯**：识别高频出现的角色/场景/道具
2. **资产声明**：写入 `elements/` 和 `scenes/` 目录，严守 `has_image` 二元法
3. **代码化大纲**：用 `@实体名` 指针替代冗长的外貌描写

**铁律**：
- ❌ 错误："`@role_K` 那个穿着黑色破防风衣的男人走向吧台"
- ✅ 正确："`@role_K` 走向吧台"（风衣颜色只在 `K.md` 里）
- 绝不写任何 `Shot X` 等摄像机机位要求

---

### 3. `opsv-asset-designer` — 资产生成手册

**触发场景**：创建角色、场景或道具的 `.md` 定义文件

**五大准则**：
1. **上下文为王**：先读 `project.md` 了解全局风格
2. **超高精细度**：致密描写材质、光影、磨损度、情绪
3. **has_image 默认 false**：仅导演确认后才可设为 true
4. **母语友好**：正文中文，只有 `prompt_en` 字段英文
5. **YAML-First**：所有数据进 YAML Frontmatter

**三段式格式**：
```yaml
---
name: "@AssetName"
type: "character"       # character | scene | prop
has_image: false
detailed_description: >
  [致密的中文特征描写，至少3-5句话]
brief_description: "[一句话简略描述]"
prompt_en: >
  [Dense English prompt for image generation]
---

## subject
[主体描述，中文]

## environment
[环境/背景，中文]

## camera
[景别，英文]
```

---

### 4. `opsv-script-designer` — 分镜脚本手册

**触发场景**：将 `story.md` 翻译为结构化 `Script.md`

**四大规则**：
1. **时间绝对约束**：每个 Shot 3-5 秒，上限 15 秒
2. **视觉语言**：描述"摄像机看到的内容"，非文字叙事
3. **YAML 优先**：所有 Shot 定义在 `shots:` 数组中
4. **双语分离**：`prompt_en` 纯英文，其余中文

**Script.md YAML 字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 如 `shot_1` |
| `duration` | integer | ✅ | 秒数 |
| `camera` | string | ✅ | 景别与运镜 |
| `environment` | string | ✅ | 场景引用（含 @） |
| `subject` | string | ✅ | 主体动作（含 @） |
| `prompt_en` | string | ✅ | 英文渲染提示词 |
| `first_image` | string | - | 首帧参考图路径 |
| `last_image` | string | - | 尾帧参考图路径 |
| `target_last_prompt` | string | - | 靶向补帧诱饵词 |

**画廊审阅区**：为每个 Shot 预留视觉审阅廊，供 `opsv review` 回写图片。

---

### 5. `opsv-animator` — 动画执行手册

**触发场景**：从已审阅的 `Script.md` 提取运动指令，生成 `Shotlist.md`

**动静分离原则**：
- ❌ 不描述：角色穿什么衣服、环境长什么样
- ✅ 只描述：镜头怎么动？角色怎么动？场景有什么动态变化？
- `motion_prompt_en` 全英文

**Shotlist.md YAML 字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 如 `shot_1` |
| `duration` | string | ✅ | 从 Script.md 透传 |
| `reference_image` | string | ✅ | 导演确认的底图路径 |
| `motion_prompt_en` | string | ✅ | 纯动态英文指令 |
| `first_image` | string | - | 可用 `@FRAME` 延迟指针 |

**motion_prompt_en 示例**：
```
"Slow dolly in, townsfolk walking across the alley,
 steam rising from food carts, cinematic motion."
```

---

### 6. `opsv-supervisor` — 质检监制手册

**触发条件**：Slash 命令 `/opsv-qa`

| 命令 | 检查内容 | 判定标准 |
|------|---------|---------|
| `/opsv-qa act1` | 资产对账：文件与 `project.md` 花名册一致性 | 无黑户、无遗漏 |
| `/opsv-qa act2` | 死链核查：`has_image: true` 的图片路径是否真实存在 | 文件存在且 >0 bytes |
| `/opsv-qa act3` | 特征泄漏：分镜中是否有容貌描写跟在 `@实体名` 后面 | 无偷渡特征 |
| `/opsv-qa act4` | 配置核查：检查 `api_config.yaml` 确保至少有一个模型 `enable: true` | 模型开关正确配置 |
| `/opsv-qa final` | Payload 断言：`jobs.json` 的全局后缀注入和参考图路径 | 针脚对齐 |

**输出格式**：
```
🟢 PASS: 针脚严丝合缝
🔴 FAIL: 扫出 2 个未登记黑户：@xxx, @yyy
```

---

### 7. `opsv-apply-change` — 变更执行手册

**触发场景**：批量应用变更提案

**工作流**：
1. 读取 `videospec/changes/` 下的提案 `.md`
2. 逐项执行修改（如 "将 K 的大衣改为黑色"）
3. 标记完成（`- [ ]` → `- [x]`）
4. 提示运行 `opsv generate` 刷新任务队列

---

### 8. `opsv-asset-compiler` — 资产编译大脑

**触发场景**：解析含 `@` 标签的场景描述，编译为 JSON Payload

**核心逻辑**：
1. 识别 `@` 实体标签
2. 根据 `has_image` 状态选择提取策略（极简 vs 详尽描述）
3. 融合多实体的语义场景
4. 输出 `PROMPT_INTENT` + `REQUIRED_ASSETS` JSON

**输出示例**：
```json
{
  "PROMPT_INTENT": "暴雨倾盆，30多岁赛博侦探，黑色高领大衣被雨水打湿...",
  "REQUIRED_ASSETS": ["@role_K"]
}
```

---

### 9. `opsv-auto-create` — 全自动创建手册

**触发场景**：从歌词/概念一次性展开完整项目

**流程**：Intent 分析 → 草稿剧本 → 定义资产 → 生成参考图 → 全局校验

> **注意**：适合快速展开。精细控制的项目应使用 `opsv-architect` → `opsv-screenwriter` → `opsv-asset-designer` 逐步过渡。

---

### 10. `opsv-seedance-expert` — Seedance 提示词工程

**独立 Skill**（无绑定 Agent），作为 Seedance 1.5 Pro 视频生成的提示词优化指南。

**核心规范**：
- **运动描述范式**：`[Subject Action] + [Camera Movement] + [Lighting/Atmosphere]`
- **首尾帧规则**：提供首尾帧时，prompt 应重点描述"路径"而非"内容"
- **推荐词汇**：
  - 相机运动：`cinematic slow pan`, `dynamic dolly zoom`, `low-angle tracking shot`
  - 主体动作：`flowing hair`, `subtle micro-expressions`, `graceful floating`

**最佳实践**：
- 避免负面词，直接描述想要的效果
- 使用参考图时聚焦于"动作"而非"长相"
- `sound: true` 可开启空间音频，prompt 中加入环境音描述

---

## 多端 AI 支持矩阵

| AI 工具 | 配置方式 | 入口文件 |
|---------|---------|---------|
| **Gemini** (Gemini Code Assist) | 直接读取根目录 `GEMINI.md` | `GEMINI.md` |
| **OpenCode** | 读取 `.opencode/` 目录 + `AGENTS.md` | `AGENTS.md` |
| **Trae** | 手动将 `AGENTS.md` 内容复制到 Trae 智能体设定 | `AGENTS.md` + `.trae/rules/` |

三者共享同一套 `.agent/skills/` 技能库，仅全局人格配置不同。

---

> *"Agent 是灵魂，Skill 是技法，CLI 是双手。"*
> *OpsV 0.4.3 | 最后更新: 2026-03-28*

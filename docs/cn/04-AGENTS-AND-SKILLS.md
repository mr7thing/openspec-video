# OpsV Agent 与 Skill 体系 (Agents & Skills)

> Agent 定义"做什么"，Skill 定义"怎么做"。理解这两层分离是驾驭 OpsV 多角色协作的关键。

---

## 架构哲学

```
┌──────────────────────────────────────────────────┐
│                   导演 (柒叔)                      │
│              ↓ 发出自然语言指令                      │
├──────────────────────────────────────────────────┤
│ Agent 层 — "三角色协作"                              │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐│
│ │ Creative    │ │   Guardian   │ │   Runner    ││
│ │ (创世代理)  │ │  (同步守卫)  │ │ (疾走特遣)  ││
│ └──────┬──────┘ └──────┬───────┘ └──────┬──────┘│
│        ↓                ↓                ↓       │
├──────────────────────────────────────────────────┤
│ Skill 层 — "标准与创意解耦"                         │
│ ┌───────────────┐ ┌────────────────┐ ┌──────────┐│
│ │ opsv-规范技能  │ │ comic-创作技能 │ │  其他... ││
│ └───────┬───────┘ └───────┬────────┘ └────┬─────┘│
│         │                 │               │      │
│         └────────┬────────┴───────────────┘      │
│                  ↓                               │
├──────────────────────────────────────────────────┤
│ CLI 层 — "三步式 Spooler Queue"                    │
│ generate → queue compile → queue run              │
└──────────────────────────────────────────────────┘
```

- **Agent**（`.agent/*.md`）：定义角色身份、核心职责和调用哪些 Skill
- **Skill**（`.agent/skills/*/SKILL.md`）：定义具体执行规范、格式模板和质量门限
- **CLI**（`opsv` 命令）：Agent 产出 Markdown 后，由 CLI 三步管线编译执行

---

## Agent 角色矩阵

| Agent | 文件 | 职责 | 绑定 Skill |
|-------|------|------|-----------| 
| **Creative-Agent** | `Creative-Agent.md` | 创世代理：苏格拉底式脑暴、三向提案、创意落盘为 `project.md` + `story.md` | `opsv-brainstorming`, `opsv-architect`, `opsv-asset-designer`, `opsv-script-designer` |
| **Guardian-Agent** | `Guardian-Agent.md` | 同步守卫：反射同步 YAML ↔ Body、审前评审、规范堤坝、语义质检 | `opsv-pregen-review`, `opsv-ops-mastery` |
| **Runner-Agent** | `Runner-Agent.md` | 疾走特遣：任务编译、Spooler 分发、管线监控、产物归档 | `opsv-animator`, `animation-director`, `opsv-enlightenment` |

### Agent 协作流

```
Creative-Agent → 创意落盘 → Guardian-Agent → 校验 + Approve → Runner-Agent → 渲染
      ↑                                                                        |
      └────────────────── 审阅不通过时回滚 ─────────────────────────────────────┘
```

---

## Skill 详细说明

### 1. `opsv-brainstorming` — 灵心本能

**触发场景**：项目启动初期，从模糊灵感中提炼视觉方向

**核心流程**：
1. **响应禁令**：收到模糊灵感时严禁直接落盘，必须先围绕"核心冲突、视觉风格、情感底色"追问 3 个问题
2. **三向提案 (Trinity Choice)**：
   - 方案 A（标准制式）：符合主流审美
   - 方案 B（风格化实验）：强视觉冲击
   - 方案 C（意境/禅意）：留白与深度情感
3. **视觉提纯**：将角色/场景解构为面料质感、光影布局、镜头语言，铸造高密度英文 Prompt
4. **共识落盘**：导演确认方向后，方可触发文档沉淀

---

### 2. `opsv-architect` — 项目军师手册

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

### 3. `opsv-asset-designer` — 资产生成手册

**触发场景**：创建角色、场景或道具的 `.md` 定义文件

**关键规则**：
1. **上下文为王**：先读 `project.md` 了解全局风格
2. **超高精细度**：致密描写材质、光影、磨损度、情绪
3. **折叠块语法**：`visual_brief`、`visual_detailed`、`prompt_en` 强制使用 `>` 语法
4. **母语友好**：正文中文，只有 `prompt_en` 字段英文
5. **YAML-First**：所有数据进 YAML Frontmatter

---

### 4. `opsv-script-designer` — 分镜脚本手册

**触发场景**：将 `story.md` 翻译为结构化 `Script.md`

**核心规则**：
1. **时间绝对约束**：每个 Shot 3-5 秒，上限 15 秒
2. **视觉语言**：描述"摄像机看到的内容"，非文字叙事
3. **纯正文解析**：从 `## Shot NN` 标题解析，不使用 YAML 数组
4. **双语分离**：`prompt_en` 纯英文，其余中文
5. **文档纯净**：严禁硬编码 `target_model` 等执行流配置

---

### 5. `opsv-animator` — 动画执行手册

**触发场景**：从已审阅的 `Script.md` 提取运动指令，生成 `Shotlist.md`

**动静分离原则**：
- ❌ 不描述：角色穿什么衣服、环境长什么样
- ✅ 只描述：镜头怎么动？角色怎么动？场景有什么动态变化？
- `motion_prompt_en` 全英文

**长镜头继承**：
通过 `@FRAME:shot_N_last` 自动截取前一视频的尾帧作为下一镜头的首帧。

---

### 6. `animation-director` — 动画编导艺术家

**触发场景**：撰写高质量视频 Motion Prompt

**四大技巧原则**：
1. **分离主义**：永远不描述衣着、肤色等外观细节（图像参考已决定）
2. **机位优先**：强制指定摄影机运动（`Dolly in`, `Pan right`, `Crane down`）
3. **物理动作精准**：遵循物理规律，极其具体的动作描写
4. **全程英文**：视频 AI 模型只吃英文提示词

---

### 7. `opsv-pregen-review` — 目标审查协议

**触发场景**：视觉生成前，针对目标 Spec 执行交互式审查

**审查三步走**：
1. **交互填充**：检查 `visual_detailed` 颗粒度，提出进阶审美建议
2. **灵魂归纳**：用电影感文字总结目标的视觉核心
3. **工业质检**：静默调用 `opsv validate` 执行物理检查

**Approve / Draft 双态流转**：
- **Approve**：转正 → 回写 `## Approved References` → `status: approved` → 后续 `--skip-approved` 自动跳过
- **Draft**：打回 → 记录意见到 `reviews` → `status: draft` → 下轮生成时用 `draft_ref` 作为参考图

---

### 8. `opsv-ops-mastery` — 运维本能

**触发场景**：工业管线运行期的指令调用与规范守护

**核心机制**：
1. **自动哨兵**：文件变动后自动提议 `opsv validate`，GREEN 放行 / RED 拦截
2. **任务编排**：`opsv generate` → `opsv queue compile` → `opsv queue run`
3. **标准文法**：强力维护目录主权（elements/scenes/shots）与 YAML 铁律
4. **故障处理**：API 报错时检查 `.env` 配置，保留原始错误 JSON

---

### 9. `opsv-enlightenment` — 悟道本能

**触发场景**：现有技能无法覆盖特定 API 能力时，动态学习外部规范

**核心流程**：
1. **求知触发**：导演提出超范围需求时，严禁推辞，主动检索官方技能库
2. **动态内化**：读取外部 SKILL.md → 提取 CLI 指令 + 参数约束 + 输出规范
3. **工业对齐**：执行前检查本地环境，缺失工具时引导安装
4. **进化禁令**：严禁凭空想象参数名，必须以官方文档为唯一真理

---

## 扩展体系：Addons

创作大脑（创意技能）与管线模具（规范技能）实现了彻底解耦。

### 1. 技能解耦哲学
- **规范技能 (opsv-*)**：定义"盒子"的形状。如：Script.md 该怎么排版，jobs.json 该怎么嵌套。这部分是工业化的刚性标准。
- **创意技能 (comic-drama-* / mv-*)**：定义"灵魂"的厚度。如：漫剧该怎么分镜，Prompt 该怎么写效果才爆。这部分是可拔插、可进化的。

### 2. Addons 插件包安装
用户可以通过 `opsv addons` 命令动态扩展 Agent 的能力：

```bash
# 安装漫剧专业插件包
opsv addons install ./addons/comic-drama-v0.6.zip
```

安装后，`Agent` 的配置文件会自动映射到这些新增的创作专家。

---

> *"Agent 是灵魂，规范 Skill 是骨架，创意 Skill 是血肉，Spooler Queue 是神经。"*
> *OpsV 0.6.1 | 最后更新: 2026-04-20*

# Videospec (OpsV) 0.3.19 — 极致电影感流水线 (Cinematic Workflow Evolution)
> 纪元：`0.3` → `0.3.19` | 从“创作图纸”到“自动流水线”的跃迁

## 0.3.x 核心使命
0.3 系列版本通过对 `.env` 配置的深度结构化 (Structuring) 和多角色 AI (Agent-Role Based) 的彻底解耦，实现了从手动提示词工程向**工业化视频资产编译**的跨越。

### 1. 角色 (Agent) 与技能 (Skill) 的“原子化”解耦
为了让不同的 AI Agent 无歧义协作，我们对 `.agent` 目录进行了重构：
- **Agent Roles**: 在 `.agent/` 根目录定义独立的特化人格 (`Architect.md`, `Screenwriter.md`, `AssetDesigner.md` 等)。
- **Skills**: 在 `.agent/skills/` 降级为工具化的操作指令与 YAML 规范。
- **意义**: 人格定义“做什么”，技能定义“怎么做”。

### 2. 真相源 (Source of Truth) 目录结构
```text
/
├── .env/                   # 环境配置 (已忽略，本地唯一)
│   ├── api_config.yaml     # 引擎参数 (max_images, fps, duration)
│   └── secrets.env         # API 密钥 (ARK_API_KEY)
├── .agent/skills/          # AI 技能库 (opsv-init 部署)
├── videospec/              # 核心剧本资产
│   ├── project.md          # 项目全局风格与愿景
│   ├── elements/           # 角色、道具设定 (.md)
│   ├── scenes/             # 场景、环境设定 (.md)
│   └── shots/
│       ├── Script.md       # 静态构图分镜 (Image Spec)
│       └── Shotlist.md     # 动态运镜台本 (Video Spec)
├── artifacts/              # 成果产物
│   └── drafts/             # 渲染出的草图批次
└── queue/                  # 待执行的任务队列
```

---

## 快速实战手册 (Quick Start)

### 工作流五部曲 (The 5-Step Loop)

1. **项目初始化**：`opsv init`（选择您的 AI 助手）。
2. **创意锚定**：唤起 `/opsv-architect`，一键生成 `project.md` 与故事核心。
3. **资产编译**：通过 `/opsv-asset-designer` 沉淀实体资产，运行 `opsv generate` 开启首轮图像队列。
4. **文档评审**：运行 `opsv review`。最新草图会精准注入 `.md`，用户在预览中剔除糟粕，留下精华。
5. **动态进阶**：唤起 `/opsv-animator` 基于确认图生成 `Shotlist.md`，运行 `opsv animate` 锁定视频任务。

### 核心编译器指令
| 命令 | 职责 | 0.3.19 特性 |
| --- | --- | --- |
| `opsv generate` | 编译静态图像 | 自动注入 `global_style_postfix` |
| `opsv execute-image` | **执行渲染** | 动力源：`seadream-5.0-lite`；支持 `max_images` 组图 |
| `opsv review` | 图片回刷文档 | 精准扫描 `drafts_N` 最新批次，实现自动化回显 |
| `opsv animate` | 编译动态视频 | 环境路径自动补全，多参考图（Array）传递 |

---

## 0.3.19 关键特性 (Highlights)

### 1. 组图连贯性 (Sequential Image Generation)
在 `.env/api_config.yaml` 中设置 `max_images > 1`，渲染引擎将自动激活“连续生成”模式，确保生成的同一实体的多张图片具有高度的特征一致性。

### 2. 三段提示词架构 (The Trisected Prompt)
每个任务均携带三层信息流：
- `prompt_en`：面向扩散模型的英文渲染精髓。
- `payload.prompt`：面向多模态大模型的中文叙事上下文。
- `structural metadata`：面向后端的结构化运镜/角色数据。

### 3. 多端 AI 辅助 (Multi-Tool Support)
- **Gemini**: 读取 `GEMINI.md` 全局人格。
- **OpenCode**: 深度集成 `.opencode/` 文件夹。
- **Trae**: 复制 `AGENTS.md` 内容至 Trae 智能体设定即可生效（底层读取 `.trae/rules/`）。

---

> *“代码是写给人看的，只是顺便让机器运行。”*
> *“—— OpsV，让创作像编译代码一样精准。”*

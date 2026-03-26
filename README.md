# Videospec (OpsV) 0.4.2 — 工业级电影感流水线 (Cinematic Workflow Evolution)

> 纪元：`0.3` → `0.4.2` | 从“创作实验”向“工业级资产编译器”的终极跃迁

## 0.4.x 核心使命
0.4 系列版本通过引入 **d-ref (Design) / a-ref (Approved)** 双通道参考体系和**级联式环境校验 (Cascading Config)**，彻底解决了大模型创作中“风格飘移”和“配置混乱”的痛点。这是一个为“AI 导演”量身定制的基石版本。

---

## 安装与部署 (Installation)

### 1. 全局安装 (推荐)
直接从 npm 官方仓库安装，一键获取 `opsv` 全局指令：
```bash
npm install -g videospec
```
安装完成后，在任意终端输入：
```bash
opsv --version  # 返回 0.4.2
```

### 2. 本地开发安装
如果您需要深度定制或参与开发：
```bash
git clone https://github.com/mr7thing/openspec-video.git
npm install
npm run build
```

---

## 0.4.2 重大特性 (Major Highlights)

### 1. d-ref / a-ref 双通道体系
*   **d-ref (Design References)**: 在资产设计阶段，作为“灵感底色”被渲染引擎消费。
*   **a-ref (Approved References)**: 在评审通过后，作为“唯一视觉锚点”自动注入后续分镜与视频生成任务，确保角色/场景在全剧中的视觉一致性。
*   *不再依赖隐晦的 `has_image` 字段，全面转向 Markdown 链接解析。*

### 2. 级联式环境校验 (Robust Provider Engine)
*   **严格 Key 校验**：所有 Provider 在执行前均会进行 `required_env` 强校验，避免因缺失 API Key 导致的无意义重试。
*   **异常穿透逻辑**：针对 NSFW 屏蔽或余额不足等远程错误，引擎会立即终止任务并记录精准日志，不再陷入死循环。
*   **SeaDream 5.0 增强**：支持图生图 (I2I)、组图连续生成 (Max Images) 及多参考图融合。

### 3. 模块化 CLI 架构
*   **核心解耦**：原始臃肿的 `src/cli.ts` 已拆分为 `src/commands/` 下的独立模块（gen-image, gen-video, daemon 等）。
*   **指令对齐**：全面修正了命令命名规范，使其更符合 Unix 开发习惯与 Agent 自动化调用。

---

## 真相源 (Source of Truth) 目录结构

```text
/
├── .env/                   # 环境配置 (已忽略，本地唯一)
│   ├── api_config.yaml     # 引擎参数 (级联校验：required_env)
│   └── secrets.env         # API 密钥 (项目不跟踪)
├── .agent/                 # AI 智囊团 (Architect, Screenwriter...)
├── docs/schema/            # 0.4.x 工业级协议规范
├── videospec/              # 核心剧本资产
│   ├── elements/           # 使用 d-ref 描述的实体资产
│   └── shots/
│       ├── Script.md       # 锚定 a-ref 的静态分镜
│       └── Shotlist.md     # 锁定 a-ref 的动态运镜台本
└── artifacts/              # 编译产物 (Images & Videos)
```

---

## 核心编译器指令 (CLI)

| 命令                 | 职责           | 0.4.2 极简特性                                      |
| -------------------- | -------------- | --------------------------------------------------- |
| `opsv init`          | 环境脚手架部署 | 自动同步 `.agent` 技能库与技能参考示例              |
| `opsv generate`      | 编译静态任务   | 解析 Markdown 链接，自动区分 d-ref 与 a-ref         |
| `opsv execute-image` | 执行渲染       | 强力注入 `style_postfix` 与参考图路径               |
| `opsv review`        | 视觉资产评审   | 自动化回显最新草图至 `.md` 对应章节                 |
| `opsv animate`       | 编译视频任务   | 级联合并 `global_settings` 与分镜级 `motion_prompt` |

---

> *“代码是写给人看的，只是顺便让机器运行。”*   
> *“—— OpsV，让创作像编译代码一样精准。”*  
> *“—— 柒叔 & Antigravity”*

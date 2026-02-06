# OpenSpec-Video 自动化制作系统使用手册 V0.1.0

欢迎使用 **OpenSpec-Video** —— 一套基于“大脑（Logic）+ 手臂（Agent）”架构的 AI 视频自动化制作系统。本系统旨在将标准化的剧本（Markdown）自动转化为可执行的 AI 生成指令（Prompts），并指挥 Agent 完成从分镜绘制到视频合成的全过程。

---

## 1. 核心概念

系统由两部分组成：
*   **OpenSpec (Videospec)**: 单一事实来源（Single Source of Truth）。所有的剧本、角色设定、场景描述都存储在标准化的 `videospec/` 目录中。
*   **OpS V (Automation CLI)**: 自动化工具链。负责读取 Spec，验证逻辑一致性（如：检查剧本里的人名是否在设定集中存在），并生成机器可读的 `jobs.json` 任务队列。
*   **Antigravity Agent**: 执行者。读取 `jobs.json`，模拟人类操作浏览器，调用 AI 工具（如 Gemini, Veo, Higgsfield）进行生产。

---

## 2. 环境准备与安装

### 前置要求
*   **Node.js**: v18.0.0 或更高版本。
*   **Antigravity IDE**: 用于运行 Agent 工作流。

### 安装步骤

1.  **克隆项目**
    ```bash
    git clone https://github.com/YourRepo/OpenSpec-Video.git
    cd OpenSpec-Video
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **构建系统**
    ```bash
    npm run build
    ```

---

## 3. 标准制作流程 (Workflow)

### 第一步：初始化项目 (Init)
不要从零开始建立文件夹。使用 `opsx init` 命令快速创建一个包含标准结构的视频项目。

```bash
# 在根目录下运行
npx opsx init my-cyberpunk-movie
cd my-cyberpunk-movie
```

生成的目录结构如下：
*   `videospec/project.md`: 项目总纲（风格、分辨率）。
*   `videospec/assets/`: 存放角色 (`characters/`) 和场景 (`locations/`) 的 YAML 定义。
*   `videospec/stories/`: 存放剧本 (`Script.md`)。

### 第二步：编写设定与剧本 (Write)

**1. 定义资产 (Assets)**
在 `videospec/assets/characters/` 下创建角色。例如 `K.yaml`:
```yaml
id: "char_k"
name: "Detective K"
visual_traits:
  clothing: "Brown leather trench coat"
reference_sheet: "assets/characters/detective_k.png" # 必须提供参考图路径
```

**2. 编写剧本 (Script)**
编辑 `videospec/stories/Script.md`。使用 `[资产ID]` 的方式引用角色或场景，系统会自动替换并关联参考图。

```markdown
# Scene 1
## Shot 1
**Subject**: [char_k] walks into [loc_void_bar].
**Action**: Pushing through neon curtains.
**Camera**: Low angle.
```

### 第三步：生成任务队列 (Generate)
当剧本写好后，让“大脑”工作，将其编译为 Agent 能看懂的 JSON 指令。

```bash
npx opsx generate
```
*   **成功**：会提示 `Successfully generated X jobs`。
*   **输出**：检查 `queue/jobs.json`，你将看到自然语言的 `[char_k]` 已经被替换为了详细的 Prompt，并且附带了 `assets` 图片路径。
*   **失败**：如果剧本引用了不存在的 ID（如 `[char_ghost]`)，系统会报错提醒。

### 第四步：Agent 执行 (Execute)
现在轮到“手臂”干活了。

1.  打开 **Antigravity Agent** 面板。
2.  加载工作流文件：`project-demo/.antigravity/workflows/generate_storyboard.md`。
3.  告诉 Agent：“**请运行 Generate Storyboard**”。

Agent 将会自动：
1.  读取 `jobs.json`。
2.  打开浏览器（如 Gemini Web 或 Higgsfield）。
3.  自动填入 Prompt 和参考图。
4.  点击生成并截图保存结果到 `artifacts/` 目录。

---

## 4. 进阶功能

### 变更管理 (Proposals)
当需要对项目进行重大修改（如“把主角风衣改成黑色”）时，不要直接改文件，建议先提一个提案：

```bash
npx opsx proposal "Change K coat to black"
```
系统会在 `videospec/changes/` 下生成一个带日期的 Markdown 提案模板，帮助你记录修改原因和影响范围。

### 视频合成 (Video Generation)
分镜图（Storyboard）生成满意后，可以升级为视频生成任务：
1.  手动或编写脚本修改 `jobs.json`，将 `type` 改为 `video_generation`，并将 `assets` 指向生成的静态分镜图。
2.  运行 `workflows/generate_video.md`，Agent 将会使用 Veo 或 Runway 进行 Image-to-Video 转换。

---

## 5. 常见问题 (FAQ)

**Q: `opsx generate` 报错 "Character not found"?**
A: 请检查 `Script.md` 中使用的ID（如 `[char_neo]`）是否在 `assets/characters/` 目录下有对应的 `.yaml` 文件，且文件内的 `id` 字段匹配。

**Q: Agent 打开浏览器失败?**
A: 确保 Antigravity 环境配置了必要的环境变量（如 `$HOME`）。如果是本地运行，请确保网络通畅且已登录目标 AI 工具的账号。

---

*OpenSpec-Video Team*
*Designed for Creators, Powered by Code.*

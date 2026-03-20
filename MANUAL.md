# Videospec (OpsV) 用户手册 (The Creator's Handbook)

本文档旨在指导创作领袖（PM/导演/艺术总监）如何高效掌握 OpsV 0.3.19 这一电影感视听流水线。

---

## 一、配置纪律 (The .env Rule)

0.3.3+ 版本引入了**双重配置体系**，配置即命令：

### 1. API 秘钥 (`.env/secrets.env`)
```env
# 必填：用于调用后端渲染引擎 (ARK/火山引擎等)
VOLCENGINE_API_KEY=your_key_here
```

### 2. 引擎参数 (`.env/api_config.yaml`)
这是控制生成质量的“中控室”：
- `model`: 渲染 Endpoint ID。
- `max_images`: 设置为 `4` ~ `12` 可开启组图模式。
- `fps`: 视频帧率（默认 24）。
- `duration`: 视频时长。

---

## 二、命令深度解析 (CLI Deep Dive)

### 1. `opsv generate [targets...]`
将您的 Markdown 剧本物理“降维”为计算机可读的 JSON 任务。
- ** targets**: 可指定单一文档或文件夹。
- **特性**: 自动解析 `@资产` 引用，将实体特征注入提示词。

### 2. `opsv execute-image` (执行器)
**这是 OpsV 的“渲染车间”：**
- **动力源**: 默认集成 `seadream-5.0-lite` 电影级引擎。
- **自动组图**: 当识别到 `max_images > 1` 时，会自动向 Prompt 注入引导词，驱动模型生成风格高度统一的系列素材。
- **并发控制**: 使用 `-c` 调节生成速度。

### 3. `opsv review` (文档审阅)
**功能**: 将 `artifacts/drafts_N/` 下的最新生成结果“反哺”回 `.md` 文档。
- **逻辑**: 它会查找最新的 `jobs.json`，根据任务 ID 匹配文档位置。
- **结果**: 您可以直接在 IDE 的 Markdown 预览界面看到所有生成的资产草图和分镜，通过简单的“撤回 (Undo)”或“删除 (Delete)”操作来决定哪些图进入最终分镜。

### 4. `opsv animate` (动画编译)
**功能**: 将静态分镜转化为动态视频指令。
- **绝对化处理**: 自动将本地相对路径转化为绝对路径，确保云端执行器能准确定位底图。
- **多图参考**: 支持首帧、尾帧、特征图的多维参考输入。

---

## 三、三位一体的 Agent 角色流 (Agent Interaction)

在 0.3.19 中，请遵循以下角色互动逻辑，以获得最佳产出：

1. **总建筑师 (Architect)**: 
   - 职责：制定 `project.md` 基调。
   - 输入：发散性的点子。
   - 输出：视觉愿景与技术规格。

2. **分镜师 (ScriptDesigner)**:
   - 职责：推演光影与构图。
   - **核心红线**：严禁在 Script.md 中详述角色外貌。角色外貌应引用 `@角色` 并在其对应的 `elements/` 文档中定义。

3. **动画导演 (Animator)**:
   - 职责：动静分离。
   - 输入：已确认底图的 `Script.md`。
   - 输出：包含 `@FRAME` 断点与精密运镜指令的 `Shotlist.md`。

---

## 四、Troubleshooting (避坑指南)

- **Q: 生成的图片角色特征变了？**
  - A: 检查 `elements/` 下的定义是否清晰。开启 `max_images: 4` 进行组图模式生产，筛选一致性最高的一组。
- **Q: `opsv review` 没反应？**
  - A: 确保 `queue/jobs.json` 存在，且 `artifacts/drafts/` 目录下有对应的图片。
- **Q: 浏览器插件无法保存？**
  - A: 确保 `opsv serve` 已启动（占用 3061 端口）。

---
> *纪元 0.3.19：让创意如流水般流淌。*

# OpenSpec-Video Addon 开发流式规范指南

本指南定义了在 OpenSpec-Video 中开发、发布以及维护扩展（Addon，如 `comic-drama`）的架构准则。在此文档之前，Addon 包含了复杂的业务代码，但在最新的**“流式队列架构 (Spooler Queue)”**革新后，系统确立了“代码归核心，参数归插件”的绝对解耦原则。

## 一、 Addon 核心哲学：纯粹数据容器

未来的所有 Addon **禁止包含任何执行代码（JS/TS）**。Addon 必须退化为纯粹的静态配置与模板仓库。

标准 Addon 目录结构示例：
```text
addons/comic-drama/
├── skills/
│   ├── comic-drama-architect/     # 剧本转换 AI 技能
│   │   └── SKILL.md
│   └── comic-drama-director/      # 导演级资产拆配技能
│       └── SKILL.md
└── workflows/                     # ComfyUI 或其他引擎的 JSON 工作流模板
    ├── comic-drama-seedance.json
    └── ...
```

### 1.1 命名空间法则 (Namespace Prefix)
所有的技能配置文件夹、模板文件必须以该 addon 的名称作为前缀（如 `comic-drama-`）。这避免了多套 Addon 之间的模板冲突，使得 Compiler 加载时具有唯一确定的目标。

### 1.2 抛弃局部 Config
Addon 中不该拥有自己的 `config.yaml` 或者 `keys.env`。凡是牵涉到执行网络请求、密钥等硬件边界的信息，全部由主项目的 `api_config.yaml` 接管统一声明。

---

## 二、 参数注入契约 (Injection Conventions)

由于 Addon 内不再有注入逻辑代码，所有的参数下发必须遵循 **节点命名约定 (Node Title Convention)**。
如果你编写的是 ComfyUI `.json` 工作流，你必须在导出时，为你需要动态改变的节点指定特定的 **Title (标题)** 或内部标注：

* `input-prompt`：专门用于覆盖文本正向提示词。
* `input-image1`, `input-image2`：用于资产图本地地址或云端 URL 的注射。
* `input-video`：用于视频图转视频的源头注入。

**工作原理：**
核心层中的 `ComfyUITaskCompiler` 会自动遍历模板，如果寻找到了上述约定的 Title，会自动拉取 Subagent 输出的 `batch_tasks.json`（意图指令）中对应的值进行精准打击覆盖。

---

## 三、 API 提供商映射图谱

在统一配置 `api_config.yaml` 中，我们需要阐明 Provider (API服务) 与 Skill 的挂载关系，这不是通过硬编码来实现的：

```yaml
providers:
  comfyui_local:
    type: "local_comfyui"
    endpoint: "http://127.0.0.1:8188"
    skills:
      - "comic-drama-architect"

  runninghub:
    type: "runninghub_comfyui"
    api_key: "Bearer <KEY>"
    skills:
      - "comic-drama-director"
```
**挂载规则解释：** 当 `comic-drama-director` 这位 AI Agent 输出一个任务队列时，`QueueWatcher` 路由器会通过这份配置，立刻知道这份任务必须投递进 `.opsv-queue/pending/runninghub/` 这个信箱，进而触发远程任务。

---

## 四、 编译层防空协议 (AOT Interceptors)

对于运行云端工作流（以 RunningHub 为例），在 Addon 设计中**不需要考虑上传素材和本地转网络的过程**。
这是架构系统送给 Addon 创作者的“防空结界”：

1. `ComfyUITaskCompiler` 在加载完您的 `comic-drama-*.json` 模板后。
2. 发现目标 Provider 是 `runninghub`。
3. 系统主动拦截含有本地路径(`.jpg`, `.mp4`) 的参数变量，立刻在后台静默请求 RunningHub 上传服务。
4. 获取 URL 后替您塞进 JSON 靶位。
5. 这个被彻底净化的、可以直接执行的强类型 JSON Payload 才会被移入信箱。

因此，作为 Addon 创作者或者本地资产调度 Agent，永远只用关心：**“传什么词，本地给什么文件”** 即可，执行边界无限期透明化。

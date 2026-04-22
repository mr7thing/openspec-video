# OpenSpec-Video Addon 开发规范指�?(v0.6.3)

本指南定义了�?OpenSpec-Video 中开发、发布以及维护扩展（Addon，如 `comic-drama`）的架构准则。在 v0.6.0 �?**Spooler Queue 架构** 下，系统确立�?代码归核心，参数归插�?的绝对解耦原则�?
## 一�?Addon 核心哲学：纯粹数据容�?
所�?Addon **禁止包含任何执行代码（JS/TS�?*。Addon 必须退化为纯粹的静态配置与模板仓库�?
标准 Addon 目录结构示例�?```text
addons/comic-drama/
├── skills/
�?  ├── comic-drama-architect/     # 剧本转换 AI 技�?�?  �?  └── SKILL.md
�?  └── comic-drama-director/      # 导演级资产拆配技�?�?      └── SKILL.md
└── workflows/                     # ComfyUI 或其他引擎的 JSON 工作流模�?    ├── comic-drama-seedance.json
    └── ...
```

### 1.1 命名空间法则 (Namespace Prefix)
所有的技能配置文件夹、模板文件必须以�?addon 的名称作为前缀（如 `comic-drama-`）。这避免了多�?Addon 之间的模板冲突，使得 Compiler 加载时具有唯一确定的目标�?
### 1.2 抛弃局�?Config
Addon 中不该拥有自己的 `config.yaml` 或�?`keys.env`。凡是牵涉到执行网络请求、密钥等硬件边界的信息，全部由主项目�?`api_config.yaml` 接管统一声明�?
---

## 二�?参数注入契约 (Injection Conventions)

由于 Addon 内不再有注入逻辑代码，所有的参数下发必须遵循 **节点命名约定 (Node Title Convention)**�?如果你编写的�?ComfyUI `.json` 工作流，你必须在导出时，为你需要动态改变的节点指定特定�?**Title (标题)**�?
* `input-prompt`：专门用于覆盖文本正向提示词�?* `input-image1`, `input-image2`：用于资产图本地地址或云�?URL 的注射�?* `input-video`：用于视频图转视频的源头注入�?
**工作原理�?*
核心层中�?`ComfyUITaskCompiler` 会自动遍历模板，如果寻找到了上述约定�?Title，会自动拉取编译器输出的意图指令中对应的值进行精准打击覆盖�?
---

## 三�?�?Spooler Queue 的集�?(v0.6.0)

### 3.1 编译投递流�?
```bash
# 1. Generate 产出纯意�?opsv generate

# 2. 使用 ComfyUI 编译器投递到 Addon 工作�?opsv queue compile queue/jobs.json --provider runninghub

# 3. QueueWatcher 消费执行
opsv queue run runninghub
```

### 3.2 编译器路由规�?- Provider �?`comfyui_local` �?`runninghub` �?自动使用 `ComfyUITaskCompiler`
- `ComfyUITaskCompiler` �?`addons/{addon-name}/workflows/` 加载工作流模�?- 其他 Provider �?使用 `StandardAPICompiler`

### 3.3 API 提供商映�?
�?`api_config.yaml` 中声�?Provider 与工作流的挂载关系：

```yaml
providers:
  comfyui_local:
    type: "local_comfyui"
    endpoint: "http://127.0.0.1:8188"

  runninghub:
    type: "runninghub_comfyui"
    api_key: "Bearer <KEY>"
```

---

## 四�?编译层防空协�?(AOT Interceptors)

对于运行云端工作流（�?RunningHub 为例），�?Addon 设计�?*不需要考虑上传素材和本地转网络的过�?*�?这是架构系统送给 Addon 创作者的"防空结界"�?
1. `ComfyUITaskCompiler` 在加载完您的 `comic-drama-*.json` 模板后�?2. 发现目标 Provider �?`runninghub`�?3. 系统主动拦截含有本地路径(`.jpg`, `.mp4`) 的参数变量，立刻在后台静默请�?RunningHub 上传服务�?4. 获取 URL 后替您塞�?JSON 靶位�?5. 这个被彻底净化的、可以直接执行的强类�?JSON Payload 才会被移�?`.opsv-queue/pending/runninghub/` 信箱�?
因此，作�?Addon 创作者或者本地资产调�?Agent，永远只用关心：**"传什么词，本地给什么文�?** 即可，执行边界无限期透明化�?
---

## 五�?Addon 安装规范

```bash
# 安装 Addon 插件�?opsv addons install ./addons/comic-drama-v0.6.zip
```

安装行为�?- 校验当前目录是否为有效的 OpsV 项目
- �?Zip 包中�?`.agent/` 目录合并到当前项�?- �?Zip 包中�?`workflows/` 合并�?`addons/{addon-name}/workflows/`
- 成功后列出新增的专家技能列�?
---

> *"Addon 是灵魂注入器，Spooler Queue 是它的透明传送门�?*
> *OpsV 0.6.3 | 最后更�? 2026-04-22*

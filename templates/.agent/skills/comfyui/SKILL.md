---
name: comfyui
description: ComfyUI 工作流编译与执行技能。覆盖本地 ComfyUI 和 RunningHub 云端两种部署，精通 workflow 模板注入、节点参数匹配、梯度轮询与 crash-safe 恢复机制。
---

# ComfyUI 工作流技能

## 架构概览

ComfyUI 在 OpsV 中是**工作流驱动**的生成方式，与 imagen/animate 的"提示词→API"模式不同：

- **imagen / animate**：prompt + 参数 → 直接调 REST API
- **comfy**：预定义 workflow JSON 模板 + 参数注入 → 调 ComfyUI API

支持两种部署，共享相同的编译逻辑，仅执行层不同：

| 部署 | 模型 key | Provider | API 地址 | 认证 |
|------|---------|----------|---------|------|
| ComfyUI Local | `comfyui.sdxl` | `ComfyUILocalProvider` | `http://127.0.0.1:8188` | 无 |
| RunningHub Cloud | `runninghub.default` | `RunningHubProvider` | `https://www.runninghub.cn/...` | `RUNNINGHUB_API_KEY` |

两者本质都是 **submit-poll** 模式，与 Volcengine/SiliconFlow 等一致。

---

## 命令用法

```bash
# 编译（必须指定 --model）
opsv comfy --model comfyui.sdxl
opsv comfy --model runninghub.default

# 指定目标目录和名称
opsv comfy --model comfyui.sdxl --dir elements/role --name role

# 指定 workflow 文件（文件名从 workflow-dir 查找）
opsv comfy --model comfyui.sdxl --workflow ref2

# 指定 workflow 文件（绝对路径）
opsv comfy --model comfyui.sdxl --workflow /abs/path/to/workflow.json

# 指定 workflow 目录（覆盖 api_config 的 defaults.templateDir）
opsv comfy --model comfyui.sdxl --workflow-dir workflows/sdxl/

# 运行时参数覆盖（JSON 格式注入到 workflow 节点）
opsv comfy --model comfyui.sdxl --param '{"input-style":"anime","input-steps":30}'

# 预览模式（不写文件）
opsv comfy --model comfyui.sdxl --dry-run

# 执行
opsv run opsv-queue/videospec.circle1/comfyui.sdxl_001/
opsv run opsv-queue/videospec.circle1/comfyui.sdxl_001/@hero.json

# 重试失败任务
opsv run opsv-queue/videospec.circle1/comfyui.sdxl_001/ --retry
```

---

## 编译流程

### 1. 定位 Circle

```
resolveTarget() → 扫描 opsv-queue/*.circle*/ → 取最新 {basename}.circle{N}
```

### 2. 筛选资产

从 `_manifest.json` 的 `assets` 字段读取，过滤 `status !== 'approved'` 的资产。

### 3. 构建 Job

`buildComfyJob(asset, paramOverrides)` 对每个待编译资产：

- `prompt = frontmatter.prompt_en || visual_brief || 首段文本`
- `type = 'comfy'`（硬编码，不由文档 category 决定）
- `--param` 的 JSON 合并到 `payload.extra`

### 4. ComfyUICompiler 编译

核心是**参数注入到 workflow 模板节点**：

**Workflow 选取**：

1. `--workflow` 指定绝对路径 → 直接使用
2. `--workflow` 指定文件名 → 从 `--workflow-dir`（或 `defaults.templateDir`）查找
3. 不指定 `--workflow` → 自动匹配：扫描 workflow-dir 下 `ref{N}.json` 文件，按参考图数量选择

**ref(N) 自动匹配规则**：

```
1. 计算资产参考图数量 refCount = designRefs.length + externalRefs.length
2. 扫描 workflow-dir 下所有 .json 文件，提取文件名中 ref(N) 的 N
3. 精确匹配 N == refCount → 使用
4. 无精确匹配 → 选 N < refCount 中最大的（多余参考图丢弃）
5. 仍无匹配 → 选 N > refCount 中最小的（空 slot 留默认值）
6. 目录为空或无 ref(N) 文件 → 报错跳过该资产
```

**`_opsv_workflow` 元数据约定**：

每个 workflow JSON 必须声明输入节点信息：

```json
{
  "_opsv_workflow": {
    "image_inputs": ["reference-image-1", "reference-image-2"],
    "text_inputs": ["input-prompt"]
  }
}
```

- `image_inputs`：有序的图片节点 title 列表，参考图按此顺序注入
- `text_inputs`：文本节点 title 列表，prompt 注入第一个
- 缺少 `_opsv_workflow` 或 `image_inputs` 为空 → 报错跳过

**参数注入**：

参考图按 `_opsv_workflow.image_inputs` 顺序注入到对应节点。文本按 `text_inputs[0]` 注入。`--param` 的额外参数按 key 匹配节点 title 注入。

**节点匹配规则**：

遍历 workflow 中每个节点，用 `_meta.title` 或 `title` 字段与参数 key 精确匹配。匹配到后按优先级注入 `inputs`：

1. 有 `text` → 填 `text`
2. 有 `text_1` → 填 `text_1`
3. 有 `image` → 填 `image`
4. 有 `video` → 填 `video`
5. 否则 → 填第一个 input 字段

**参考图来源**：

```
资产参考图 = designRefs（## Design References）+ externalRefs（@assetId:variant resolved）
```

与 imagen/animate/webapp 统一，编译时自动收集。

### 5. 产出

```
opsv-queue/videospec.circle1/comfyui.sdxl_001/
  @hero.json              ← 编译后的 TaskJson（含完整 workflow + _opsv 元数据）
  scene_forest.json
```

---

## 执行流程

### ComfyUI Local

```
1. POST /prompt              → 提交 workflow，获取 prompt_id
2. GET  /history/{prompt_id} → 梯度轮询，等待 outputs 产出
3. GET  /view?filename=...   → 下载输出图片/视频
```

**梯度轮询间隔**：

| 经过时间 | 轮询间隔 |
|---------|---------|
| 0-5 min | 10s |
| 5-10 min | 30s |
| 10-30 min | 60s |
| 30min+ | 300s |

- 最大时长：4 小时
- Crash-safe：`.log` JSONL 记录 `prompt_id`，进程中断后 `opsv run` 自动 resume
- 输出扩展名：`type === 'video'` → `.mp4`，`type === 'imagen'` → `.png`

### RunningHub Cloud

```
1. POST /post               → 提交 workflow，获取 taskId
2. GET  /status?taskId=...  → 梯度轮询
3. 下载 output URL           → 保存本地文件
```

- 请求头：`Authorization: Bearer {RUNNINGHUB_API_KEY}`
- 状态判断：`SUCCESS` / `completed` → 下载输出；`FAIL` / `failed` → 报错
- 同样梯度轮询 + 4 小时超时 + crash-safe resume

---

## .log 检查点格式

每个任务执行时生成 `{id}.log`（JSONL append-only）：

```jsonl
{"event":"submitted","task_id":"abc123","ts":"2026-04-28T12:00:00Z"}
{"event":"polling","status":"waiting","task_id":"abc123","ts":"2026-04-28T12:00:10Z"}
{"event":"succeeded","task_id":"abc123","ts":"2026-04-28T12:02:30Z"}
```

- 进程崩溃后重启，`opsv run` 读取 `.log` 末尾的 `task_id`，跳过 submit 直接 resume 轮询
- `succeeded` 或 `failed` 事件标记任务结束，不再轮询

---

## api_config.yaml 配置

```yaml
# ComfyUI Local
comfyui.sdxl:
  provider: local          # QueueRunner 注册键 → ComfyUILocalProvider
  type: comfy
  model: any               # workflow 模板文件名（不含 .json）
  api_url: http://127.0.0.1:8188/prompt
  defaults:
    templateDir: ""        # workflow JSON 模板目录路径

# RunningHub Cloud
runninghub.default:
  provider: runninghub     # QueueRunner 注册键 → RunningHubProvider
  type: comfy
  model: any
  api_url: https://www.runninghub.cn/task/openapi/comfyui/post
  api_status_url: https://www.runninghub.cn/task/openapi/comfyui/status
  required_env:
    - RUNNINGHUB_API_KEY
```

- `provider: local` 映射到 `ComfyUILocalProvider`（QueueRunner 中注册键 `comfyui`）
- `provider: runninghub` 映射到 `RunningHubProvider`
- `type: comfy` 与 `type: imagen` / `type: video` 并列，决定输出扩展名
- `defaults.templateDir`：Agent 从 `.agent/skills/` 找到对应 workflow，复制到 Provider 目录，注入变量

---

## 迭代操作

与 imagen/animate 相同的命名约定。必须使用 `opsv iterate` 克隆任务：

```bash
# 克隆任务（自动清除 compiledAt，确保会被执行）
opsv iterate opsv-queue/videospec.circle1/comfyui.sdxl_001/@hero.json
# → 生成 @hero_2.json
# 编辑 @hero_2.json（修改 workflow 节点参数、seed 等）
opsv run opsv-queue/videospec.circle1/comfyui.sdxl_001/@hero_2.json
# → 生成 @hero_2_1.png

# 克隆整个目录进行批量迭代
opsv iterate opsv-queue/videospec.circle1/comfyui.sdxl_001/
# → 生成 comfyui.sdxl_001_it_001/（目录下所有 task JSON 被复制，名称不变）

# Review approve 后：
# - @hero_2_1.png → syncing（修改任务，Agent 需对齐文档描述字段）
# - @hero_1.png → approved（原始任务，直接通过）
```

---

## 当前局限与注意事项

1. **Workflow 模板必须包含 `_opsv_workflow`**：缺少 `_opsv_workflow.image_inputs` 的 workflow JSON 会导致编译报错跳过。确保每个模板都声明输入节点。

2. **`_opsv_workflow.image_inputs` 与节点 title 必须对齐**：`image_inputs` 列表中的 title 必须与 workflow 节点的 `_meta.title` 或 `title` 精确匹配，否则参考图不会注入。

3. **ref(N) 文件名约定**：自动匹配依赖文件名包含 `ref{N}` 模式（如 ref0.json、ref1.json）。不符合命名的文件会被忽略。

4. **`type` 字段影响输出扩展名**：`api_config.yaml` 中 `type: comfy` 默认输出 `.png`。如需生成视频，应设 `type: video`，输出为 `.mp4`。

5. **ComfyUI 必须运行**：`opsv run` 不会自动启动 ComfyUI 服务。执行前需确保 `http://127.0.0.1:8188` 可访问。

6. **`--param` 覆盖范围**：`--param` 的 JSON 合并到 `job.payload.extra`，自定义参数需 workflow 中有对应 title 的节点才能生效。

---

## 关键源码文件

| 文件 | 职责 |
|------|------|
| `src/commands/comfy.ts` | `opsv comfy` 命令入口，Job 构建 |
| `src/core/compiler/providers/ComfyUICompiler.ts` | Workflow 模板加载 + 参数注入 |
| `src/executor/providers/ComfyUILocalProvider.ts` | 本地 ComfyUI submit-poll 执行 |
| `src/executor/providers/RunningHubProvider.ts` | RunningHub 云端 submit-poll 执行 |
| `src/executor/polling.ts` | 梯度轮询 + .log 检查点（共享） |
| `src/executor/naming.ts` | 任务/输出文件命名约定（共享） |
| `src/core/compiler/TaskBuilder.ts` | 编译编排，路由到 ComfyUICompiler |
| `src/executor/QueueRunner.ts` | 执行编排，路由到 ComfyUILocalProvider / RunningHubProvider |

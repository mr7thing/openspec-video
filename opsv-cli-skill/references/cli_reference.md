# CLI 命令手册 (cli_reference)

> 全部 18 个命令，按组分类。每条含语法、必填参数、可选 flag、源码位置。
> 真相基准：`videospec` v0.11.4 源码 `src/commands/`。所有 file:line 以源码为准。

---

## 1. 脚手架与守门

### `opsv init`

初始化项目骨架，创建 `videospec/`（elements/scenes/shots）+ `.opsv/` 目录。

```bash
opsv init [name]              # 在当前目录初始化
opsv init --dir <project>     # 新建项目目录并初始化
```

- **源码**：`src/commands/init.ts:25`
- **初始化内容**：
  - 创建 `videospec/{elements,scenes,shots}/`、`opsv-queue/`、`.opsv/` 目录
  - 写入 `.gitignore`
  - 初始化 git 仓库
  - 复制内置 `.opsv/` 中的 `api_config.yaml`、`category_validate.yaml`、`input_types.yaml` 到项目 `.opsv/`，加 `.sample` 后缀（用户按需修改后移除 `.sample` 即可激活）
  - 扫描内置配置中所有模型的 `required_env`，去重生成 `.env.sample` 文件

### `opsv validate`

读取文档做格式守门——按 `_category_validate.yaml` 的规则查 frontmatter 字段、refs 死链、图片引用存在性、状态一致性。**不评判质量**。

默认扫描 `videospec/scenes`、`videospec/shots`、`videospec/elements` 三个目录，深度 1 层（仅子目录一层），自动跳过点目录。

```bash
opsv validate                                            # 默认扫三个目录，深度 1
opsv validate --dir videospec/scenes videospec/shots     # 多值，自定义扫描目录
opsv validate --max-depth -1                             # 无限递归（含全部子目录）
opsv validate --max-depth 0                              # 仅根层文件
opsv validate --exclude videospec/scenes/archive         # 按项目根路径排除子目录
opsv validate --dir videospec --max-depth -1             # 兼容旧用法（单目录无限深度）
opsv validate --category <cat>                           # 按分类校验
opsv validate --strict                                   # warning 也当 error
opsv validate --skip-category-rules                      # 跳过分类规则，只做基础 schema 检查
```

**`validate` 专属参数**（v0.11.0 起）：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--dir <paths...>` | `string[]` | `videospec/scenes videospec/shots videospec/elements` | 多值，指定一个或多个扫描目录 |
| `--exclude <patterns...>` | `string[]` | `[]` | 排除路径模式（相对项目根），匹配的目录及其子目录跳过 |
| `--max-depth <number>` | `int` | `1` | 扫描深度：`-1`=无限，`0`=仅根层，`N`=最多 N 层子目录 |

**行为变化**（与 v0.10.0 相比）：
- `--dir` 从单值变为多值，默认从 `videospec` 改为 `videospec/scenes videospec/shots videospec/elements`
- 目录不存在时跳过并提示黄色警告（不再报错退出）
- 自动跳过 `.` 开头的隐藏目录
- 跨目录相同 `assetId` 去重（后扫到的覆盖前面的）

- **源码**：`src/commands/validate.ts:54`
- **加载顺序**：builtin(`project`/`shotdeck`) → `~/.opsv/category_validate.yaml` → `.opsv/category_validate.yaml`（项目级最高）
- **退出码**：有 error/dead ref/缺失图片/状态不一致/类别 error（`--strict` 含 warning）→ 非零
- **检测项**：① schema 校验 ② refs 结构（`RefBinder`）③ 分类字段 ④ `@id` 死链 ⑤ body 图片链接存在性 ⑥ manifest 与 frontmatter 状态一致性
- **编译前验证**（v0.13.8+）：`animate` / `imagen` / `comfy` / `webapp` 在编译前独立做资产引用验证，不依赖当前 circle 的 manifest，支持跨 circle 引用。

> 详情见 `validate_and_iterate.md`。

---

## 2. 任务环

### `opsv circle create`

根据文档间 `refs` 依赖关系构建有向无环图（DAG），按拓扑序分层，创建 `{name}_circle{N}/` 目录 + `_manifest.json`。

```bash
opsv circle create                          # 默认扫 videospec/{scenes,shots,elements}
opsv circle create --dir videospec/scenes videospec/shots   # 自定义多目录扫描
opsv circle create --dir <paths...> --name <name>
opsv circle create --skip-middle-circle    # 只留 zerocircle + firstcircle
```

- **源码**：`src/commands/circle.ts:35`
- **DAG 构建**：`src/core/DependencyGraph.ts:68-99`（`build()` 遍历每个文档的 `frontmatter.refs`）
- **扫描范围**：默认扫 `videospec/scenes`、`videospec/shots`、`videospec/elements` 三个目录（`dirOption.ts:10` 的 `DEFAULT_SCAN_DIRS`）；`--dir <paths...>` 可自定义一个或多个目录
- **命名**：`{目录名}_circle{N}`，N 自动递增找最大值 +1，**不覆盖已有 Circle**
- **使用时机**：**只在依赖关系变化时**用

### `opsv circle refresh`

重建图、与现有 manifest diff、更新 `_manifest.json`。**不产生新文件**。
```bash

opsv circle refresh                              # 默认扫三个目录
opsv circle refresh --dir videospec/scenes videospec/shots  # 自定义多目录
opsv circle refresh --dir <path> --name <name>
```

- **源码**：`src/commands/circle.ts:91`
- **检测拓扑变化**：若任何资产移动了 circle 层级 → 报错，提示用 `circle create`（`circle.ts:131-147`）
- **跳过已通过**：`approved` 状态的资产在生成 test.json 时自动跳过
- **使用时机**：日常迭代刷新状态

---

## 3. 编译

> 编译命令**只产出 task.json**，不调生成 API。真正的执行是 `opsv run`。

### `opsv imagen`

从 circle manifest 编译图像生成任务。

```bash
opsv imagen --model <model> [options]      # --model 必填
  --manifest <path>        # 指定 manifest，默认自动发现最新
  --category <cat>         # 按分类过滤
  --status-skip <statuses> # 跳过指定状态（如 approved）
  --file <id>              # 只编译指定资产
  --prompt-mode <mode>     # keep | index | name（默认 keep）
  --dry-run                # 只看会编译什么，不写文件
```

- **源码**：`src/commands/imagen.ts:35`
- **产出位置**：`circleDir/{model}_NNN/{jobId}.json`
- **job 构建**：`buildImageJob`（`imagen.ts:108-151`）拉取 prompt/aspect_ratio/quality/reference_images

### `opsv animate`

从 circle manifest 编译视频生成任务。

```bash
opsv animate --model <model> [options]     # --model 必填
  --manifest <path>
  --category <cat>
  --status-skip <statuses>
  --file <id>
  --prompt-mode <mode>
  --dry-run
```

- **源码**：`src/commands/animate.ts:40`
- **job 构建**：`buildVideoJob`（`animate.ts:113-175`）含 duration/frame_ref（首尾帧）/reference_images/videos/audios

### `opsv comfy`

从 circle manifest 编译 ComfyUI 工作流任务。

```bash
opsv comfy [options]
  --manifest <path>
  --category <cat>
  --status-skip <statuses>
  --file <id>
  --workflow <file>        # 工作流 JSON 路径（绝对或相对 projectRoot）
  --param <json>           # 注入参数
  --force-api-mapping      # 强制使用 api_config.node_mappings（忽略 frontmatter）
  --prompt-mode <mode>
  --dry-run
```

- **源码**：`src/commands/comfy.ts:38`
- **工作流文件**：在 `api_config.yaml` 中通过 `workflow` 字段指定 `.json` 文件路径（相对 projectRoot 或绝对路径）。CLI `--workflow` 可临时覆盖
- **node_mappings**：定义 OPSV 参数注入到 ComfyUI 节点的映射关系，在 `api_config.yaml` 的 model 级别配置，或在文档 frontmatter 的 `node_mapping` 字段中配置。优先级：frontmatter > api_config

### `opsv comfy-node-mapping <workflow-file>`

分析 ComfyUI 工作流 JSON → 输出节点映射。为 RunningHub 云工作流嵌入 workflowId。

```bash
opsv comfy-node-mapping <workflow-file>
  -o, --output <path>      # 写文件（默认 stdout）
  --prefix <str>           # 节点 ID 前缀（默认 opsv-）
  --workflow-id <id>       # 指定 workflowId
```

- **源码**：`src/commands/comfyNodeMapping.ts:68`
- **用法**：给定 ComfyUI 工作流 JSON，自动扫描所有节点，识别 CLIPTextEncode / KSampler / LoadImage 等常见节点，建议 node_mappings 配置
- **输出示例**：
  ```yaml
  node_mappings:
    prompt:
      nodeId: "6"
      fieldName: "text"
    seed:
      nodeId: "25"
      fieldName: "noise_seed"
  ```

### `opsv webapp`

从 circle manifest 编译浏览器自动化任务（多站点 runner）。

```bash
opsv webapp [options]
  --manifest <path>
  --category <cat>
  --status-skip <statuses>
  --file <id>
  --prompt-mode <mode>
  --dry-run
```

- **源码**：`src/commands/webapp.ts:35`

### `opsv audio`（占位）

**[planned]** 音频生成任务编译。当前为占位实现。

- **源码**：`src/commands/audio.ts:15`

---

## 4. 执行与迭代

### `opsv run <paths...>`

执行编译好的 task.json 文件（提交 → 轮询 → 下载产物）。

```bash
opsv run <task.json...>
  --retry                  # 重试失败任务（读 .log 最后事件判断）
  --force                  # 强制重跑所有任务，忽略成功/失败/审批状态（输出增量保存，不覆盖）
  --dry-run                # 不真正调 API
  -c, --concurrency <n>    # 并发数（覆盖 api_config 的 concurrency）
```

- **源码**：`src/commands/run.ts:24`
- **执行模型**：`QueueRunner`（`src/executor/QueueRunner.ts`）按 provider 分组——**跨 provider 并行，同 provider 内串行/限并发**（`QueueRunner.ts:69-119`）
- **provider 解析**：`container.resolveExecutor(providerName)`（`QueueRunner.ts:84`），provider 实现在 `src/executor/providers/`
- **API 参数来源**：task.json 携带 `_opsv.{provider, shotId, modelKey, compiledAt}`；model 端点/超时/重试来自 `.opsv/api_config.yaml`

### `opsv iterate <path>`

克隆任务做迭代，支持在克隆时注入指定字段值。两种模式：

```bash
opsv iterate <task.json>                          # 文件模式 → {base}_m{N}.json
opsv iterate <queue-dir>                          # 目录模式 → 克隆整个队列目录
opsv iterate <task.json> --inject modelParams.cfgScale=7.5    # 注入数字
opsv iterate <task.json> --inject promptPrefix="high quality"  # 注入字符串
opsv iterate <task.json> --inject steps.mode="{\"fast\":true}" # 注入 JSON 对象
```

- **源码**：`src/commands/iterate.ts:18`
- **文件模式**：剥离已有 `_mN` 后缀得 base，扫描目录找下一个序号，产出 `{base}_m{nextSeq}.json`（`iterate.ts:48-79`）。克隆时清除 `_opsv.compiledAt` 和 `_opsv.resumeTaskId`（`iterate.ts:181-195`）
- **目录模式**：剥离尾部 `_mN` 得 base，产出 `{baseName}_m{nextSeq}/`（`iterate.ts:85-130`）
- **`--inject <key=value>`**：克隆后在副本中注入字段值，`key` 支持点号路径（如 `modelParams.cfgScale`），`value` 自动识别类型：纯数字→number、`true`/`false`→boolean、`null`→null、JSON 对象/数组→解析、其他→string（`iterate.ts:198-237`）
- **后缀正则**：`^(.+)_m(\d+)$`（小写 m，`naming.ts:34`）
- **禁止**：手改产物名/任务名，命名完全由命令管

> 详情见 `validate_and_iterate.md`。

---

## 5. 审阅与审批

### `opsv review`

启动可视化审阅服务器（本地 Express 或云 tunnel）。

```bash
opsv review                              # 本地，默认端口 3100
opsv review --circle [path]              # 指定 circle（manifest 驱动）
opsv review --latest                     # 自动用最新 circle
opsv review --all                        # 审阅全部
opsv review --port <port>
opsv review --ttl <seconds>              # 会话存活（默认 900）
opsv review --cloud                      # 云审阅（暂未开放）
opsv review --status <sessionId>         # 查会话状态
opsv review --rotate-review-token <id>   # 轮换审阅 token
opsv review --close <sessionId>          # 关闭会话
```

- **源码**：`src/commands/review.ts:94`
- **两种策略**：`ManifestReviewStrategy`（`--circle` 时，manifest 驱动）/ `GlobalReviewStrategy`（frontmatter 为唯一真相，无 manifest）
- **自动 git commit**：审阅前自动提交 pending 改动（`review.ts:64-77`）
- **HTTP handler**：`src/review-ui/controllers/`（reviewApprove / approve / file / document / circle）

### `opsv approve <output-file>`（替代旧 `opsv approved`）

审批一个生成的产物文件——自动追溯源文档，将其引用添加到 `## Approved References`。一个文件 = 一次 approve。

```bash
opsv approve <output-file>      # 必填：产物文件路径
  --action <action>             # approve | design_feedback | revise_prompt（默认 approve）
  --dry-run                     # 预览不落盘
  --note <text>                 # 附带备注
```

- **源码**：`src/commands/approve.ts:38`
- **追溯链路**：
  1. `parseOutputFilename()` 解析产物名 → 得 task JSON 名
  2. 同目录读 task JSON → 提取 `_opsv.shotId`
  3. `AssetManager.findAssetFilePathUnder()` → 定位源文档
- **鉴 modified**：`_m{N}_{index}.ext` → 状态 `syncing`，否则 `approved`
- **增量命名是前提**：跨目录扫描 + 并发锁，保证文件名唯一

---

## 6. 引用与辅助

### `opsv refs check <file>`

检查单个文档的 prompt ↔ refs 一致性。

```bash
opsv refs check <file>
```

- **源码**：`src/commands/refs.ts:28`
- **只比对 `prompt` 字段**（v0.10.0 起，`refs.ts:106` 注释）
- **报告两类问题**：
  - `missingInRefs`（红，exit 1）：prompt 用了 `@id` 但 refs 没声明
  - `unusedInPrompt`（黄）：refs 声明了但 prompt 没用

### `opsv refs fill <file>`

扫描 prompt 中 `@id` 引用，自动补齐缺失的 refs 键 + 填充路径。取代旧 `refs sync`。

```bash
opsv refs fill <file>           # 打印计算结果到 stdout
opsv refs fill <file> --write   # 写回文件
opsv refs fill <file> --dry-run # 预览不改文件
```

- **源码**：`src/commands/refsFill.ts:24`
- **行为**：缺失的 key 自动添加 + 已有空路径的 key 补全路径 + 已有路径的 key 跳过
- **引用类型**：
  - `@id` / `@id:variant`：从 `videospec/` 找 descriptor → 读 `## Approved References` → 取已审批图片路径
  - `@:key`（v0.13.8+）：从**当前文档**的 `## Design References` 区找 `![key](path)` → 取路径
- **input_type 推断**：从 AssetDocIndex 按文件扩展名推断（image/video/audio/bvh/mask），默认 `image`

### `opsv image-stitch <inputs...>`

拼接多张图片。

```bash
opsv image-stitch <imgs...> -o <out> --right    # 横向拼接
opsv image-stitch <imgs...> -o <out> --down     # 纵向拼接
```

- **源码**：`src/commands/imageStitch.ts:19`
- **默认输出**：`stitched.png`

### `opsv comfy-node-mapping`

见 §3（编译组）。

---

## 7. API 配置

### `opsv api-setup`

配置 API Provider 和 API Key。支持交互模式和 Agent 编程模式。

```bash
opsv api-setup                        # 交互模式：扫描所有模型，显示 key 状态，引导补全缺失 key
opsv api-setup --list                 # JSON 输出（Agent 友好），含每个模型的 key 状态
opsv api-setup --set-key KEY=VALUE    # 设置/更新单个 key 到 .env
opsv api-setup --add-model <json>     # 追加 comfylocal / runninghub / rhapi 模型配置
opsv api-setup --sync-env             # 扫描 api_config，补全 .env 中缺失的 key 占位
```

- **源码**：`src/commands/apiSetup.ts:25`
- **`--add-model` JSON 格式**（支持 `comfylocal` / `runninghub` / `rhapi`，`comfylocal` 和 `runninghub` 必须包含 `node_mappings`；`rhapi` 不需要）：

```json
// comfylocal 示例：workflow 指向单个 .json 文件
{"modelKey":"comfylocal.myflux","config":{"provider":"comfylocal","workflow":"comfyui_workflow_templates/txt2img.json","node_mappings":{"prompt":{"nodeId":"6","fieldName":"text"},"seed":{"nodeId":"25","fieldName":"noise_seed"}}}}

// runninghub 示例：workflowId 指向云端工作流
{"modelKey":"runninghub.myvideo","config":{"provider":"runninghub","workflowId":"wf_abc123","api_url":"https://www.runninghub.cn/task/openapi/create","api_status_url":"https://www.runninghub.cn/task/openapi/status","node_mappings":{"prompt":{"nodeId":"6","fieldName":"text"},"image1":{"nodeId":"10","fieldName":"image"}}}}

// rhapi 示例：直连 REST API，不需要 node_mappings
{"modelKey":"rhapi.seedance2mini","config":{"provider":"rhapi","api_url":"https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0-mini/multimodal-video","type":"video","supports_reference_images":true,"defaults":{"resolution":"720p","duration":"5"}}}
```

- **`--add-model` 验证规则**：
  - `comfylocal`：`workflow` + `node_mappings` 必填；不允许 `required_env`；`api_url` 默认 `http://127.0.0.1:8188/`
  - `runninghub`：`workflowId` + `node_mappings` + `api_url` + `api_status_url` 必填；自动追加 `required_env: ["RUNNINGHUB_API_KEY"]`
  - `rhapi`：`api_url` 必填；不需要 `node_mappings`；`api_status_url` 默认 `https://www.runninghub.cn/openapi/v2/query`；`required_env` 自动追加 `["RH_API_KEY"]`；`type` 默认 `video`
- **`--set-key`**：如 `opsv api-setup --set-key RUNNINGHUB_API_KEY=sk-xxx`，写入项目 `.env`
- **`--sync-env`**：扫描所有模型的 `required_env`，将缺失的变量以 `your_key_here` 占位追加到 `.env`

### 加密行为（v0.14.4+）

`api-setup` 首次写入 key 时会**自动初始化加密**：

1. 生成 `~/.opsv/master.key`（32 字节 AES-256-GCM 密钥）
2. 将已有明文 `.env` 迁移为加密格式
3. 后续所有 key 写入都加密存储

加密后的 `.env` 文件不再可读的 KEY=VALUE 格式，而是 JSON 密文：

```json
{"_opsv_env":1,"iv":"...","tag":"...","data":"..."}
```

**无 `master.key` 时完全向后兼容**（明文存储）。

---

## 9. 环境管理

### `opsv env`

环境变量管理命令组，管理 `.env` 的加载、查看和加密。

#### `opsv env load`

手动重新加载 `.env` 文件到 `process.env`。支持三层加载（优先级从低到高）：

1. 用户级：`~/.opsv/.env`
2. 项目根：`<project>/.env`
3. 项目隐藏：`<project>/.opsv/.env`

```bash
opsv env load                        # 加载所有三层 .env 到当前 session
opsv env load --dry-run              # 预览要加载的内容，不实际设置
```

- **源码**：`src/commands/env.ts:21`
- **`--dry-run`**：按层显示每个 key 的值，标记跨层覆盖关系
- **加密支持**：有 `master.key` 时自动解密；无 `master.key` 时按明文读取
- **强制覆盖**：高优先级层覆盖低优先级层同名 key

#### `opsv env list`

列出各层 `.env` 中定义的 key 及其加载状态（**不显示 key 值**）。

```bash
opsv env list
```

- **源码**：`src/commands/env.ts:79`
- **输出示例**：
  ```
  User (~/.opsv/.env):
    ✅ active  COMMON_KEY

  Project (.env):
    ✅ active  ARK_API_KEY
    ✅ active  RH_API_KEY
  ```
- **安全**：只显示 key 名和状态，不泄漏 key 值

#### `opsv env init-key`

手动初始化 `master.key`，并将所有三层 `.env` 文件迁移到加密格式。

```bash
opsv env init-key                    # 生成 master.key + 迁移所有 .env
opsv env init-key --dry-run          # 预览哪些 .env 会被迁移
```

- **源码**：`src/commands/env.ts:119`
- **扫描范围**：`~/.opsv/.env`、`<project>/.env`、`<project>/.opsv/.env`
- **幂等**：已加密的 `.env` 跳过，已有 `master.key` 则跳过生成
- **`--dry-run`**：显示每个 `.env` 文件的状态（not found / already encrypted / will be migrated）

---

## 8. 登录相关（OpsV Cloud）

> 仅云审阅/云同步场景使用，生产管线默认本地。

| 命令 | 说明 | 源码 |
|------|------|------|
| `opsv login` | 浏览器 OAuth 登录 OpsV Cloud | `src/commands/login.ts:15` |
| `opsv whoami` | 显示当前登录用户 | `src/commands/login.ts:35` |
| `opsv logout` | 清除本地凭证 | `src/commands/login.ts:47` |

---

## 8. webapp-exec 子命令

浏览器自动化任务的执行态管理：

| 命令 | 说明 | 源码 |
|------|------|------|
| `opsv webapp-exec run` | 执行 webapp 任务 | `src/commands/webappExec.ts:30` |
| `opsv webapp-exec status` | 查队列状态 | `src/commands/webappExec.ts:83` |
| `opsv webapp-exec info` | 查任务解析信息 | `src/commands/webappExec.ts:99` |

---

## 附录：命令注册一览

入口 `src/cli.ts:77-102`，注册顺序见 `cli.ts`。Provider 注册（`cli.ts:69-75`）：volcengine / siliconflow / minimax / runninghub / comfylocal / webapp / rhapi。

> 注：`cli.ts:83` 注释为 "Register all commands"（v0.11.0 已修正数字）。

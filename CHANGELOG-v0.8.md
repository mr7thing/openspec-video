# OpsV v0.8.x 会话变更记录

> 记录范围：v0.8.1 → v0.8.5，涵盖 2026-04-28 ~ 2026-04-29 全部会话

---

## v0.8.1 — 2026-04-28 16:58

### 变更要点

1. **`type` → `category` 重命名**
   - frontmatter `type` 字段重命名为 `category`
   - `AssetTypeEnum` → `AssetCategoryEnum`，`AssetType` → `AssetCategory`
   - 文档 category 是组织分类（character/prop/scene/shot-design 等），**不等于**生成类型
   - 生成类型由 `--model`（来自 `api_config.yaml`）决定，与文档 category 完全解耦
   - 影响文件：`FrontmatterSchema.ts`、`AssetManager.ts`、`DependencyGraph.ts`、`validate.ts`、`script.ts`、`animate.ts`、`comfy.ts`、所有模板 frontmatter

2. **Review 审批逻辑改进**
   - Review approve 根据生成物文件名自动判断状态：
     - `id_1.ext`（原始任务）→ 直接 `approved`
     - `id_N_N.ext`（修改任务）→ `syncing` + review 记录追加 `modified_task` 路径
   - **CLI 非冲突原则**：Review approve 绝不修改 `prompt_en` 等内容字段，仅追加 review 记录 + 设置状态
   - `syncing` 资产需 Agent 检查 review 记录中的 `modified_task`，对齐文档描述字段后改为 `approved`

3. **状态机简化**
   - `drafting → syncing → approved`
   - 移除 `draft` 状态，仅保留 `drafting`、`syncing`、`approved`
   - `pending_sync` → `syncing`（已在更早版本完成）

4. **任务/生成物命名约定**
   - 初始编译：`id.json` → 生成物 `id_1.ext`
   - 修改任务递增：`id_2.json`、`id_3.json`...
   - 修改任务生成物：`id_N_1.ext`（多一个 `_1` 层级，N≥2）

---

## v0.8.1 — 2026-04-28 17:01 (补充)

### 变更要点

5. **`.gitignore` 清理**
   - 忽略 `0.8.1fix.md`，从 git 追踪中移除（文件保留磁盘）

---

## v0.8.1 — 2026-04-28 16:58 (同批次，webapp 重命名)

### 变更要点

6. **`opsv app` → `opsv webapp` 重命名**
   - 删除 `src/commands/app.ts`，创建 `src/commands/webapp.ts`
   - 删除 `src/executor/providers/BrowserProvider.ts`，创建 `WebappProvider.ts`
   - 删除 `src/server/daemon.ts`（WebSocket daemon），删除 `src/server/` 目录
   - `cli.ts`：`registerAppCommand` → `registerWebappCommand`

7. **WebappProvider（HTTP submit-poll）**
   - Chrome 扩展暴露本地 HTTP API（`http://127.0.0.1:9700`）
   - CLI 用与其他 provider 相同的 submit-poll 模式调用
   - 执行前 health check（扩展未启动快速报错）
   - 无 API key 请求头（浏览器会话认证）
   - 输出为 base64 解码写文件

8. **WebappCompiler**
   - `Job` → webapp `TaskJson` 编译器
   - payload 包含：`task_id`、`target_url`、`prompt`、`typing_speed`、`watermark_removal`、`upload_method`
   - 参考图传本地路径（`reference_files`），非 base64

9. **api_config.yaml webapp 模型条目**
   - `webapp.gemini`、`webapp.wan`、`webapp.jimeng`
   - 每个网站视为不同 model key
   - 无 `required_env`（不用 API key）
   - `upload_method`：`drag-drop` | `file-input` | `paste`

10. **梯度轮询 + JSONL .log 检查点**
    - 所有 6 个 provider 统一使用 `polling.ts` 工具
    - 梯度间隔：0-5min→10s，5-10min→30s，10-30min→60s，30min+→300s
    - `.log` 文件 = JSONL append-only，crash-safe 检查点
    - 事件：`submitted`、`polling`、`succeeded`、`failed`
    - Resume：如 `.log` 存在 submitted/polling 但无 succeeded/failed，下次 `opsv run` 读取 task_id 恢复轮询

11. **依赖清理**
    - 移除 `ws`、`@types/ws` 依赖
    - 构建脚本简化：`tsc && node scripts/copy-ui-assets.js` → `tsc`

---

## v0.8.2 — 2026-04-28 22:38

### 变更要点

12. **Circle 目录扁平化：`{basename}.circle{N}/`**
    - 旧：`opsv-queue/videospec/zerocircle/volcengine.seadream/@hero.json`（4 层嵌套）
    - 新：`opsv-queue/videospec.circle1/volcengine.seadream/@hero.json`
    - 不再有 `zerocircle/`、`firstcircle/`、`endcircle/` 子目录
    - 同一 `.circleN/` 下所有 layer 的任务共存于 `provider.model/` 扁平目录
    - layer 分层信息只记录在 `_manifest.json` 中

13. **批次递增管理**
    - `.circle1`、`.circle2`、`.circle3`... — 每次 `circle create` 递增
    - 历史批次保留，不再覆盖
    - `DependencyGraph.detectCircleN()` 扫描已有目录确定下一个 N

14. **`_assets.json` 消除，合并为 `_manifest.json`**
    - `_manifest.json` 新增 `target` 和 `assets` 字段
    - `assets` 字段：`Record<string, { status: string; layer: number }>`
    - 一个文件同时包含调度计划（`circles`）和执行状态（`assets`）
    - `_manifest.json` 位置：从 `opsv-queue/videospec/` 移入 `opsv-queue/{name}.circleN/`

15. **`--dir` 精确扫描 + 上游依赖拉入**
    - `--dir` 指定目标目录（如 `elements/role`），只扫描该目录下的 `.md`
    - 沿 `refs` 追溯上游：未 approved 的上游拉入同一 `.circleN/`，标记为更早 layer
    - 已 approved 的上游不拉入（只需引用输出路径）
    - `buildFromProject()` → `buildFromDir()`

16. **`--name` 参数**
    - `opsv circle create --name <name>` 覆盖 basename
    - 同名冲突检测：不同 `--dir` 产生相同 basename → 报错 + 提示 `--name`

17. **Produce 命令路径适配**
    - `resolveCircle()` → `resolveTarget()`
    - 读取待编译资产从 `_manifest.json` 的 `assets` 字段（非 `_assets.json`）
    - 4 个命令（imagen/animate/webapp/comfy）统一更新

18. **Review 命令适配**
    - `scanCircles()` 扫描 `*.circle*/` 目录模式
    - approve 更新 `_manifest.json` 的 `assets` 字段
    - `queueRoot = opsv-queue/`（去掉 `videospec` 层）

---

## v0.8.3 — 2026-04-28 23:35

### 变更要点

19. **双通道参考图体系**
    - **外部引用**：`@assetId:variant`（正文）+ `refs:`（frontmatter）→ 读取被引用文档的 `## Approved References`
    - **内部引用**：本文档的 `## Design References` → `DesignRefReader` 读取
    - **`## Approved References`**：输出侧，被其他文档 `@assetId:variant` 引用时读取
    - **`## Design References`**：输入侧，本文档自带的参考图，编译时直接加入 `reference_images`

20. **`DesignRefReader` 新增**
    - 读取 `## Design References` 章节的 `![alt](path)` 图片
    - 有标题（`![Qinz全身参考]`）→ 只引用该图
    - 无标题（`![](path)`）→ 引用该章节所有图片（用文件名作 key）
    - 路径解析为绝对路径，文件不存在则跳过

21. **`Asset.designRefs` 字段新增**
    - `Asset` 接口新增 `designRefs: DesignRef[]`
    - `AssetManager.loadFromVideospec()` 同时填充 `approvedRefs` 和 `designRefs`

22. **Produce 命令修复**
    - 第二个引用块：`asset.approvedRefs` → `asset.designRefs`
    - `imagen.ts`、`webapp.ts`：修复
    - `animate.ts`：补上缺失的 `designRefs` 块
    - `comfy.ts`：无需修改（不传参考图）

23. **`@FRAME:` 路径修复**
    - 旧：硬编码 `opsv-queue/videospec/{shotId}_{frameType}.png`
    - 新：扫描 `opsv-queue/*.circle*/provider.model/` 目录查找帧文件
    - 适配 v0.8.2 的扁平 `.circleN/` 目录结构

---

## 版本号时间线

| 版本 | 时间 | 核心主题 |
|------|------|---------|
| v0.8.1 | 2026-04-28 16:58 | webapp 重命名、category 解耦、梯度轮询、.log 检查点 |
| v0.8.2 | 2026-04-28 22:38 | Circle 扁平化 (.circleN)、合并 _manifest.json、--dir 精确扫描 |
| v0.8.3 | 2026-04-28 23:35 | 双通道参考图（Design + Approved）、DesignRefReader、@FRAME 路径修复 |
| v0.8.4 | 2026-04-29 10:00 | ComfyUI --workflow/--workflow-dir、ref(N) 自动匹配、_opsv_workflow 验证 |
| v0.8.5 | 2026-04-29 11:30 | init 模板复制化、.env 根目录化、cli.ts 优先级修正 |
| v0.8.9 | 2026-04-30 | git init 自动执行、review 前置自动提交、Git 集成文档 |
| v0.8.10 | 2026-05-01 | modelKey 存储修复、Minimax URL 解析修复、api_config 别名更新、新增 I2I 模型 |

---

## v0.8.4 — 2026-04-29 10:00

### 变更要点

24. **`--workflow` / `--workflow-dir` 参数**
    - `opsv comfy --workflow ref2`：指定 workflow 文件名，从 workflow-dir 查找
    - `opsv comfy --workflow /abs/path.json`：指定绝对路径
    - `opsv comfy --workflow-dir workflows/sdxl/`：覆盖 workflow 目录（等同 api_config 的 defaults.templateDir）
    - 不指定时使用 api_config 的 defaults.templateDir

25. **ref(N) 自动匹配**
    - workflow-dir 下文件按 `ref{N}` 模式命名：ref0.json、ref1.json、ref2.json...
    - 编译时计算资产参考图数量（designRefs + externalRefs），自动选择匹配的 workflow
    - 匹配规则：精确匹配 → N < refCount 中最大 → N > refCount 中最小
    - 目录为空或无 ref(N) 文件 → 报错跳过

26. **`_opsv_workflow` 元数据验证**
    - 每个 workflow JSON 必须声明 `_opsv_workflow`，包含 `image_inputs`（有序图片节点 title 列表）和 `text_inputs`（文本节点 title 列表）
    - 缺少 `_opsv_workflow` 或 `image_inputs` 为空 → 报错跳过
    - 参考图按 `image_inputs` 顺序注入，多余 slot 留空

27. **ComfyUI 参考图收集**
    - `buildComfyJob()` 新增参考图收集：designRefs（## Design References）+ externalRefs（@assetId:variant resolved）
    - 与 imagen/animate/webapp 统一的参考图来源

28. **CompileContext 扩展**
    - 新增 `workflowPath?`、`workflowDir?`、`refCount?` 字段
    - `TaskBuilder.compileToDir()` 接收并转发 workflow 参数

29. **编译错误容忍**
    - 单个资产编译失败不中断整体批次，错误汇总报告后跳过

---

## v0.8.5 — 2026-04-29 11:30

### 变更要点

30. **`opsv init` 模板复制化**
    - `api_config.yaml`：从 `templates/.opsv/api_config.yaml` 复制（完整多模型配置 + defaults），不再硬编码精简版
    - `.env`：从 `templates/.env` 复制到项目根目录
    - `.agent/`：从 `templates/.agent/` 递归复制（skills、agent configs）
    - 模板文件缺失时警告跳过而非崩溃

31. **`.env` 根目录化**
    - `templates/.env`：放在模板根目录位置（对应项目根目录）
    - `init.ts`：复制到 `{project}/.env`（项目根目录）
    - `cli.ts`：优先读根目录 `.env`，fallback 读 `.opsv/.env`（向后兼容）
    - `.gitignore`：忽略根目录 `.env`

32. **`opsv init` 不带参数在当前目录初始化**
    - `opsv init`：在当前目录直接初始化（不创建子目录）
    - `opsv init my-project`：创建子目录（不变）
    - 防重复保护：检测 `.opsv/api_config.yaml` 已存在时报错

---

## v0.8.9 — 2026-04-30

### 变更要点

33. **`opsv init` 自动执行 `git init`**
    - 脚手架完成后自动初始化 git 仓库
    - 失败时打印警告提示手动执行

34. **`opsv review` 前置自动提交**
    - 启动 review 服务器前自动执行 `git add -A`
    - Commit message 格式：`pre-review checkpoint: <ISO timestamp>`
    - 无变更时静默跳过（无报错）

35. **Git 集成文档**
    - README.md 新增 Git Integration 章节
    - 说明自动操作和 commit 规范

---

## v0.8.11 — 2026-05-01

### 变更要点

41. **Review 服务 TTL 默认 15 分钟**
    - `--ttl` 默认值从 `0`（永不关闭）改为 `900`（15分钟空闲自动关闭）

42. **Review 文档预览功能**
    - `/api/documents/:circle/:docId` 返回 markdown 文档内容
    - `findDocument()` 读取并返回 `.md` 文件内容
    - Review UI 中间面板渲染文档 markdown 预览

43. **Review UI 文档中心重构**
    - 左侧边栏按文档组织（elements/scenes）
    - 输出文件按文档 ID 分组（`hero_01.png` 和 `hero_01_01.png` 同属 `hero` 文档）
    - 使用 `/api/documents` 端点获取文档列表

---

## v0.8.10 — 2026-05-01

### 变更要点

36. **修复 `_opsv.modelKey` 存储错误**
    - `CompileContext` 新增 `modelKey` 字段，传递原始 api_config key
    - 所有 Compiler 的 `_opsv.modelKey` 改为存 api_config key（如 `volc.seadream5`），不再存 API model 名（如 `doubao-seedream-5-0-260128`）
    - Executor 不再拼接 provider 前缀，直接用 `task._opsv.modelKey` 查配置

37. **修复 MinimaxProvider 图片 URL 解析**
    - MiniMax 图像 API 返回 `data.image_urls[0]`（数组），原代码字段路径错误
    - 修正为 `response.data?.data?.image_urls?.[0]`

38. **修复 `buildImageJob` 硬编码 `aspect_ratio: '1:1'`**
    - `imagen.ts` 和 `comfy.ts` 的 `buildImageJob`/`buildComfyJob` 改为读取 `frontmatter.aspect_ratio`
    - 不再忽略 frontmatter 配置

39. **更新 `api_config.yaml` 模型别名**
    - MiniMax: `minimax.image-01` → `minimax.img01`，`minimax.video-01` → `minimax.vid01`
    - RunningHub: `runninghub.workflow` → `runninghub.default`
    - 新增 `siliconflow.edit2509`（Qwen-Image-Edit I2I 模型）
    - 所有模型添加 `docs_url` 字段
    - `volc.seadream5` 添加 `quality_map` 解决最小分辨率限制

40. **文档更新**
    - README.md 新增 `--model` 参数与 API Config 别名章节
    - 所有示例命令更新为新别名格式

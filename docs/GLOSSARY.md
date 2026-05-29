# OpsV 词汇表

> 项目核心术语的唯一定义。AI Agent 和协作者应以此为准。

---

## 刻意区分的关键词对

### `category` ≠ `type`

| 词 | 定义 | 示例 |
|----|------|------|
| **category** | 文档分类标签。内置 `project` 和 `shotlist`，其余由用户在 `_category_validate.yaml` 中自定义。决定**验证规则**。 | `character`, `scene`, `shot` |
| **type** | API 模型类型，在 `api_config.yaml` 中声明。决定**调用哪个 Provider 和执行方式**。 | `imagen`, `video`, `comfy`, `webapp` |

**两者独立**：同一 category 的文档可以用不同 type 的模型生成（如 `shot` 可以用 `imagen` 生成静态图，也可以用 `comfy` 生成视频）。category 和 type 刻意使用不同词汇以消除歧义。

---

### `Circle` ≠ `Layer`

| 词 | 定义 | 示例 |
|----|------|------|
| **Circle** | 一次 `opsv circle create` 产出的**批次**。一个 Circle 目录（`videospec_circle1/`）包含**所有层级**的编译产出。 | `videospec_circle1/` |
| **Layer** | 拓扑排序中的**层级位置**（index 0, 1, 2...）。由 refs 依赖关系决定。同一 Circle 内包含多层。 | `zerocircle`(index 0), `firstcircle`(index 1) |

**关系**：一个 Circle 包含多个 Layer。Layer 变化（依赖结构改变）时，需 `opsv circle create` 新建 Circle 批次。Layer 不变时，所有编译在同一个 Circle 目录内推进。

---

### `compile` ≠ `run`

| 词 | 定义 |
|----|------|
| **compile** | `opsv imagen/animate/comfy/webapp` — 读取 manifest + 文档 frontmatter，编译为可执行的 `.json` 任务文件。**不调 API，不产生费用。** |
| **run** | `opsv run <path>` — 读取编译后的 `.json`，调用 AI Provider API 执行渲染。**消耗配额/费用。** |

---

### `provider` ≠ `model`

| 词 | 定义 | 示例 |
|----|------|------|
| **provider** | AI 服务平台。 | `volcengine`, `siliconflow`, `minimax`, `runninghub`, `comfylocal` |
| **model** | `--model` 参数的值 = `api_config.yaml` 中的 key = provider.model 组合。 | `volcengine.seadream`, `runninghub.default` |

---

### `prompt` ≠ `visual_detailed` ≠ `visual_brief`

| 字段 | 用途 | 语言 | 字数 |
|------|------|------|------|
| **prompt** | 提交给 AI 模型的**最终指令**。refs 校验的唯一目标字段。 | 英文（模型原生语言） | — |
| **visual_detailed** | 给人看的**详细画面描述**。syncing 时从 prompt 翻译而来。 | 中文 | — |
| **visual_brief** | 一句话**画面摘要**。 | 中文 | 10-30 字 |

---

## 单一定义词

### `manifest`

`_manifest.json` 文件。由 `opsv circle create` 生成，`opsv circle refresh` 更新。记录一个 Circle 批次的**快照**：所有 Layer、asset、status。**不是**资产属性的权威来源——权威来源是文档 frontmatter。

### `document`

`videospec/` 下的 `.md` 文件。其 YAML frontmatter 是资产属性的**唯一权威来源**。manifest 中的值仅为快照，不得覆盖文档。

### `queue`

`opsv-queue/` 目录。**只增不删**。包含所有 Circle 批次的编译产物和渲染输出。

### `refs`

文档 frontmatter 中的 `refs` 字段。表达**视觉输入依赖**——生成此资产时，哪些参考图必须先存在。refs 构成有向无环图（DAG），决定拓扑排序和 Layer 归属。

### `Design References` vs `Approved References`

| 区域 | 方向 | 谁写入 | 用途 |
|------|------|--------|------|
| `## Design References` | 输入侧 | Agent 手动编辑 | 本文档的参考素材，编译时作为 `reference_images` |
| `## Approved References` | 输出侧 | `opsv review` 自动写入 | 定档图像，供**其他文档**通过 `@id:variant` 引用 |

### `syncing`

审查通过修改任务的产出后（`id_2_1.png`），CLI 设置的中间状态。表示 Agent 需要将文档字段（prompt/visual_detailed/refs）与 task JSON 实际参数对齐。**阻断下游 Layer 编译**。对齐完成后 Agent 手动改为 `approved`。

### `approved`

资产完全就绪。可作为下游 Layer 的依赖。`approved` ⇔ 必须存在 `## Approved References`。

### `shotlist`

内置 category，末环 EndCircle 的批量视频生成文档。`opsv animate` 的编译目标。视频生成**不限于** shotlist——ComfyUI 工作流可以对任意 category 的文档生成视频。

### `node_mapping`

ComfyUI 工作流中的参数注入配置。格式为 `"节点title|input字段名"`。定义哪些 workflow 节点接受外部输入。`opsv comfy-node-mapping` 自动提取。

### `Syncing Gate`

Produce 命令编译时的依赖状态检查：引用的 `@ref` 资产为 `syncing` 或 `drafting` 时，跳过当前资产编译。只有全部依赖为 `approved` 时才通过。

---

## 废弃术语（不应使用）

| 废弃词 | 原因 | 替代 |
|--------|------|------|
| `reviewJwt` | 它不是 JWT，是 hex 字符串 | `reviewToken` |
| `tier` | 已重命名为 plan | `plan` |
| `snake_case` 字段名 | 已统一为 camelCase | 见 `frontmatter_schema.md` |

---

## Agent 速查

| 疑问 | 去哪 |
|------|------|
| category 和 type 的关系？ | 本文 § 刻意区分的关键词对 |
| Circle 和 Layer 的区别？ | 本文 § 刻意区分的关键词对 + `docs/PIPELINE.md` |
| prompt / visual_detailed / visual_brief 各自用途？ | 本文 § 刻意区分的关键词对 |
| refs 该不该加某个引用？ | `skills/opsv/references/refs_guide.md` |
| Frontmatter 完整字段？ | `skills/opsv/references/frontmatter_schema.md` |

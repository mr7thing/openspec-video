# 文档生命周期与状态 (lifecycle_and_status)

> 真相基准：`src/types/FrontmatterSchema.ts`、`src/executor/naming.ts`、`src/core/ApproveService.ts`、`src/core/DependencyGraph.ts`

---

## 1. 三状态枚举

定义在 `src/types/FrontmatterSchema.ts:13`：

```ts
export const StatusEnum = z.enum(['drafting', 'syncing', 'approved']);
```

| 状态 | 含义 | 谁来设 |
|------|------|--------|
| `drafting` | 文档草稿中，未通过审阅 | Agent 写文档时的默认值 |
| `syncing` | 任务文件被 iterate 改过且 review 通过，待回写源文档 | `approved` 命令在检测到 `_mN` 产物时自动标 |
| `approved` | 已通过审阅，解锁下游引用 | `approved` 命令 |

**关键**：`review` 是**动作**不是状态。状态只有这三个。

---

## 2. 两条生命周期路径

```
路径 A（任务无修改）:
  drafting ──review──→ approved

路径 B（任务有修改，即 iterate 改过 prompt/refs/参数）:
  drafting ──review──→ syncing ──回写源文档──→ approved
```

### 2.1 syncing 的判定依据

源码 `src/core/ApproveService.ts:83-85` + `src/executor/naming.ts:80-108`：

`opsv approved` 审批时扫描产物文件名，用 `parseOutputFilename()` 判断：

- 文件名匹配 `_m{N}_{index}.ext`（如 `shot_01_m1_1.png`）→ **modified task** → 状态标 `syncing`
- 文件名只有 `_{index}.ext`（如 `shot_01_1.png`）→ **original task** → 直接 `approved`

### 2.2 syncing 要做什么

`syncing` 表示：任务 JSON 里的新 prompt/refs/duration 已经 review 通过，但**源 `.md` 文档还没同步**。

- Agent 需要把任务 JSON 里的改动**回写**到源文档 frontmatter
- 回写完成后再跑一次 `approved` → 状态转 `approved`
- 这是单向的：任务 JSON ←(iterate 改)→ 重跑 → syncing → 回写源文档 → approved

### 2.3 syncing 不是必经

只有 iterate 改了任务才进 syncing。路径 A（直接通过）不经过 syncing。

---

## 3. 状态一致性校验

`opsv validate` 会检测状态不一致（`src/commands/validate.ts:258-327`，`findStatusInconsistencies`）：

- 遍历 `opsv-queue/` 下所有 `_manifest.json`
- 对比 manifest 里 `assets[id].status` 和源文档 frontmatter 的 `status`
- 不一致 → 报 error

manifest 状态更新发生在 `ApproveService.updateManifestStatus()`（`ApproveService.ts:204-221`）：同时写 `manifest.assets[id].status` 和每个 `circle.status[id]`。

---

## 4. 产物命名规则

定义在 `src/executor/naming.ts:1-13`（顶部注释）+ 各函数实现。

### 4.1 任务 JSON 命名

```
id.json        → 原始任务
id_m1.json     → 第 1 次迭代
id_m2.json     → 第 2 次迭代
```

- 后缀正则：`^(.+)_m(\d+)$`（**小写 m**，`naming.ts:34`）
- 序号由 `iterate` 命令扫描目录自动递增（`iterate.ts:152-164`，`findNextTaskSeq`）

### 4.2 产物文件命名

```
任务 id.json     → 产物 id_1.ext, id_2.ext ...       （重跑递增）
任务 id_m1.json  → 产物 id_m1_1.ext, id_m1_2.ext ... （迭代产物）
```

- 产物名 = 任务 JSON 名 + `_{index}.ext`（`outputFilename()`，`naming.ts:39-42`）
- index 由 `resolveNextOutputIndex()`（`naming.ts:53-71`）扫描目录里 `base_*.ext` 取最大值 +1

### 4.3 shot_id 不带版本号

`shot_id`（如 `S01-Shot01`）本身**始终不变**。版本后缀全部加在任务/产物名上，由命令自动管理。

### 4.4 关键规则

> **所有命名由 OPSV 命令自动处理。Agent 禁止手动给产物加后缀或改名。**

| 操作 | 命令 | 产物命名 |
|------|------|---------|
| 首次编译执行 | `compile`（via circle） + `run` | `{任务json名}_1.png` |
| 同参数重跑 | `run` | `{任务json名}_2.png` |
| 修改迭代 | `iterate <task>` | 新任务 `{任务json名}_m1.json` |
| 迭代后执行 | `run` | `{任务json名}_m1_1.png` |

---

## 5. iterate 后的克隆逻辑

`cloneTaskJson()`（`src/commands/iterate.ts:181-195`）做的事：

1. 深拷贝原 task JSON
2. 清除 `_opsv.compiledAt`（让新任务被当作首次运行）
3. 清除 `_opsv.resumeTaskId`（不续跑旧任务）
4. 写入 `{base}_m{nextSeq}.json`

Agent 拿到克隆的任务后，可以改 `prompt` / `refs` / `duration` / `seed` 等字段，然后 `opsv run` 重跑。

---

## 6. 文档分类（category）

category 是文档的**组织分类**，不是生成类型（`FrontmatterSchema.ts:8-9` 注释）。生成类型由 `--model` 从 `api_config.yaml` 决定。

- category 字段在 frontmatter 声明：`category: <name>`
- 每个 category 对应 `_category_validate.yaml` 里的一条校验规则
- **Agent 不能用未注册的 category**——否则 validate 报错

> 类别清单与校验机制见 `validate_and_iterate.md`。

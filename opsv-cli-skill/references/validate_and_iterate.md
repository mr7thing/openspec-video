# validate 与 iterate (validate_and_iterate)

> 真相基准：`src/commands/validate.ts`、`src/utils/categoryValidateLoader.ts`、`src/core/CategoryValidator.ts`、`src/commands/iterate.ts`、`src/executor/naming.ts`

---

## 1. validate 命令

### 1.1 加载顺序（优先级从低到高）

`src/utils/categoryValidateLoader.ts:53-70`：

```
builtin 内置规则
   ↓ 覆盖
~/.opsv/category_validate.yaml          （用户级）
   ↓ 覆盖
<project>/.opsv/category_validate.yaml         （项目级，最高）
```

合并方式：`Object.assign` 逐层覆盖（`categoryValidateLoader.ts:58-68`），后加载的覆盖前者。

### 1.2 内置类别（`BUILTIN_DEFAULTS`，`categoryValidateLoader.ts:30-44`）

只有两个内置类别，不可删：

| 类别 | required_fields | 特殊 |
|------|-----------------|------|
| `project` | `status` | `skip_prompt_check: true` |
| `shotdeck` | `status`, `title` | prompt `min_length: 10` + `no_placeholder: true` |

### 1.3 自定义类别

OPSV 只内置 `project` 和 `shotdeck` 两个类别（见 §1.2），其余类别均由用户在 `.opsv/category_validate.yaml` 中自定义。

这意味着**类别体系是项目相关的**——不同项目可以定义完全不同的类别集合。Agent 写文档前必须先查看项目的 `_category_validate.yaml`，`category` 字段取值必须在该文件中注册（或使用内置的 `project`/`shotdeck`），否则 validate 的类别注册检查（§1.5 第 3 步）会报错。

#### 自定义类别示例

```yaml
# .opsv/category_validate.yaml
concept_art:
  required_fields:
    - status
    - id
    - prompt
    - style
  field_schema:
    prompt:
      min_length: 20
      no_placeholder: true
    style:
      allowed_values: ["realistic", "anime", "pixel"]
```

上例定义了一个 `concept_art` 类别，要求文档必须有 `status`/`id`/`prompt`/`style` 字段，且 prompt 不少于 20 字符、不能有占位符，style 只能取三个值之一。

### 1.4 校验规则结构（`categoryValidateLoader.ts:21-26`）

```ts
interface CategoryRule {
  required_fields?: string[];              // frontmatter 必填字段
  skip_prompt_check?: boolean;             // 跳过 prompt 校验
  severity?: 'error' | 'warning';
  field_schema?: Record<string, FieldCheck>;
}

interface FieldCheck {
  min_length?: number;
  max_length?: number;
  no_placeholder?: boolean;                // 禁止占位符文本
  refs_in_prompt_must_match_refs?: boolean; // prompt 的 @id 必须在 refs 声明
  severity?: 'error' | 'warning';
}
```

### 1.5 validate 的检测项（`validate.ts:43-227`）

按顺序执行：

1. 加载 category 规则 + input_types
2. 构建递归资产文档索引（`buildAssetDocIndex`）
3. 每个文档：
   - schema 校验（按 category 选 Zod schema：`getSchemaForCategory`，`validate.ts:230-241`）
   - refs 结构校验（`RefBinder.bindRefs`）
   - 分类规则校验（除非 `--skip-category-rules`，`CategoryValidator.validateCategory`）
4. 死链检测：每个 `@id` ref 必须能解析到资产索引里的条目（`validate.ts:131-149`）
5. 图片引用存在性：body 里 `![alt](path)` 的文件必须存在（`findMissingImageRefs`，`validate.ts:351-382`）
6. 状态一致性：manifest 与 frontmatter 的 status 必须一致（`findStatusInconsistencies`，`validate.ts:258-327`）

### 1.6 退出码

非零条件：有 error / dead ref / 缺失图片 / 状态不一致 / 类别 error。`--strict` 时类别 warning 也算非零。

**validate 是守门人，不是质量裁判**——它查格式对不对，不评判内容好坏。

---

## 2. iterate 命令

### 2.1 两种模式（`src/commands/iterate.ts`）

#### 文件模式（`iterateFile`，`iterate.ts:48-79`）

```bash
opsv iterate path/to/task.json
```

- 校验是合法 task JSON（必须有 `_opsv` 字段，`iterate.ts:67`）
- 用 `resolveTaskBase()`（`iterate.ts:136-141`）剥离已有 `_mN` 后缀得 base
- `findNextTaskSeq()`（`iterate.ts:152-164`）扫描目录里 `{base}_m*.json` 取最大 N +1
- 产出 `{base}_m{nextSeq}.json`

```
task.json       → iterate → task_m1.json
task_m1.json    → iterate → task_m2.json   （从 base 重新计数）
```

#### 目录模式（`iterateDirectory`，`iterate.ts:85-130`）

```bash
opsv iterate path/to/queue_dir
```

- 用 `resolveDirBase()`（`iterate.ts:143-150`）剥离尾部 `_N` 得 base
- `findNextDirSeq()`（`iterate.ts:166-179`）扫描父目录里 `{base}_*` 目录取最大 N +1
- 产出 `{baseName}_{nextSeq}/`，克隆目录内每个 task JSON

```
queue_001/      → iterate --dir → queue_m1/
```

> **已统一**：目录模式和文件模式后缀一致，均使用 `_mN`。

### 2.2 克隆逻辑（`cloneTaskJson`，`iterate.ts:181-195`）

1. 深拷贝原 task JSON
2. 清除 `_opsv.compiledAt`（新任务当首次运行）
3. 清除 `_opsv.resumeTaskId`（不续跑旧任务）
4. 写入目标路径

非 task JSON（缺 `_opsv`）会被跳过并警告（`iterate.ts:112-114`）。

### 2.3 后缀正则（`src/executor/naming.ts`）

```ts
// naming.ts:34 — 迭代后缀
/^(.+)_m(\d+)$/                    // 小写 m

// naming.ts:88 — 迭代产物（modified）
/^(.+)_m(\d+)_(\d+)\.\w+$/         // base_mN_N.ext

// naming.ts:96 — 原始产物
/^(.+)_(\d+)\.\w+$/                // base_N.ext
```

**小写 m**。文档里写成 `_M1`（大写）会被解析器当作不匹配 → 不识别为迭代任务。

### 2.4 iterate 后 Agent 要做什么

```bash
# 1. iterate 复制任务
opsv iterate opsv-queue/.../S01-Shot01.json
# → 产出 S01-Shot01_m1.json

# 2. Agent 编辑 _m1 任务的 prompt / refs / duration / seed
#    （改的是任务 JSON，不是源 .md 文档）

# 3. 重跑
opsv run opsv-queue/.../S01-Shot01_m1.json
# → 产出 S01-Shot01_m1_1.png

# 4. review 通过后 approved
opsv approved --file "@S01-Shot01" --action approve
# → 因产物名匹配 _mN → 状态标 syncing（待回写源文档）

# 5. Agent 把 _m1 任务的改动回写到源 .md 文档
# → 再次 approved → 状态转 approved
```

---

## 3. 反模式

| 反模式 | 正确 |
|--------|------|
| 手动给任务文件加 `_m1` 后缀 | 用 `opsv iterate` 自动生成 |
| 手动改产物文件名 | 产物名由 `run` 按 `{task}_{index}.ext` 自动管 |
| 迭代后直接手改源 `.md` | 改任务 JSON；源文档同步走 syncing 回写 |
| 用大写 `_M1` 命名 | 小写 `_m1`（正则只认小写） |
| 用 `_category_validate.yaml` 里没有的 category | 只能用注册过的类别（内置 + 项目自定义） |
| `validate` 报错就改代码绕过 | 改文档让格式合规 |

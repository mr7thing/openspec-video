# `@` 引用语法与 refs 字段 (refs_syntax)

> 真相基准：`src/types/Refs.ts`、`src/core/RefBinder.ts`、`src/core/RefSyntaxParser.ts`、`src/commands/refs.ts`

---

## 1. refs 字段结构（字典，不是数组）

**正典是双层字典 + 路径数组**（v0.10.0 起）。

### 1.1 类型定义

`src/types/Refs.ts:15-18`：

```ts
RefsByTypeSchema = z.record(
  z.record(z.array(z.string()).min(1))
);
```

结构：`外层字典 → 内层字典 → 非空字符串数组`

### 1.2 标准写法

```yaml
refs:
  image:                          # 外层 key = input_type
    "@LuRan":                     # 内层 key = @ 引用语法
      - path/to/LuRan.png         # 值 = 解析后的文件路径数组（≥1 个）
    "@LuRan:portrait":
      - path/to/LuRan-portrait.png
    "@:angle_side":               # @:key = 文档内设计引用
      - ./refs/angle_side.png
  video:
    "@shot-S01-Shot01":
      - path/to/clip.mp4
  audio:
    "@voice-narration":
      - path/to/narration.mp3
```

### 1.3 三层约束（编译期强制，`RefBinder.ts:39-75`）

| 层 | 约束 | 违反报错 |
|----|------|---------|
| 外层 key | 必须是已注册的 input_type（见 `input_types.yaml`） | `unknown input_type "xxx"` |
| 内层 key | 必须以 `@` 开头，三种合法形态（见 §2） | `invalid key syntax` |
| 值 | 必须是非空数组 | `must be a non-empty array of paths` |

> **数组形式 `- "@id"` 是 v0.10.0 之前的过时写法，当前编译器会报 `must be an object mapping ref keys to path arrays` 拒绝。** 不要再用。

---

## 2. 四种 `@` 引用语法

定义见 `src/core/RefBinder.ts:81-103`（`parseKey`）+ `src/core/RefSyntaxParser.ts`。

| 语法 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `@id` | 外部资产引用 | 指向另一个文档/资产 | `@LuRan`、`@Dojo-Day` |
| `@id:variant` | 变体引用 | 指定资产的特定 approved 变体 | `@LuRan:portrait` |
| `@:key` | 文档内设计引用 | 指向同文档 body 的 `## Design References` 区 | `@:angle_side` |
| `@FRAME:shotId_first/last` | 帧引用 | 指向上游产出的首帧/尾帧 | `@FRAME:S01-Shot01_last` |

### 2.1 `parseKey` 的判定逻辑（`RefBinder.ts:81-103`）

```
key 以 @: 开头      → doc 引用，id = 冒号后内容
key 含 : （@id:variant） → external + variant
key 仅 @id          → external 无 variant
不以 @ 开头         → null（非法）
```

---

## 3. input_type（外层 key）

来自 `.opsv/input_types.yaml`，定义资产以什么媒体格式上传到服务端。**不同 API 的上传协议不同**——图片走图片通道，视频走视频通道。

内置 input_type（`src/utils/inputTypesLoader.ts` + `.opsv/input_types.yaml`）：

| input_type | 扩展名 |
|-----------|--------|
| `image` | .png / .jpg / .jpeg / .webp |
| `video` | .mp4 / .mov / .webm / .avi |
| `audio` | .mp3 / .wav / .m4a / .flac / .ogg |
| `bvh` | .bvh |
| `mask` | .png |

可在 `input_types.yaml` 自定义扩展。**refs 的外层 key 决定上传通道，必须与引用资产的实际媒体类型匹配。**

---

## 4. prompt 中的 `@` 引用

prompt 里直接写 `@id`，编译时 OPSV 自动解析为实际路径。

```yaml
prompt: >
  广角镜头，清晨阳光洒进 @Dojo-Day 的入口，
  @LuRan 持剑站立，神情坚毅...
```

### 4.1 编译模式（`--prompt-mode`，`src/types/Refs.ts:42-48`）

| 模式 | 行为 |
|------|------|
| `keep`（默认） | prompt 不变，附加 `_refs_map` 让模型自行解析 |
| `index` | `@hero → image1`、`@:angle → image2`（按 type 顺序编号） |
| `name` | `@hero → hero`、`@:angle_side → angle_side`（裸名） |

---

## 5. 变体引用 `@id:variant`

同一资产可有多张 approved 图片（不同角度/光照）。`opsv review`/`approved` 审批时把图片写入源文档 body 的 `## Approved References` 区，variant 名即输出文件名（去扩展名）。

```markdown
<!-- LuRan.md 的 body -->
## Approved References

![portrait](../opsv-queue/.../LuRan-portrait.png)
![fullbody](../opsv-queue/.../LuRan-fullbody.png)
```

下游引用具体变体：

```yaml
refs:
  image:
    "@LuRan:portrait":           # 匹配 ![portrait](path)
      - path/to/LuRan-portrait.png
```

不指定变体（`@LuRan`）→ 取 `## Approved References` 第一个条目。

---

## 6. 双向对应规则

**prompt 里每个 `@id` 必须在 refs 声明，refs 里每个声明最好在 prompt 用到。**

- prompt 用 `@LuRan` 但 refs 没声明 → `opsv refs check` 报 `missingInRefs`（红，exit 1）
- refs 声明了但 prompt 没用 → 报 `unusedInPrompt`（黄，警告）
- 被引用的文档必须存在且 `status: approved`，否则 `validate` 报死链

### 6.1 注意：refs check 只比对 prompt 字段

v0.10.0 起（`src/commands/refs.ts:106` 注释），`refs check` **只扫描 frontmatter 的 `prompt` 字段**，不看 `visual_brief` / `visual_detailed` / body 正文。如果 `@id` 写在 body 里，refs check 不会检测。

---

## 7. 常见错误

| 错误 | 正确 | 原因 |
|------|------|------|
| `@Character:LuRan` | `@LuRan` | 不带类别前缀 |
| `@LuRan.md` | `@LuRan` | `@` 后是 id 不是文件名 |
| `refs.image: - "@LuRan"` | `refs.image: { "@LuRan": [path] }` | 数组形式已废弃，用字典 |
| `refs.unknown_type: ...` | `refs.image: ...` | 外层 key 必须是注册过的 input_type |
| 文件名带 `@` 前缀 | 文件名不含 `@` | `@` 只在 prompt/refs 用 |
| refs 值是空数组 | 至少 1 个路径 | 空数组报 `non-empty array` |
| `@storyboard` 不带 shot_id | `@storyboard-S01-Shot01` | 必须能定位到具体资产 |

---

## 8. refs check / fill 命令

### `opsv refs check <file>`

```bash
opsv refs check videospec/shots/S01-Shot01.md
```

只比对 `prompt` 字段。报告 `missingInRefs`（exit 1）和 `unusedInPrompt`（警告）。

### `opsv refs fill <file>`

```bash
opsv refs fill videospec/shots/S01-Shot01.md           # 打印到 stdout
opsv refs fill videospec/shots/S01-Shot01.md --write   # 写回文件
opsv refs fill videospec/shots/S01-Shot01.md --dry-run # 预览
```

- 自动补齐缺失的 refs key + 填充路径。取代旧 `refs sync`
- 缺失的 key：从 AssetDocIndex 查找文件，自动添加
- 已有空路径的 key：补全路径
- input_type 按文件扩展名推断，默认 `image`

> 命令详情见 `cli_reference.md` §6。

# P13: Provider Input Binding — 变更文档

**版本**: v0.9.0
**提交**: `b48f62b`
**日期**: 2026-05-19

---

## 概述

建立 **frontmatter refs → type 分类 → api_config inputs → API payload** 的完整链路，替代编译器中的硬编码输入解析逻辑。

### 解决的问题

1. frontmatter `refs` 只是符号数组 `["@hero"]`，编译时需额外解析才能获得文件路径
2. 引用没有类型分类 — 无法区分 image/video/audio/bvh/mask
3. api_config 和 frontmatter 字段不对齐 — inputs 映射靠编译器硬编码
4. 内部引用（同一文档内 `### image` 下的参考内容）没有标准语法
5. 多文件引用源无法消歧 — 需要人工确认但系统不支持

---

## 新增文件

### `src/core/RefBinder.ts` — 引用解析与绑定引擎

| 函数 | 说明 |
|------|------|
| `parseRefs(frontmatter, ctx)` | 解析 `RefEntry[]` → `ResolvedRef[]`，提取 id/variant/type/docPath/outputs |
| `parseTypedSections(body)` | 解析 `### <type>` 子标题 + `[text](#refid)` 内部引用 → `TypedSectionRef[]` |
| `resolveToInputs(refs, typedRefs, ctx)` | 按 type 分组输出文件 → `Record<string, string[]>` |

**类型推断**：当 `RefEntry.type` 未指定时，从 id 中推断（包含 `video`→video, `audio/bgm`→audio 等）。

### `src/core/compiler/shared/InputEvaluator.ts` — 输入求值器

| 函数 | 说明 |
|------|------|
| `evaluateSource(source, ctx)` | 求值单个 source 快捷路径 |
| `evaluateInputs(inputs, ctx)` | 求值整个 inputs 配置 → `Record<string, unknown>` |
| `applyToPayload(values, inputs, payload)` | 按 target 注入 payload（非 node-mapping 编译器） |
| `applyToNodeMapping(values, nodeMapping, workflow)` | 按 nodeMapping 注入 workflow（node-mapping 编译器） |
| `buildNodeInfoList(values, nodeMapping)` | 构建 RunningHub nodeInfoList |

**支持的 source 快捷路径**：

| 路径 | 解析为 |
|------|--------|
| `prompt` | `job.prompt \|\| job.payload.prompt` |
| `negative_prompt` | `job.payload.extra?.negative_prompt \|\| modelConfig.defaults?.negative_prompt` |
| `first_frame` / `last_frame` | `job.payload.frame_ref?.first/last` |
| `reference_images` / `[N]` | 引用图片全数组 / 指定索引 |
| `reference_videos` / `[N]` | 引用视频全数组 / 指定索引 |
| `reference_audios` / `[N]` | 引用音频全数组 / 指定索引 |
| `job.payload.X` | payload dot-path |
| `default.X` | modelConfig.defaults?.X |

**applyToPayload target 格式**：

- `content[].image_url` → push 到数组，自动推断 type 和 role
- `content[0].text` → 设置到指定索引
- 其他 → dot-path 设置

---

## 类型变更

### `src/types/FrontmatterSchema.ts`

```typescript
// 旧
refs: z.array(z.string()).optional()

// 新
const RefEntrySchema = z.object({
  id: z.string(),       // "@hero" / "@style:night"
  type: z.string().optional(),  // image / video / audio / bvh / mask / 自定义
});
refs: z.array(RefEntrySchema).optional()

// 新增
interface ResolvedRef {
  id: string;
  variant?: string;
  type: string;
  docPath: string;
  outputs: string[];
}

interface TypedSectionRef {
  type: string;
  refId: string;
  label: string;
  variant?: string;
}
```

### `src/utils/configLoader.ts`

```typescript
interface InputBinding {
  source: string;   // 快捷路径
  target?: string;  // payload 注入位置（非 node-mapping 编译器用）
}

// ModelConfig 新增
inputs?: Record<string, InputBinding>;
```

### `src/core/compiler/ProviderCompiler.ts`

```typescript
// CompileContext 新增
resolvedRefs?: ResolvedRef[];
typedSectionRefs?: TypedSectionRef[];
groupedInputs?: Record<string, string[]>;
```

---

## 编译器重构

所有 5 个编译器统一采用 **inputs 优先 + legacy 兜底** 模式：

```typescript
const inputs = modelConfig.inputs;
if (inputs && Object.keys(inputs).length > 0) {
  // 新路径：用 InputEvaluator 求值
  const values = evaluateInputs(inputs, evalCtx);
  applyToPayload(values, inputs, payload);       // 直接 payload 编译器
  // 或 applyToNodeMapping(values, nodeMapping, workflow);  // node-mapping 编译器
} else {
  // 旧路径：硬编码命名约定（向后兼容）
}
```

| 编译器 | 变更 |
|--------|------|
| ComfyUICompiler | `resolveNodeMappingValue()` → `evaluateInputs()` + `applyToNodeMapping()`，legacy `resolveLegacyValue()` 兜底 |
| RunningHubCompiler | 同上，`buildNodeInfoList()` 构建 nodeInfoList |
| VolcengineCompiler | 硬编码 reference 注入 → `evaluateInputs()` + `applyToPayload()`，legacy 保留 |
| SiliconFlowCompiler | 同 VolcengineCompiler |
| MinimaxCompiler | 同 VolcengineCompiler |

**已删除**: `resolveNodeMappingValue()` 从 `compilerUtils.ts` 移除。

---

## api_config.yaml 新增示例

### volc.seedance2 (direct payload)

```yaml
inputs:
  prompt:
    source: prompt
    target: content[0].text
  first_frame:
    source: first_frame
    target: content[].image_url
  image:
    source: reference_images
    target: content[].image_url
  video:
    source: reference_videos
    target: content[].video_url
  audio:
    source: reference_audios
    target: content[].audio_url
```

### runninghub.default (node-mapping)

```yaml
inputs:
  prompt:
    source: prompt
  negative_prompt:
    source: negative_prompt
  seed:
    source: default.seed
  image1:
    source: reference_images[0]
node_mappings:
  prompt:   { nodeId: "6",   fieldName: "text" }
  seed:     { nodeId: "116", fieldName: "seed" }
  image1:   { nodeId: "10",  fieldName: "image" }
```

---

## 其他文件变更

| 文件 | 变更 |
|------|------|
| `DependencyGraph.ts` | `refs` 迭代从 `string` → `RefEntry`，取 `ref.id` |
| `AssetManager.ts` | `Asset.refs` 类型从 `string[]` → `RefEntry[]` |
| `animate.ts` | refs 过滤和解析适配 `RefEntry` |
| `produceUtils.ts` | ref id 提取从 `ref` → `ref.id` |
| `validate.ts` | frontmatter refs 映射为 id 字符串 |

---

## 文档结构约定

```markdown
---
category: shot
status: drafting
refs:
  - id: "@hero"
    type: image
  - id: "@bgm"
    type: audio
  - id: "@style:night"
    type: image
---

@hero 英雄角色特写

### image
[英雄设计稿](#hero)
[风格参考](#style:night)

### audio
[背景音乐](#bgm)
```

- **`### <type>`** 子标题对齐 api_config inputs key
- **`[标题](#refid)`** 标准语法，`#refid` 指向资产 id
- **`@id:variant`** 延续现有 variant 语法
- **简写 `@id`** 类型在 review 时确认后填入 refs

---

## 测试

```
Test Suites: 22 passed
Tests:       166 passed (was 151)
TypeScript:  strict mode build clean
```

新增测试：
- `RefBinder.test.ts` — 8 个用例覆盖 parseRefs、parseTypedSections、resolveToInputs
- `compilerUtils.test.ts` — 替换 resolveNodeMappingValue 测试为 InputEvaluator 测试（+3 用例）

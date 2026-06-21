# OPSV `@` 引用语法指南 (Refs Guide)

> 适用于 Multi-Ref Pack 所有技能

---

## 1. 引用类型

| 语法 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `@id` | 外部资产引用 | 指向另一个文档或资产 | `@LuRan`, `@Temple-Day` |
| `@id:variant` | 变体引用 | 指定资产的特定 Approved 版本 | `@LuRan:LuRan-001`, `@Temple-Day:wide` |
| `@:key` | 内部设计引用 | 指向同文档内的 Design References | `@:angle_side` |
| `@FRAME:shotId_first/last` | 帧引用 | 指向上游产出的首帧/尾帧 | `@FRAME:S01-Shot01_last` |

## 2. 使用场景

### 2.1 frontmatter `refs` 字段

`refs` 的 key（`image` / `video`）决定资产以什么媒体格式上传到服务端——不同 API 的上传协议不同，图片走图片通道，视频走视频通道。

分镜草图是图像产物（3×3 网格 png），不是视频，所以用 `refs.image`。

```yaml
refs:
  image:
    "@LuRan":                      # 角色定稿图（png）
      - <path/to/LuRan.png>
    "@Temple-Day":                 # 场景定稿图（png）
      - <path/to/Temple-Day.png>
    "@storyboard-S01-Shot01":      # 分镜草图（3×3 网格 png）
      - <path/to/storyboard.png>
  video:
    "@shot-S01-Shot01":            # 视频片段（mp4）——只有视频生产阶段产物
      - <path/to/shot.mp4>
```

> **结构**：refs 是双层字典（外层 input_type，内层 `@id`，值是路径数组）。**不要用数组形式 `- "@id"`**，编译器会拒绝（报 `must be an object mapping`）。

### 2.2 prompt 中的 `@` 引用

prompt 用中文书写即可——管线中所有模型都支持中文。

```markdown
prompt: >
  广角镜头，清晨阳光洒进 @Temple-Day 的入口，
  @LuRan 持剑站立，神情坚毅...
```

编译时 OPSV 自动将 `@id` 替换为实际资产路径。

### 2.3 变体引用

同一资产可以有多张审批通过的图片（如不同角度、不同光照）。`opsv review` 审批时自动将图片写入源文档的 `## Approved References` 区域，variant 名即输出文件名（去扩展名）：

```markdown
<!-- LuRan.md 的 Approved References -->
## Approved References

![LuRan-001](../opsv-queue/videospec_circle1/provider/LuRan-001.png)
![LuRan-002](../opsv-queue/videospec_circle1/provider/LuRan-002.png)
```

其他文档通过 `@assetId:variant名` 引用具体变体：

```yaml
refs:
  image:
    "@LuRan:LuRan-001":        # 匹配 Approved References 中 ![LuRan-001](path)
      - <path/to/LuRan-001.png>
    "@LuRan:LuRan-002":        # 匹配 ![LuRan-002](path)
      - <path/to/LuRan-002.png>
```

不指定变体时（`@LuRan`），取 `## Approved References` 中第一个条目。

## 3. 规则

1. **`@id` 与文件名无关** — `@LuRan` 在 prompt 中引用，与文件名 `LuRan.md` 无需关系
2. **`refs` 必须声明** — prompt 中写了 `@LuRan`，`refs.image` 里必须有 `@LuRan`
3. **双向存在** — 被引用的文档必须存在且 `status: approved`，否则 validate 报死链
4. **不支持嵌套引用** — 不能引用一个引用了别的文档的文档

## 4. 验证

prompt 中用了 `@` 但 `refs` 没写是常见遗漏。不要手动检查——用命令：

```bash
opsv refs check
```

该命令扫描全部文档，报告所有未声明引用的 `@id` 和死链，Agent 按报错修复即可。

## 5. 常见错误

| 错误用法 | 正确用法 | 原因 |
|---------|---------|------|
| `@Character:LuRan` | `@LuRan` | 直接 `@id`，不需要前缀 |
| `@LuRan.md` | `@LuRan` | `@` 后是 id 不是文件名 |
| prompt 用 `@LuRan` 但 refs 没写 | refs.image 中补充 `@LuRan` | `opsv refs check` 会报 |
| `@storyboard` 指向分镜文档 | `@storyboard-S01-Shot01` | 必须带 shot_id |
| 文件名含 `@` 前缀 | 文件名不含 `@` | `@` 只在 prompt/refs 中使用 |
| prompt 用英文书写 | `prompt:` 用中文 | 管线模型都支持中文 |

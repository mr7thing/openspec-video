# OpsV 0.2 测试指南与测试用例 (以 `C:\Gemini\wite4` 项目为例)

本指南旨在验证 OpsV 0.2 版本中全新升级的 `@` 元素体系（OPSV-ASSET-0.2 规范）以及核心底层 Agent 与 CLI 的职能分离架构（AssetCompiler）。

## 测试目标
1. **Agent 语义解析能力**：验证 `opsv-asset-compiler` 技能是否能准确忽略图片的物理路径，单纯依据 `.md` 的文本内容（`has_image: true/false` 的不同规则）将其融合进一条逻辑连贯的 JSON `PROMPT_INTENT`。
2. **CLI 组装与图像标记（Sequential Indexing）**：验证 `AssetCompiler.ts` 是否能从本地准确载入图片，并以数组写入 `attachments`，最后在生成字符串的末尾打上正确的 `[image1]`, `[image2]` 标签。
3. **隔离机制**：确认最终交给 `jobs.json` 的文本没有夹带杂乱的 Markdown 路径。

---

## 前置环境准备

进入你的 `C:\Gemini\wite4` 项目。请确保你的工程具备以下符合 `OPSV-ASSET-0.2.md` 规范的测试文件结构。

### 1. 准备实体资产 (Assets)

在 `C:\Gemini\wite4\videospec\elements` 中创建/修改以下两个文件用于测试。

#### Case A: 含有参考图的实体 (`has_image: true`)
创建 `human_char.md`：
```yaml
---
name: "@role_human"
type: "character"
has_image: true
---
# Subject Identity
白发少年，穿着破旧的灰色风衣，面容疲惫。

# Physical Anchor
![Human_Ref](./human.png)
```
*(注：确保同级目录下存在一张名为 `human.png` 的任意测试图片)*

#### Case B: 含有参考图的道具 (`has_image: true`)
创建 `kite_char.md`：
```yaml
---
name: "@prop_kite"
type: "prop"
has_image: true
---
# Subject Identity
一只破损的发光纸风筝。

# Physical Anchor
![Kite_Ref](./kite.png)
```
*(注：同样确保存在 `kite.png`)*

#### Case C: 纯文本场景 (`has_image: false`)
在 `C:\Gemini\wite4\videospec\scenes` 创建 `wasteland.md`：
```yaml
---
name: "@scene_wasteland"
type: "scene"
has_image: false
---
# Scene Description
一片荒芜的末日废土，天空呈现诡异的紫红色，地面满是龟裂的沟壑与残骸，狂风卷起沙尘，长镜头远景，电影光照，极其苍凉的氛围。
```

---

### 2. 准备测试剧本 (Shot)

在 `C:\Gemini\wite4\videospec\shots` 下新建一个单镜头测试文件 `test_shot_01.md`：

```markdown
**Shot 1**: [外景 - 废墟]
在 @scene_wasteland 的恶劣环境中，@role_human 艰难地向前攀爬，他的手中紧紧抓着 @prop_kite。
```

---

## 执行测试流程

### 第一步：启动编译构建
打开 PowerShell，并回到 `OpenSpec-Video` 主目录，确保核心编译器已经包含最新代码并完成编译：
```powershell
cd C:\Gemini\OpenSpec-Video
npm run build
```

### 第二步：利用 CLI 生成此镜头的 Job
跳转到 `wite4` 工程目录，运行 OpsV 的 `generate` 命令进行资产编译和测试：
```powershell
cd C:\Gemini\wite4
opsv generate videospec/shots/test_shot_01.md
```

### 第三步：验证 Artifacts 输出

如果系统架构完美运行，编译器会在 `C:\Gemini\wite4\queue\jobs.json` 以及对应的 `artifacts` 目录中生成结果。

请打开 `C:\Gemini\wite4\queue\jobs.json`。找到对应 Shot 1 的 payload 块。

#### ✅ 预期结果断言：

1. **`payload.prompt` 的尾部必须含有：**
   `参考图：[image1] [image2]`。
   *(因为脚本中使用了两个 `has_image: true` 的资产，此时 Agent 和 CLI 完美联手注入了两个图片锚点。而且绝不可能包含原图的物理路径文本。)*

2. **`payload.prompt` 的正文必须是高度语义融合的片段：**
   例如：`一片荒芜的末日废土，天空呈现诡异的紫红色... 白发少年，穿着破旧的灰色风衣... 艰难地向前攀爬，手中紧紧抓着一只破损的发光纸风筝。`
   *(Agent 的 `opsv-asset-compiler` 技能成功发挥作用，未提及任何图片和 @ 符号，也没有使用原先老版繁杂的无用文本)。*

3. **`attachments` 数组：**
   该数组第一项应为 `C:\Gemini\wite4\videospec\elements\human.png` 的绝对/相对路径。
   第二项应为 `C:\Gemini\wite4\videospec\elements\kite.png` 的绝对/相对路径。
   *(并且数组项目的先后顺序必定对应着 Prompt 中的 `image1` 和 `image2`)*。

如果没有出现不符合预期的 Markdown 图片标记遗留，且数组与后缀 `[image1]` 严丝合缝对齐，则证明本代 0.2 `AssetCompiler` 脑手分离架构测试**完全通过**！

# FOR_Uncle7.md — OpsV 智慧传承文档
*从 0.2 到 0.3 的架构演化笔记，写给未来的柒叔*

## 1. 这个项目到底在干什么？

OpsV 是一个"用 Markdown 拍电影"的自动化框架。你用 `.md` 文件描述角色、场景和分镜，CLI 编译器把它们翻译成机器能执行的 JSON 任务队列，最终调用 AI 生图/生视频的 API 闭环出片。

核心信仰：**Spec as Guide, Asset First, 如无必要勿增实体。**

## 2. 代码库地图

```
videospec/
├── elements/    ← 角色、道具的独立设定文档（每人一 .md）
├── scenes/      ← 场景的独立设定文档
├── stories/     ← 故事大纲
├── shots/
│   ├── Script.md    ← 导演的"画册"：静态分镜 + 图片审阅
│   └── Shotlist.md  ← 机器的"数据线"：YAML 动态执行单
├── project.md   ← 全局世界观 & 风格配置

src/
├── core/        ← 解析器（SpecParser, AssetManager, ShotManager）
├── automation/  ← 编译器
│   ├── JobGenerator.ts     ← 静态图生成队列
│   └── AnimateGenerator.ts ← 视频生成队列
├── executor/    ← 0.3 新增：API 执行层
│   ├── VideoModelDispatcher.ts ← 多模型调度器 + 依赖图谱
│   ├── FrameExtractor.ts       ← FFmpeg 尾帧截取
│   └── providers/
│       └── SiliconFlowProvider.ts ← 硅基流动 API
└── cli.ts       ← 命令行入口
```

## 3. 架构演化：三个纪元

### 纪元 I：0.2.x — "编剧时代"
我们发明了 `@实体` 语法——在分镜里写 `@role_K`，编译器自动抓取角色的外貌描述和参考图拼成完整提示词。这解决了"AI 生图时角色前后不一致"的核心痛点。

**踩过的坑**：
- 正则解析 Markdown 是噩梦。0.2 中期全面改用 YAML frontmatter，编译器只读结构化数据。
- `has_image` 标志位是天才设计——角色没参考图时输出详细描述，有参考图后切换为简略描述以防"特征污染"。

### 纪元 II：0.3.0 — "执行时代"
管线从"产出提示词"进化到"直接出视频"。核心推出：
- **多模型调度器** (`VideoModelDispatcher`)：通过 `api_config.yaml` 声明各模型的能力边界（是否支持尾帧等），运行时自动裁剪参数。
- **SiliconFlow 集成**：完整的 submit → 轮询 → 下载闭环。
- **绝对路径输出**：编译器强制将所有图片路径展开为操作系统物理路径，彻底消灭相对路径导致的死链。

### 纪元 III：0.3.1 — "因果时代"
引入了"关键帧塌缩协议"——解决长镜头的画面衔接：
- **`@FRAME:shot_1_last` 延迟指针**：前一个视频的真实尾帧自动成为下一个视频的首帧。
- **`target_last_prompt` 靶向补帧**：导演需要精美尾帧时，系统自动衍生图像生成任务。
- **`FrameExtractor`**：FFmpeg 微型组件，截取视频最后一帧。
- **`dispatchAll`**：调度器内置依赖图谱，按因果序列执行任务。

### 纪元 IV：0.3.2 — "审阅时代" (已上线)
核心解决"导演怎么看图、怎么批注"：
- **Draft 延迟绑定**：生成的图统一命名 `shot_X_draft_N`，不预设首帧/尾帧角色。导演审阅后由 Animator 在 YAML 中绑定指针。
- **Script.md 画廊化**：每个 Shot 展示多帧候选画廊（首帧/中间帧/尾帧/参考素材）。
- **@ 跳转链接**：`@role_K` 自动展开为可点击的 Markdown 链接，跳转到角色设定文档。
- **review 命令升级**：默认只看最新批次、支持路径指定与 `--all` 全量回顾。

## 4. 写给未来的忠告

1. **永远先改协议文档（`docs/schema/`），再改代码。** 协议即宪法，代码只是执行者。
2. **Agent Skill 的 Prompt 比代码更重要。** 一个写错了的 Skill 会让 Agent 产生系统性幻觉，比 Bug 更难排查。
3. **文件命名是 API。** 一旦确定了 `shot_X_draft_N` 的范式，下游所有的编译器、review 工具、Agent 都会依赖它。改命名 = 改 API = 全链路回归测试。
4. **YAML 在上，Markdown 在下。** 机器读上半部，人类读下半部。永远不要试图让机器去解析 Markdown body。

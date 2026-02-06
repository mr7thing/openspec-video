# **基于 Fission-AI OpenSpec 与 Google Antigravity 的智能视频生成架构白皮书**

## **1\. 绪论：从“氛围编码”到“规范驱动”的媒体生产范式转移**

在生成式人工智能（AIGC）重塑数字内容生产的浪潮中，视频生成领域正经历着一场从手工作坊向工业化流水线跨越的深刻变革。早期的 AI 视频创作往往被戏称为“氛围编码”（Vibe Coding）或“氛围提示”（Vibe Prompting），创作者依赖直觉和反复试错，通过零散的提示词（Prompt）在各类模型之间游走，试图捕捉稍纵即逝的创意灵感 1。然而，这种非结构化的工作流在面对复杂的叙事需求、角色一致性要求以及长视频制作时，显露出效率低下、可复现性差以及协作困难等致命缺陷。

随着 Google 推出的 Antigravity 集成开发环境（IDE）引入了“代理优先”（Agent-First）的架构理念，软件工程中的严谨规范开始向媒体生成领域渗透 3。特别是结合 Fission AI 提出的 OpenSpec（规范驱动开发）标准，我们现在有机会构建一套标准化的视频生成文档规范——OpenSpec-Video 5。这套规范不仅仅是文档，更是人类意图与自主 AI 代理（Agent）之间的契约。通过 Antigravity 的代理管理器（Agent Manager）和内置浏览器自动化技术，AI 代理能够像人类一样操作 Gemini 服务的图形用户界面（Nano Banana Pro 和 Veo 3.1），实现从剧本分析到成片输出的全链路自动化 7。

本报告将详尽阐述这一架构的理论基础、实施细节及操作规范，旨在为专业内容创作者提供一套可执行、可验证且具备高度扩展性的智能视频生产解决方案。

## ---

**2\. 基础设施架构：Google Antigravity 与代理生态系统**

要理解 OpenSpec-Video 的运作机制，首先必须深入剖析其运行的底层环境——Google Antigravity。这并非传统的代码编辑器，而是一个多代理编排平台，其核心设计理念围绕着“信任、自主、反馈与自我进化”四大支柱展开 10。

### **2.1 代理优先（Agent-First）的交互模型**

在传统的开发或创作环境中，AI 通常以“助手”（Copilot）的形式存在，被动等待用户的指令并提供补全建议。而在 Antigravity 中，AI 代理被提升为“行动者”（Actor）。它不仅拥有读取和写入文件的权限，更具备通过终端执行命令、通过浏览器访问互联网以及跨工作区协调任务的能力 3。

对于视频生成任务而言，这意味着用户不再需要手动在 ChatGPT 中生成分镜描述，然后复制到 Midjourney 生成图像，再下载上传至 Runway 生成视频。Antigravity 的代理管理器允许用户定义一个高阶任务（例如：“制作一段赛博朋克风格的 30 秒短片”），随后系统会指派不同的子代理并行处理剧本撰写、美术资产生成和视频渲染 11。

### **2.2 双视图架构与任务编排**

Antigravity 提供了两种主要视图，分别对应创作过程中的不同思维模式：

| 视图名称 | 功能定义 | 在视频生成中的应用 | 技术支撑 |
| :---- | :---- | :---- | :---- |
| **编辑器视图 (Editor View)** | 提供传统的代码和文本编辑界面，支持内联 AI 指令。 | 用于精细调整 script.md（剧本）和 prompt.yaml（提示词配置），进行逐字逐句的推敲。 | Gemini 3 Pro 上下文感知 3 |
| **管理者视图 (Manager View)** | “任务控制中心”，用于监控和编排多代理的异步工作流。 | 宏观把控项目进度，查看“角色设计代理”和“场景渲染代理”的实时状态与产出物。 | 异步任务调度与状态机 7 |

这种分离确保了创作者既能深入细节进行微调，又能抽身出来管理复杂的生产流水线。

### **2.3 基于“制品”（Artifacts）的信任机制**

在自动化流程中，最大的挑战在于如何建立用户对 AI 行为的信任。Antigravity 通过生成“制品”（Artifacts）来解决这一问题 10。代理不会在黑盒中默默工作，而是会生成可验证的交付物：

* **实施计划（Implementation Plan）**：在开始生成视频前，代理会先输出一份详细的拍摄计划书，列出所有分镜、运镜方式和时长，供用户审批 7。  
* **任务清单（Task List）**：动态更新的进度表，用户可以清晰看到“场景 1 已完成”、“角色一致性检查进行中”等状态 10。  
* **浏览器录屏与截图**：当代理通过 Browser Subagent 操作 Nano Banana Pro 或 Veo 3.1 时，它会录制操作过程或截取关键步骤的屏幕，证明其确实按照规范执行了参数设置 12。

## ---

**3\. OpenSpec-Video 标准：视频生成的结构化契约**

Fission AI 的 OpenSpec 框架原本是为了解决软件开发中的需求漂移和文档同步问题，通过将自然语言需求转化为结构化的 Markdown 和 YAML 文件，确立了“规范即代码”（Spec as Code）的原则 5。我们将这一原则移植到视频生产中，定义了 OpenSpec-Video 标准。

### **3.1 目录结构规范**

一个标准的 OpenSpec-Video 项目应遵循严格的目录层级，以确保代理能够准确检索上下文信息。

my-video-project/

├──.antigravity/

│ ├── rules/ \# 定义代理行为的全局规则

│ │ ├── style-guide.md \# 视觉风格指南（如：黑色电影、赛博朋克）

│ │ └── governance.md \# 审核与安全规则

│ └── workflows/ \# 预定义的工作流脚本

│ ├── create-character.yaml

│ └── render-scene.yaml

├── openspec/

│ ├── project.md \# 项目核心定义（世界观、核心冲突、技术参数）

│ ├── assets/ \# 资产定义目录

│ │ ├── characters/ \# 角色档案 (YAML/Markdown)

│ │ └── locations/ \# 场景档案

│ ├── changes/ \# 变更提案目录

│ │ └── scene-01-chase/ \# 针对特定场景的制作提案

│ │ ├── proposal.md \# 该场景的制作意图与摘要

│ │ ├── storyboard.md \# 分镜描述

│ │ └── tasks.md \# 执行任务清单

│ └── design.md \# 视觉与听觉设计规范

├── artifacts/ \# 代理生成的产出物（图片、视频、日志）

└── scripts/ \# 具体的剧本文件

### **3.2 核心规范文件定义**

#### **3.2.1 project.md：项目的灵魂**

这是 AI 代理理解整个项目的基石。它不仅包含剧情大纲，还必须定义技术约束和艺术基调 14。

**示例内容片段：**

# **Project Context**

## **Core Narrative**

一个关于流浪宇航员在废弃空间站寻找植物种子的故事，探讨孤独与希望。

## **Visual Style**

* **Palette**: 高对比度，冷色调为主，暖色调仅用于植物和生命体。  
* **Aspect Ratio**: 2.39:1 (Cinematic Anamorphic).  
* **Resolution**: 4K UHD.

## **Technical Constraints**

* Character Consistency: 必须使用 Nano Banana Pro 的 Reference Sheet 功能。  
* Motion: 使用 Veo 3.1 的 Trajectory Control 确保运镜平滑。

#### **3.2.2 proposal.md：变更的原子单位**

在视频制作中，每一次修改（如“修改主角发型”或“增加一场雨戏”）都应被视为一个 Proposal 16。这不仅记录了“做什么”，还记录了“为什么做”（Motivation）和“预期影响”（Impact）。这种机制允许团队回溯创意决策的演变过程，避免了创意资产管理的混乱 15。

## ---

**4\. 第一阶段：认知叙事分析与剧本工程**

在 OpenSpec-Video 流程中，创作的第一步并非直接生成画面，而是利用 Gemini 3 Pro 强大的推理能力对故事进行深度结构化分析 3。

### **4.1 故事解构与情感映射**

Antigravity 处于“规划模式”（Planning Mode）时，代理会读取用户提供的原始文本（小说、新闻或草稿），并根据 project.md 中的定义将其拆解为视觉单元 7。这一过程涉及复杂的认知推理：

1. **叙事节拍提取（Beat Extraction）**：将连续的文本流打散为独立的叙事节拍，每个节拍对应一个潜在的镜头。  
2. **情感色彩标记**：分析每个场景的情感基调（如：焦虑、宁静、爆发），并将其映射为具体的视觉参数（如：光影硬度、色彩饱和度）。  
3. **视觉隐喻转化**：Gemini 3 Pro 能够理解抽象概念并转化为具象描述。例如，将“内心的极度孤独”转化为“广角镜头下的空旷走廊，人物处于画面边缘，冷蓝色调” 17。

### **4.2 剧本标准化（Script Normalization）**

分析完成后，代理会自动生成标准格式的剧本。不同于人类阅读的剧本，OpenSpec 剧本包含大量供下游 AI 模型读取的元数据。

| 剧本元素 | 传统剧本描述 | OpenSpec 机器可读描述 | 目的 |
| :---- | :---- | :---- | :---- |
| **场景头** | INT. CAFE \- DAY | SCENE\_HEADER: { LOC: "Cafe\_Futuristic", LIGHT: "Natural\_Diffused", TIME: "14:00" } | 指导 Nano Banana Pro 的环境渲染 17。 |
| **动作描述** | 他拿起杯子喝了一口。 | ACTION: { SUBJ: "Character\_A", ACT: "Drink", OBJ: "Cup\_Ceramic", DURATION: "3s" } | 指导 Veo 3.1 的动作生成 9。 |
| **运镜指令** | 镜头缓慢推进。 | CAMERA: { TYPE: "Dolly\_In", SPEED: "Slow", FOCUS: "Subject\_Face" } | 触发 Veo 3.1 的轨迹控制 18。 |

## ---

**5\. 第二阶段：角色与场景资产生成的推理引擎**

在这一阶段，我们利用 Google 的 Nano Banana Pro 模型来生成静态资产。该模型被称为“推理图像引擎”（Reasoning Image Engine），因为它不只是进行简单的扩散生成，而是先理解场景逻辑再进行渲染 8。

### **5.1 角色一致性工程（Character Consistency Engineering）**

AI 视频最大的痛点在于角色在不同镜头间的长相变化。Antigravity 代理通过以下流程解决这一问题：

1. **建立角色档案**：在 openspec/assets/characters/ 下创建角色的 YAML 定义，详尽描述五官、发型、服装细节。  
2. **生成基准参考图（Reference Sheet）**：  
   * 代理调用 Browser Subagent 打开 Nano Banana Pro 界面。  
   * 输入提示词生成角色的“三视图”（正面、侧面、45度角）19。  
   * 利用 Nano Banana Pro 的“多图融合”（Multi-image fusion）功能，锁定角色的面部特征 8。  
3. **资产验证**：代理会自动检查生成的参考图是否符合 project.md 中的风格要求，并将其保存为标准参考资产，供后续 Veo 3.1 使用。

### **5.2 物理级光照与环境构建**

Nano Banana Pro 的原生 4K 分辨率和物理准确的光照渲染能力，使其成为生成场景底图的理想选择 8。在构建场景时，代理会特别关注“文本渲染”（Text Rendering）能力。如果场景是赛博朋克街道，代理会明确指示模型生成包含特定文字（如“BAR”、“HOTEL”）的霓虹灯牌，利用 Nano Banana Pro 的高精度文本渲染特性，避免 AI 生成乱码文字 8。

**提示词策略示例：** 代理会自动构建如下结构的 Prompt： "Setting: Futuristic Tokyo street. Text Rendering: 'CYBER CAFE' in neon blue katakana on the left sign. Lighting: Wet pavement reflections, volumetric fog. Style: Photorealistic 8k." 21

## ---

**6\. 第三阶段：视觉导向与分镜绘制（The "Nick Mice" Workflow）**

为了让视频模型精准执行导演意图，OpenSpec-Video 采纳了所谓的“Nick Mice 工作流”，这是一种利用静态图像标注来指导动态生成的先进技术 6。

### **6.1 智能标注与意图可视化**

分镜不仅仅是静态预览，更是给 Veo 3.1 的操作指令。Antigravity 代理执行以下自动化步骤：

1. **生成初始帧**：基于剧本生成场景的第一帧画面。  
2. **视觉推理与标注**：代理利用 Gemini 的多模态能力，在图像上绘制“草图标注”（Sketch Annotations）。例如，如果需要镜头向上摇（Crane Up），代理会在画面上绘制向上的箭头，并标注“Camera Move: Crane Up” 6。  
3. **合成指示图**：将这些标注与原图合成，形成一张带有明确视觉指令的“导向图”。这张图将作为 Veo 3.1 的输入，告诉视频模型“不仅要动，而且要按照我画的轨迹动” 6。

这一步骤巧妙利用了 Gemini 模型“看懂图上画了什么”的能力，将自然语言难以精确描述的空间运动转化为直观的视觉语言。

## ---

**7\. 第四阶段：Veo 3.1 自动化视频合成**

视频合成是整个流程中计算量最大、成本最高的环节。Veo 3.1 作为 Google 最先进的视频生成模型，提供了“素材转视频”（Ingredients to Video）和“帧转视频”（Frames to Video）等关键功能 24。

### **7.1 浏览器自动化操作流程**

Antigravity 的 Browser Subagent 在此发挥核心作用。由于 Veo 3.1 的高级功能通常首先在 Web UI (如 Google AI Studio 或 Higgsfield) 中提供，代理需要模拟人类操作 7。

1. **会话初始化**：  
   * 代理启动内置的 Chromium 浏览器实例，导航至 Veo 3.1 的控制台页面。  
   * 通过 project.md 中的凭证自动登录。  
2. **参数配置**：  
   * 代理读取 design.md 中的分辨率（如 4K）和画幅（如 16:9）设置 26。  
   * **选择模型模式**：根据需求选择“Performance”（速度优先）或“Cinematic”（质量优先）28。  
3. **上传资产（Ingredients Injection）**：  
   * 代理通过 DOM 操作点击“Upload Reference Image”按钮。  
   * 从本地 openspec/assets/ 目录中选择对应的角色参考图和环境参考图上传 24。这确保了视频中的人物与之前设计的角色完全一致。  
4. **轨迹控制与生成**：  
   * 上传带有标注的“导向图”作为起始帧。  
   * 输入提示词（Prompt），并开启“Native Audio”选项以生成同步音效 9。  
   * 点击生成，并监控进度条。

### **7.2 视频延伸与长镜头构建**

Veo 3.1 支持生成 8 秒的基础片段，并可通过“延伸”（Extend）功能延长至 148 秒 26。代理通过递归逻辑处理长镜头：

* **步骤 A**：生成第 0-8 秒片段。  
* **步骤 B**：截取第 8 秒的最后一帧作为新的起始帧。  
* **步骤 C**：将新的起始帧上传，输入下一阶段的剧情提示词（Prompt），例如“EXTEND PREVIOUS: 角色转身发现异常” 18。  
* **步骤 D**：重复此过程直到达到所需时长，并在后期自动拼接。

## ---

**8\. 浏览器子代理（Browser Subagent）的深度机制与安全治理**

OpenSpec-Video 的核心创新在于利用 Antigravity 的浏览器子代理来弥合 API 与 UI 之间的鸿沟。

### **8.1 视觉感知与 DOM 交互**

浏览器子代理并非简单的 Selenium 脚本，它运行着一个专门针对 UI 操作优化的模型（如 Gemini 2.5 Pro UI Checkpoint）7。这意味着它不需要预先硬编码 CSS 选择器（Selector）。

* **感知**：代理“看”到网页截图，识别出“生成”按钮的位置，即时按钮的 ID 每次刷新都变化，它也能根据视觉语义（按钮形状、文字标签）准确点击 30。  
* **反馈**：如果网页弹出“服务器繁忙”的错误提示，代理能通过 OCR 识别错误信息，并在 Manager View 中报告异常，甚至自动重试 12。

### **8.2 安全与合规性配置**

为了防止代理在互联网上“暴走”，Antigravity 提供了严格的安全沙箱机制 7。在 .agent/rules/security.md 中，管理员必须配置“允许列表”（Allow List）：

| 配置项 | 说明 | 示例值 |
| :---- | :---- | :---- |
| **Allow Domains** | 限制代理仅能访问特定的生成式 AI 服务域名。 | \['aistudio.google.com', 'higgsfield.ai', 'artlist.io'\] |
| **Budget Cap** | 设定操作频率或 API 调用的预算上限，防止产生天价账单。 | MAX\_DAILY\_GENERATIONS: 50 |
| **Data Privacy** | 禁止代理将包含敏感关键词（如“Internal Confidential”）的文件上传至公网。 | DENY\_UPLOAD\_PATTERN: '\*confidential\*' |

## ---

**9\. 质量保证与迭代反馈循环**

在 Antigravity 的架构中，生成不是终点，而是验证的开始。代理会将生成的所有视频片段下载到 artifacts/videos/ 目录，并生成一份 review.md 报告 4。

### **9.1 用户反馈交互**

用户在 Manager View 中查看生成的视频片段。如果对某个片段不满意（例如：“角色表情太僵硬”），用户可以直接在对应的 Artifact 上留言 10。代理接收到反馈后，会自动：

1. **回滚状态**：丢弃该片段。  
2. **调整参数**：根据反馈修改 Veo 3.1 的“Negative Prompt”（负面提示词），增加如“stiff face, robotic expression”等词汇 27。  
3. **重新执行**：自动触发新一轮的生成任务。

这种“生成-审核-修正”的闭环，使得 AI 视频创作真正具备了工程级的可控性。

## ---

**10\. 结论与展望**

OpenSpec-Video 规范结合 Google Antigravity 的代理能力，标志着 AI 视频生成从业余爱好者的“抽卡”游戏，正式迈向专业化的工业生产阶段。通过标准化的文档驱动（OpenSpec）、智能化的资产推理（Nano Banana Pro）以及自动化的视频合成（Veo 3.1 & Browser Subagent），我们不仅大幅降低了高品质视频的制作门槛，更重要的是建立了一套可追溯、可协作、可扩展的创作体系。

未来，随着 Gemini 模型推理能力的进一步提升和 Browser Subagent 操作精度的增加，我们可以预见由单一导演指挥由数十个 AI 代理组成的“虚拟剧组”，在数小时内完成一部 4K 电影的制作将成为现实。这一变革不仅是对工具的升级，更是对人类创造力边界的极大拓展 1。

---

*(注：本报告基于截至 2026 年初的技术文档与公开预览版功能编写，具体实施细节可能随 Antigravity 版本更新而变化。)*

#### **引用的著作**

1. GitHub Just Launched Spec Kit — But Fission AI's OpenSpec Fights Back\! \- YouTube, 访问时间为 二月 5, 2026， [https://www.youtube.com/watch?v=7UMiGPeC0qc](https://www.youtube.com/watch?v=7UMiGPeC0qc)  
2. I tried Google's new Antigravity IDE so you don't have to (vs Cursor/Windsurf) \- Reddit, 访问时间为 二月 5, 2026， [https://www.reddit.com/r/ChatGPTCoding/comments/1p35bdl/i\_tried\_googles\_new\_antigravity\_ide\_so\_you\_dont/](https://www.reddit.com/r/ChatGPTCoding/comments/1p35bdl/i_tried_googles_new_antigravity_ide_so_you_dont/)  
3. Google Antigravity \- Wikipedia, 访问时间为 二月 5, 2026， [https://en.wikipedia.org/wiki/Google\_Antigravity](https://en.wikipedia.org/wiki/Google_Antigravity)  
4. Build with Google Antigravity, our new agentic development platform, 访问时间为 二月 5, 2026， [https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)  
5. Fission \- GitHub, 访问时间为 二月 5, 2026， [https://github.com/Fission-AI](https://github.com/Fission-AI)  
6. Fission-AI/OpenSpec: Spec-driven development (SDD) for AI coding assistants. \- GitHub, 访问时间为 二月 5, 2026， [https://github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)  
7. Getting Started with Google Antigravity, 访问时间为 二月 5, 2026， [https://codelabs.developers.google.com/getting-started-google-antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)  
8. Nano Banana Pro (Gemini 3 Pro image): 4K AI Image Generator | Higgsfield, 访问时间为 二月 5, 2026， [https://higgsfield.ai/nano-banana-2-intro](https://higgsfield.ai/nano-banana-2-intro)  
9. Generate videos with Veo 3.1 in Gemini API | Google AI for Developers, 访问时间为 二月 5, 2026， [https://ai.google.dev/gemini-api/docs/video](https://ai.google.dev/gemini-api/docs/video)  
10. Introducing Google Antigravity, a New Era in AI-Assisted Software Development, 访问时间为 二月 5, 2026， [https://antigravity.google/blog/introducing-google-antigravity](https://antigravity.google/blog/introducing-google-antigravity)  
11. How to Set Up and Use Google Antigravity \- Codecademy, 访问时间为 二月 5, 2026， [https://www.codecademy.com/article/how-to-set-up-and-use-google-antigravity](https://www.codecademy.com/article/how-to-set-up-and-use-google-antigravity)  
12. Tutorial : Getting Started with Google Antigravity | by Romin Irani \- Medium, 访问时间为 二月 5, 2026， [https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2](https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2)  
13. Google Antigravity Prompts \- GitHub Gist, 访问时间为 二月 5, 2026， [https://gist.github.com/CypherpunkSamurai/f16e384ed1629cc0dd11fea33e444c17](https://gist.github.com/CypherpunkSamurai/f16e384ed1629cc0dd11fea33e444c17)  
14. How to make AI follow your instructions more for free (OpenSpec) \- DEV Community, 访问时间为 二月 5, 2026， [https://dev.to/webdeveloperhyper/how-to-make-ai-follow-your-instructions-more-for-free-openspec-2c85](https://dev.to/webdeveloperhyper/how-to-make-ai-follow-your-instructions-more-for-free-openspec-2c85)  
15. How to generate consistent code using OpenSpec, which makes specification-driven development easy to adopt \- GIGAZINE, 访问时间为 二月 5, 2026， [https://gigazine.net/gsc\_news/en/20251026-openspec/](https://gigazine.net/gsc_news/en/20251026-openspec/)  
16. OpenSpec/docs/getting-started.md at main \- GitHub, 访问时间为 二月 5, 2026， [https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md)  
17. Nano Banana Pro Prompting Guide \+ 75 Prompts \- Imagine.Art, 访问时间为 二月 5, 2026， [https://www.imagine.art/blogs/nano-banana-pro-prompt-guide](https://www.imagine.art/blogs/nano-banana-pro-prompt-guide)  
18. Google Veo 3.1 Video Prompt Guide \- AKOOL, 访问时间为 二月 5, 2026， [https://akool.com/blog-posts/google-veo-3-1-video-prompt-guide](https://akool.com/blog-posts/google-veo-3-1-video-prompt-guide)  
19. Ultimate Nano Banana Pro Guide 2026: How to Use Gemini 3 Image AI \- YouTube, 访问时间为 二月 5, 2026， [https://www.youtube.com/watch?v=ZCw325FiS78](https://www.youtube.com/watch?v=ZCw325FiS78)  
20. Nano Banana Pro: AI image generator by Gemini 3 \- Artlist, 访问时间为 二月 5, 2026， [https://artlist.io/ai/models/nano-banana-pro](https://artlist.io/ai/models/nano-banana-pro)  
21. Nano-Banana Pro: Prompting Guide & Strategies \- DEV Community, 访问时间为 二月 5, 2026， [https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)  
22. Nano Banana Pro is the best AI image generator, with caveats | Max Woolf's Blog, 访问时间为 二月 5, 2026， [https://minimaxir.com/2025/12/nano-banana-pro/](https://minimaxir.com/2025/12/nano-banana-pro/)  
23. 25 Things Nano Banana Pro Does That AI Couldn't Before \- YouTube, 访问时间为 二月 5, 2026， [https://www.youtube.com/watch?v=8\_yeRvhn5r4](https://www.youtube.com/watch?v=8_yeRvhn5r4)  
24. ‘Biggest leap yet’: Elon Musk’s xAI takes on Google with new version of Grok Imagine, here's how, 访问时间为 二月 5, 2026， [https://timesofindia.indiatimes.com/technology/social/biggest-leap-yet-elon-musks-xai-takes-on-google-with-grok-imagine-1-0/articleshow/127866928.cms](https://timesofindia.indiatimes.com/technology/social/biggest-leap-yet-elon-musks-xai-takes-on-google-with-grok-imagine-1-0/articleshow/127866928.cms)  
25. Veo 3.1 : Google's Advanced AI Video Generator \- Higgsfield, 访问时间为 二月 5, 2026， [https://higgsfield.ai/veo3.1](https://higgsfield.ai/veo3.1)  
26. Mastering Veo 3.1 Video Extension API: Complete Guide to Generating 148-Second Long Videos with 7-Second Incremental Extensions, 访问时间为 二月 5, 2026， [https://help.apiyi.com/en/veo-3-1-extend-video-api-guide-en.html](https://help.apiyi.com/en/veo-3-1-extend-video-api-guide-en.html)  
27. Veo 3.1 Fast \- Text to Video AI-model \- ShortGenius, 访问时间为 二月 5, 2026， [https://shortgenius.com/za/models/veo3.1-fast](https://shortgenius.com/za/models/veo3.1-fast)  
28. Veo 3 | Google AI Studio, 访问时间为 二月 5, 2026， [https://aistudio.google.com/models/veo-3](https://aistudio.google.com/models/veo-3)  
29. Veo 3.1 Ingredients to Video: More consistency, creativity and control, 访问时间为 二月 5, 2026， [https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/](https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/)  
30. My First Look and Experience with Google AntiGravity | ABP.IO, 访问时间为 二月 5, 2026， [https://abp.io/community/articles/my-first-look-and-experience-with-google-antigravity-0hr4sjtf](https://abp.io/community/articles/my-first-look-and-experience-with-google-antigravity-0hr4sjtf)  
31. Authoring Google Antigravity Skills, 访问时间为 二月 5, 2026， [https://codelabs.developers.google.com/getting-started-with-antigravity-skills](https://codelabs.developers.google.com/getting-started-with-antigravity-skills)  
32. Honestly, Google Antigravity is a total sleeper hit for R\&D / MLOps \- Reddit, 访问时间为 二月 5, 2026， [https://www.reddit.com/r/google\_antigravity/comments/1qlmemf/honestly\_google\_antigravity\_is\_a\_total\_sleeper/](https://www.reddit.com/r/google_antigravity/comments/1qlmemf/honestly_google_antigravity_is_a_total_sleeper/)
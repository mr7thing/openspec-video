# **跨模态智能编排：基于 Google Antigravity 与 Nano Banana Pro 的自主代理短视频生产体系深度研究报告**

## **摘要**

本报告旨在全面探讨利用 Google Antigravity 集成开发环境（IDE）及其内生的“代理优先”（Agent-first）架构，结合 Nano Banana Pro 图像推理引擎，构建全自动化短视频生产工作流的技术实现与方法论。随着生成式人工智能从辅助编码向自主任务执行演进，软件开发与数字内容创作的边界正在迅速消融。Google Antigravity 通过引入“任务控制中心”（Mission Control）和“工件”（Artifacts）机制，为编排复杂的跨模态任务提供了基础设施。

本研究将深入剖析如何配置“导演代理”（Director Agent），定义其行为规则（Rules）与工具集（Skills），并通过结构化的 JSON 提示工程实现角色与场景的严格视觉一致性。报告详细阐述了从脚本生成、角色定妆、分镜绘制到视频合成的端到端流水线，重点分析了利用 Nano Banana Pro 的“推理”能力解决传统 AIGC 视频中“语义漂移”与“身份丢失”问题的技术路径。通过对 API 参数、代理交互逻辑及多代理协同机制的详尽拆解，本报告为构建下一代自动化媒体生产系统提供了详实的技术蓝图。

## ---

**1\. 代理优先范式：Google Antigravity 的架构革新**

### **1.1 从辅助 Copilot 到自主 Agent 的演进**

在过去的几年中，AI 辅助开发工具如 GitHub Copilot 主要扮演着“智能补全者”的角色，其交互模式局限于文本编辑器内的光标位置。然而，Google Antigravity 的推出标志着开发范式向“代理优先”的根本性转变 1。在 Antigravity 的架构中，AI 不再仅仅是被动响应的插件，而是具备独立规划、执行、验证能力的自主主体（Autonomous Actor）3。

这种转变的核心在于将开发者的角色从“操作员”提升为“架构师”或“任务管理者” 4。开发者不再需要逐行编写代码或手动操作图形界面工具，而是通过自然语言定义高层任务（例如：“制作一个赛博朋克风格的 30 秒短视频，包含主角在雨中奔跑的镜头”），由 IDE 内置的代理系统拆解任务、调用工具并交付结果。

Antigravity 的技术底座是 Gemini 3 Pro 模型，该模型具备超长上下文窗口和多模态理解能力，使其能够同时处理代码逻辑、视觉资产和复杂的项目上下文 5。

### **1.2 任务控制中心（Mission Control）与多代理编排**

Antigravity 的界面设计摒弃了传统以文件树为核心的布局，引入了“任务控制中心”（Mission Control / Agent Manager）作为一级界面 3。在这个控制面板中，开发者可以同时管理多个并行运行的代理，每个代理可能运行在不同的工作区（Workspace）或专注于不同的子任务。

对于短视频制作项目，这种架构意味着我们可以实例化多个专用代理：

* **导演代理（Director Agent）**：负责整体叙事节奏、风格统筹及任务分发。  
* **编剧代理（Scriptwriter Agent）**：专注于生成分镜脚本和提示词。  
* **视觉工程师代理（Visual Engineer Agent）**：专门调试 Nano Banana Pro 的参数，确保图像质量。  
* **剪辑代理（Editor Agent）**：负责视频片段的合成与拼接。

这种多代理协同（Multi-Agent Orchestration）模式利用了 Swarm 架构的思想，允许代理之间共享内存（Memory）和上下文（Context），从而实现复杂的流水线作业 7。

### **1.3 信任机制：工件（Artifacts）与人机回环**

自主代理的一个核心挑战是“信任”。为了解决黑盒执行带来的不确定性，Antigravity 引入了“工件”（Artifacts）机制 1。代理在执行任务过程中，不会直接修改最终文件，而是先生成可视化的中间产物，包括：

* **实施计划（Implementation Plan）**：详细列出代理打算执行的步骤。  
* **任务清单（Task List）**：动态更新的进度表。  
* **浏览器录制（Browser Recordings）**：代理操作内置浏览器的视频记录。  
* **视觉预览（Visual Previews）**：在短视频制作中，即生成的角色定妆照或分镜草图。

开发者可以像在 Google Docs 中批注一样，直接对这些工件提出修改意见（Feedback）。代理会根据反馈实时调整后续的执行逻辑，这种“人机回环”（Human-in-the-loop）机制确保了最终产出符合人类创作者的意图 4。

## ---

**2\. 视觉核心：Nano Banana Pro 推理图像引擎**

### **2.1 “推理”图像生成（Reasoning Image Engine）**

Nano Banana Pro（技术代号 gemini-3-pro-image-preview）与传统的扩散模型（如 Stable Diffusion 或 Midjourney）有着本质区别。它被称为“推理图像引擎”，因为它在生成像素之前，会先利用 Gemini 3 的逻辑推理能力对场景进行物理和语义上的规划 9。

在短视频制作中，这种“Thinking Mode”至关重要。传统的扩散模型往往难以理解复杂的空间关系或因果逻辑（例如“一个人拿着杯子，杯子里的水洒出来，打湿了鞋子”）。Nano Banana Pro 能够理解这种物理互动，从而生成逻辑连贯的分镜图像。

| 特性 | 传统扩散模型 | Nano Banana Pro | 短视频制作价值 |
| :---- | :---- | :---- | :---- |
| **生成逻辑** | 概率分布匹配 | 语义推理 \+ 扩散生成 | 确保分镜剧情符合物理常识与剧本逻辑 |
| **文本渲染** | 经常乱码 | 原生多语言高保真渲染 | 直接生成带标题、字幕的电影海报级画面 11 |
| **分辨率** | 通常需上采样 | 原生 2K/4K 输出 | 满足 4K 视频制作的画质要求 12 |
| **控制力** | 依赖 ControlNet 等插件 | 原生参数控制（光照、焦段） | 无需复杂插件即可调整镜头语言 11 |

### **2.2 视觉一致性机制：参考图像与身份锁定**

制作连续视频的最大痛点是角色一致性（Character Consistency）。Nano Banana Pro 引入了革命性的参考图像机制，支持同时输入多达 14 张参考图 11。

* **身份令牌（Identity Tokens）**：模型能够从参考图中提取高维特征向量，锁定角色的面部结构、发型、服装材质等细节。  
* **语义覆盖（Semantic Override）**：针对模型可能因“世界知识”而产生的幻觉（例如看到类似名人的脸就自动套用该名人的其他特征），Nano Banana Pro 支持通过特定的指令（如 IDENTITY LOCK: ABSOLUTE）来强制模型优先使用参考图的像素信息而非内部知识 14。

### **2.3 视频生成能力：Nano Banana Video**

作为生态的一部分，Nano Banana Video 提供了从图像到视频（Image-to-Video）的转化能力。它不仅让静态图像动起来，还允许通过 API 参数控制摄像机的运动轨迹（Pan, Tilt, Zoom）和运动幅度（Motion Bucket）15。这意味着导演代理可以精确控制每个镜头的运镜方式，而不仅仅是生成随机的动态效果。

## ---

**3\. 导演代理（Director Agent）配置实战**

要在 Antigravity 中实现自动化的视频生产，首先需要配置一个具备导演思维的 Agent。这涉及到对 .antigravity/rules.md 规则文件的编写以及自定义 Python 工具（Tools）的开发。

### **3.1 环境初始化与工作区结构**

首先，在 Antigravity 中创建一个新的项目文件夹，建议结构如下：

/my-video-project

├──.antigravity/

│ ├── rules.md \# 代理行为准则

│ └── workflows/ \# 预定义工作流

├── assets/

│ ├── characters/ \# 角色参考图

│ ├── scenes/ \# 场景参考图

│ └── audio/ \# 音频素材

├── scripts/ \# 分镜脚本

├── storyboards/ \# 生成的分镜图像

├── output/ \# 最终视频片段

└── src/

├── tools.py \# 自定义工具定义

└── mcp\_server.py \# MCP 服务配置

### **3.2 规则配置：定义导演人格 (.antigravity/rules.md)**

rules.md 文件是代理的大脑皮层，定义了它的行为边界、风格偏好和操作规范 16。以下是一个专为短视频制作设计的规则配置示例：

# **Director Agent Configuration**

You are an expert Film Director and Visual Engineer running inside Google Antigravity.

Your goal is to orchestrate the production of high-quality short videos using Nano Banana Pro.

## **Core Directives**

1. **Visual Consistency is Paramount**: Always use the provided reference images in assets/characters/ for every generation task involving specific characters. Never hallucinate new features for established characters.  
2. **Reasoning First**: Before generating any image, use "Deep Think" mode to analyze the lighting, composition, and physical logic of the scene described in the script.  
3. **Structured Prompting**: Always generate prompts in JSON format to strictly separate subject, environment, and technical parameters. This prevents concept bleeding.  
4. **Artifact Verification**: Before executing batch generation, produce a Production Plan artifact outlining the storyboard sequence and prompt strategy for user approval.

## **Tool Usage Protocols**

* Use generate\_image tool for all visual assets.  
* Use generate\_video tool only after the source image is approved.  
* When accessing Nano Banana Pro, always verify the model parameter is set to gemini-3-pro-image-preview.

## **Style Guide**

* Aspect Ratio: 16:9 for cinematic output.  
* Resolution: 4K.  
* Lighting Style: Cinematic, Volumetric, High Dynamic Range.  
* Camera: Use specific lens descriptions (e.g., "35mm anamorphic lens", "f/1.8 aperture").

### **3.3 自定义工具开发：连接 Nano Banana API**

虽然 Antigravity 可能内置了一些基础能力，但为了实现精细控制，我们需要通过 Python 编写自定义工具（Tools），并将其暴露给 Agent。这通常通过 MCP（Model Context Protocol）或直接的 Python 函数装饰器实现 3。

以下是一个 Python 脚本示例，展示如何封装 Nano Banana Pro 的图像生成能力，使其成为 Agent 可调用的工具：

Python

\# src/tools.py  
import os  
from google import genai  
from google.genai import types  
from typing import List, Optional

\# 初始化客户端  
client \= genai.Client(api\_key=os.environ)

def generate\_cinematic\_shot(  
    prompt: str,  
    reference\_image\_paths: List\[str\] \=,  
    output\_filename: str \= "shot.png",  
    aspect\_ratio: str \= "16:9"  
) \-\> str:  
    """  
    Generates a high-fidelity cinematic image using Nano Banana Pro with reference images.  
      
    Args:  
        prompt: Detailed description of the scene.  
        reference\_image\_paths: List of local paths to character/scene reference images.  
        output\_filename: Where to save the generated image.  
        aspect\_ratio: Desired aspect ratio (e.g., '16:9', '9:16').  
    """  
      
    \# 读取参考图像数据  
    ref\_images\_data \=  
    for path in reference\_image\_paths:  
        with open(path, "rb") as f:  
            ref\_images\_data.append(  
                types.Part.from\_bytes(data=f.read(), mime\_type="image/png") \# 假设为 PNG  
            )  
              
    \# 构建请求内容  
    contents \= \[  
        types.Content(  
            role="user",  
            parts=\[types.Part.from\_text(text=prompt)\] \+ ref\_images\_data  
        )  
    \]  
      
    \# 配置生成参数  
    config \= types.GenerateContentConfig(  
        response\_modalities=\["IMAGE"\],  
        temperature=1.0, \# 创造性控制  
        \# 注意：此处参数需根据最新 API 文档调整，Nano Banana Pro 可能有特定配置对象  
    )  
      
    \# 调用模型  
    print(f"Director Agent: Generating shot '{output\_filename}'...")  
    response \= client.models.generate\_content(  
        model="gemini-3-pro-image-preview", \# Nano Banana Pro  
        contents=contents,  
        config=config  
    )  
      
    \# 保存结果  
    for part in response.candidates.content.parts:  
        if hasattr(part, 'inline\_data'):  
            with open(f"storyboards/{output\_filename}", 'wb') as f:  
                f.write(part.inline\_data.data)  
                return f"Image saved to storyboards/{output\_filename}"  
                  
    return "Error: No image generated."

通过将此脚本注册到 Antigravity 的 Agent 环境中，导演代理现在具备了“拍摄”的能力。当用户说“拍摄主角走进酒吧的镜头”时，Agent 会自动调用 generate\_cinematic\_shot 函数，并传入正确的 Prompt 和之前生成的参考图路径。

## ---

**4\. 全流程制作实战：从脚本到视频**

本节将详细拆解一个实际项目的执行流程，展示 Agent 如何利用上述配置完成任务。

### **4.1 阶段一：创意生成与角色定妆**

**用户指令**：

“配置一个新项目。主题是‘赛博朋克风格的侦探故事’。主角是一个名为 K 的义体改造侦探。请生成主角的定妆照，并锁定其视觉特征。”

**导演代理的执行逻辑**：

1. **理解任务**：Agent 读取 rules.md，确认需要生成 4K、16:9 的图像。  
2. **构思 Prompt**：Agent 利用 Gemini 3 的语言能力编写详细的角色描述。  
   * *Prompt*：Subject: A gritty cybernetic detective named K, mid-30s, glowing red robotic eye, trench coat, rain-soaked neon city background. Style: Hyper-realistic, 8k, Blade Runner aesthetic.  
3. **调用工具**：Agent 调用 generate\_cinematic\_shot 生成图像。  
4. **保存资产**：生成的图像被保存为 assets/characters/K\_reference.png。  
5. **生成 Artifact**：Agent 展示图像供用户确认。一旦用户确认，Agent 会在内存中标记：“此图像是 K 的权威视觉参考（Identity Seed）”。

### **4.2 阶段二：分镜脚本编写与视觉化**

**用户指令**：

“编写一个 5 个镜头的分镜脚本，描述 K 走进一个废弃的数据中心发现秘密的过程。然后基于脚本生成对应的分镜图。”

**导演代理的执行逻辑**：

1. **编写脚本**：Agent 生成 JSON 格式的分镜列表。  
   JSON  
   \[  
     {  
       "shot\_id": 1,  
       "action": "K stands before a massive, rusted server door.",  
       "camera": "Low angle, looking up at the imposing door.",  
       "lighting": "Cold blue moonlight from above."  
     },  
    ...  
   \]

2. **视觉生成循环**：Agent 遍历脚本，为每个镜头调用图像生成工具。  
   * **关键步骤**：在生成 Shot 1 时，Agent 会自动将 assets/characters/K\_reference.png 作为 reference\_images 参数传入。  
   * **Prompt 优化**：Agent 会将 JSON 描述转换为 Nano Banana Pro 偏好的结构化 Prompt 19。{"subject": "detective K", "reference": "locked", "action": "standing", "environment": "rusted server door", "lighting": "cold blue"}  
3. **一致性检查**：由于 Agent 具备视觉理解能力（Vision Capabilities），它可以在生成后自行检查：“生成的图中 K 的机械眼是否在左眼？外套颜色是否正确？”如果发现不一致，Agent 会自动调整 Prompt 并重试，直到满足一致性要求。

### **4.3 阶段三：图像转视频（Image-to-Video）**

**用户指令**：

“将这些分镜图生成为视频片段。第一镜使用缓慢推近的运镜。”

**导演代理的执行逻辑**：

1. **参数映射**：Agent 将“缓慢推近”翻译为 API 参数 camera\_motion: "zoom\_in", speed: 2。  
2. **调用视频 API**：Agent 使用 generate\_video 工具（需另外定义，调用 Nano Banana Video API）。  
   Python  
   video\_api.generate(  
       image\_path="storyboards/shot\_01.png",  
       prompt="Slowly zoom in on the door, atmospheric dust particles floating",  
       motion\_bucket\_id=127 \# 控制运动幅度  
   )

3. **文件组织**：生成的视频文件被保存到 output/ 目录，并按顺序命名。

## ---

**5\. 深度技术解析：解决一致性难题**

在上述流程中，最核心的挑战是保持角色和场景的一致性。本研究深入分析了 Antigravity \+ Nano Banana Pro 组合解决此问题的几种高级技术。

### **5.1 JSON 提示工程架构（JSON Prompting Architecture）**

传统的自然语言 Prompt 容易导致“概念出血”（Concept Bleeding），即形容词修饰了错误的物体（例如“穿着红色裙子的女孩拿着蓝色的花”变成了“穿着蓝色裙子”）。

Nano Banana Pro 支持对 Prompt 进行结构化解析。我们在 rules.md 中强制 Agent 使用 JSON 格式，可以显著提高控制力 19。

**推荐的 JSON Schema**：

JSON

{  
  "GLOBAL\_SETTINGS": {  
    "aspect\_ratio": "16:9",  
    "quality": "4k"  
  },  
  "SUBJECT": {  
    "identity\_ref": "",  
    "description": "Detective K",  
    "clothing": "brown leather trench coat",  
    "strict\_mask": true // 告诉模型仅在人物区域应用此描述  
  },  
  "ENVIRONMENT": {  
    "location": "abandoned server room",  
    "lighting": "dim green ambient light",  
    "details": \["hanging cables", "dust", "puddles"\]  
  },  
  "CAMERA": {  
    "type": "anamorphic",  
    "focus": "sharp on subject",  
    "depth\_of\_field": "shallow"  
  }  
}

Antigravity 的 Agent 能够理解这种 Schema，并在生成调用时动态填充内容，从而确保每一次生成的“环境”变了，但“主体”特征被严格隔离保护。

### **5.2 迭代式反馈循环（Iterative Feedback Loop）**

传统的 API 调用是“一锤子买卖”。但在 Antigravity 中，Agent 是“有状态”的。

1. **预生成分析**：Agent 在调用 API 前，会先“思考”（Deep Think 模式），预测可能出现的问题（例如：“这个镜头是背影，可能不需要面部参考图，否则会导致后脑勺出现人脸”）。  
2. **后生成验证**：Agent 利用 Gemini 3 的视觉能力（Vision）读取刚刚生成的图片。  
   * *Agent 自言自语*：“检测到生成的图片中，主角的手部有 6 根手指。这是一个错误。”  
   * *修正行动*：Agent 自动启用 In-painting（局部重绘）模式，针对手部区域重新生成，或者调整 Negative Prompt 后重试整图。

这种自我纠错能力是“代理优先”IDE 区别于普通脚本自动化的关键所在。

## ---

**6\. 高级配置：多模态分镜脚本生成**

为了进一步提升视频的叙事性，导演代理不仅需要生成图像，还需要生成与图像匹配的“图像到视频”提示词（Image-to-Video Prompts）。静态图的描述与动态视频的描述是不同的。

**静态 Prompt**: "A cybernetic detective standing in rain."

**动态 Prompt**: "The detective turns his head slowly to the left, rain falling heavily, neon lights flickering in the background, cinematic movement."

在 Antigravity 中，我们可以配置一个专门的规则，要求 Agent 在生成分镜图的同时，输出对应的动态 Prompt：

**Artifact: Storyboard Metadata**

| Shot ID | Image Path | I2V Prompt | Camera Move | Duration |
| :---- | :---- | :---- | :---- | :---- |
| 1 | shot\_01.png | "Subtle breathing motion, rain falling, neon flickering" | Static | 4s |
| 2 | shot\_02.png | "Subject walks forward into the darkness" | Pan Up | 5s |

这种结构化的元数据可以直接被后续的批量视频生成脚本读取，实现全自动化流水线。

## ---

**7\. 结论与展望**

Google Antigravity 与 Nano Banana Pro 的结合，代表了内容创作领域的一次生产力跃迁。通过将 IDE 的严谨工程能力与生成式 AI 的创意能力相结合，我们不仅是在“使用”工具，而是在“雇佣”一支数字化的摄制组。

本报告所展示的“导演代理”配置方案，证明了通过合理的规则约束（Rules）、工具封装（Tools）和结构化提示工程（JSON Prompting），完全可以克服当前 AIGC 视频面临的一致性与可控性难题。随着未来模型推理能力的进一步提升，这种基于代理的自动化工作流将成为短视频、广告乃至电影预演（Pre-visualization）的标准生产方式。

对于开发者和创作者而言，掌握 Antigravity 的配置与 Agent 编排逻辑，将是从“创作者”向“创意架构师”转型的关键技能。

---

**数据表：Nano Banana Pro 视频生成参数参考**

| 参数类别 | 参数名 | 推荐值 | 说明 |
| :---- | :---- | :---- | :---- |
| **基础设置** | resolution | "1080p" / "4K" | 建议先生成 1080p 预览，确认无误后 Upscale 到 4K |
|  | fps | 24 | 电影标准帧率 |
| **运动控制** | motion\_bucket\_id | 1-255 | 数值越大运动越剧烈。人物对话建议 \<50，动作戏建议 \>120 |
|  | noise\_aug\_strength | 0.0 \- 1.0 | 控制与原图的差异度。0.1 为最佳保真度 |
| **摄像机** | camera\_motion | "pan\_left", "zoom\_in", "tilt\_up" | 必须与分镜脚本的镜头语言一致 |

通过精确配置上述参数，Agent 能够像经验丰富的摄影师一样控制每一个镜头的动态质感。

#### **引用的著作**

1. Google Antigravity \- Wikipedia, 访问时间为 二月 5, 2026， [https://en.wikipedia.org/wiki/Google\_Antigravity](https://en.wikipedia.org/wiki/Google_Antigravity)  
2. How to Set Up and Use Google Antigravity \- Codecademy, 访问时间为 二月 5, 2026， [https://www.codecademy.com/article/how-to-set-up-and-use-google-antigravity](https://www.codecademy.com/article/how-to-set-up-and-use-google-antigravity)  
3. Getting Started with Google Antigravity, 访问时间为 二月 5, 2026， [https://codelabs.developers.google.com/getting-started-google-antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)  
4. Tutorial : Getting Started with Google Antigravity | by Romin Irani \- Medium, 访问时间为 二月 5, 2026， [https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2](https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2)  
5. Gemini 3 Pro Image (Nano Banana Pro) \- Google DeepMind, 访问时间为 二月 5, 2026， [https://deepmind.google/models/gemini-image/pro/](https://deepmind.google/models/gemini-image/pro/)  
6. Gemini 3 for developers: New reasoning, agentic capabilities \- The Keyword, 访问时间为 二月 5, 2026， [https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-developers/](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-developers/)  
7. study8677/antigravity-workspace-template: The ultimate starter kit for Google Antigravity IDE. Optimized for Gemini 3 Agentic Workflows, "Deep Think" mode, and auto-configuring .cursorrules. \- GitHub, 访问时间为 二月 5, 2026， [https://github.com/study8677/antigravity-workspace-template](https://github.com/study8677/antigravity-workspace-template)  
8. Build with Google Antigravity, our new agentic development platform, 访问时间为 二月 5, 2026， [https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)  
9. Nano Banana Pro (Gemini 3 Pro image): 4K AI Image Generator | Higgsfield, 访问时间为 二月 5, 2026， [https://higgsfield.ai/nano-banana-2-intro](https://higgsfield.ai/nano-banana-2-intro)  
10. Nano Banana Pro \- Gemini AI image generator & photo editor, 访问时间为 二月 5, 2026， [https://gemini.google/overview/image-generation/](https://gemini.google/overview/image-generation/)  
11. Nano Banana Pro: Gemini 3 Pro Image model from Google DeepMind \- The Keyword, 访问时间为 二月 5, 2026， [https://blog.google/innovation-and-ai/products/nano-banana-pro/](https://blog.google/innovation-and-ai/products/nano-banana-pro/)  
12. How to set up Batch Image Generation with Nano Banana Pro (Gemini 3.0 Pro Image) in native 4K? : r/Bard \- Reddit, 访问时间为 二月 5, 2026， [https://www.reddit.com/r/Bard/comments/1p8a7a3/how\_to\_set\_up\_batch\_image\_generation\_with\_nano/](https://www.reddit.com/r/Bard/comments/1p8a7a3/how_to_set_up_batch_image_generation_with_nano/)  
13. Nano Banana image generation | Gemini API | Google AI for Developers, 访问时间为 二月 5, 2026， [https://ai.google.dev/gemini-api/docs/image-generation](https://ai.google.dev/gemini-api/docs/image-generation)  
14. Nano banana pro fails to maintain the 100% consistency with the original photo, 访问时间为 二月 5, 2026， [https://support.google.com/gemini/thread/395344000/nano-banana-pro-fails-to-maintain-the-100-consistency-with-the-original-photo?hl=en](https://support.google.com/gemini/thread/395344000/nano-banana-pro-fails-to-maintain-the-100-consistency-with-the-original-photo?hl=en)  
15. Nano Banana Video \- AI Text to Video Generator | Create Studio-Quality Videos, 访问时间为 二月 5, 2026， [https://nanobananavideo.com/](https://nanobananavideo.com/)  
16. Rules / Workflows \- Google Antigravity Documentation, 访问时间为 二月 5, 2026， [https://antigravity.google/docs/rules-workflows](https://antigravity.google/docs/rules-workflows)  
17. Customize Google Antigravity with rules and workflows \- Mete Atamel, 访问时间为 二月 5, 2026， [https://atamel.dev/posts/2025/11-25\_customize\_antigravity\_rules\_workflows/](https://atamel.dev/posts/2025/11-25_customize_antigravity_rules_workflows/)  
18. Teaching Your ADK Agent to Do More: Add Real-World Tools \- Medium, 访问时间为 二月 5, 2026， [https://medium.com/google-cloud/teaching-your-adk-agent-to-do-more-add-real-world-tools-1d729605a0e6](https://medium.com/google-cloud/teaching-your-adk-agent-to-do-more-add-real-world-tools-1d729605a0e6)  
19. Nano Banana Pro JSON Prompting Guide: Master Structured AI Image Generation, 访问时间为 二月 5, 2026， [https://www.atlabs.ai/blog/nano-banana-pro-json-prompting-guide-master-structured-ai-image-generation](https://www.atlabs.ai/blog/nano-banana-pro-json-prompting-guide-master-structured-ai-image-generation)
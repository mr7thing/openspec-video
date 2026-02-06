# OpenSpec-Video: AI Director's Manual V0.1.0

欢迎使用 **OpenSpec-Video** —— 你的 AI 剧组自动化系统。
本系统不写代码，只拍电影。它将你的**剧本**直接转化为**分镜**和**影片**。

---

## 1. 核心理念 (The Philosophy)
**"Image is the Source Code of Video."**
（图像是视频的源代码。）

我们不直接生成视频。
1.  先**写剧本** (Script)。
2.  再**拍剧照** (Shoot Storyboard) —— 确认构图、光影、角色。
3.  最后**动起来** (Action) —— 基于剧照生成视频。

---

## 2. 导演工作流 (The Director's Workflow)

## 2. 导演工作流 (The Director's Workflow)

### 第一步：建组 (Init)
搭设你的数字片场。
```bash
npx opsv init my-cyberpunk-movie
cd my-cyberpunk-movie
```

### 第二步：写本 (Scripting)
**故事第一**。在 `videospec/stories/Script.md` 里写下你的故事梗概或详细剧本。
此时不需要考虑图片，只关注故事核。

```markdown
# Act 1: The Arrival
Detective K walks into the Void Bar. He is looking for a glitch in the matrix.
```

### 第三步：人设 (Asset Definition)
根据剧本，确定你需要哪些演员和场景。
在 `videospec/assets/` 下建立 YAML 定义，用**文字**详细描述他们的样子。

```yaml
# K.yaml
name: "Detective K"
description: "A weary cybernetic detective, brown leather trench coat, glowing red eye."
```

### 第四步：定妆 (Visualization)
让 AI 为你的角色生成“定妆照”。
1.  启动 Antigravity Agent (或使用 Gemini Web)。
2.  指令：“根据 `assets/characters/*.yaml` 的描述，为每个角色生成 4 张风格统一的设定图。”
3.  **审定 (Review)**：挑选最满意的一张，保存到 `assets/characters/images/`，并在 YAML 中更新 `reference_sheet` 路径。

### 第五步：分镜 (Storyboarding)
现在你有了故事，也有了演员（图片）。
回到 `Script.md`，开始设计具体的分镜（Shots），并引用你的演员。

```markdown
# Scene 1
**Shot 1**: [char_k] pushes through the neon curtain. Close up on his mechanical eye.
```

### 第六步：开拍 (Shoot)
执行自动化拍摄。
```bash
npx opsv generate
```
Agent 将结合你的**分镜描述** + **定妆照**，使用 Nano Banana Pro (或其他工具) 生成高度一致的分镜画面。

### 第五步：动作 (Action)
分镜满意了？让它动起来。
启动 `workflows/generate_video.md`，Agent 会把你的分镜图扔进 Veo 或 Runway，生成最终的 4K 视频片段。

---

## 3. 常见问题 (FAQ, for Directors)

**Q: "演员长得不对？"**
A: 检查 `assets/characters/` 里的参考图是否清晰。AI 是看图说话的。

**Q: "可以只重拍第3场吗？"**
A: 可以。在剧本里注释掉其他场次，或者只保留 Scene 3，然后重新 Run `opsv generate`.

---

*Directed by You. Powered by OpenSpec.*


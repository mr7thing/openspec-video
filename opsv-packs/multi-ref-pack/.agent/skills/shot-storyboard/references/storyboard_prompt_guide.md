# 分镜 Prompt 编写指南

> 适用阶段：S5.5 分镜草图
> **用法**：Agent 在执行 Step 1（编写分镜 prompt）前，必须加载本指南，以三色运动标注体系为 prompt 编写基准。

---

## 核心原则

```
运动设计 > 构图美观。
草图是灰黑铅笔稿（本体），三色彩线（红/蓝/绿）是运动标注。
草图是指导视频生成的"运动设计蓝图"，不是成品缩略图。
每格必须包含三色运动线标注。
```

---

## 三色运动标注体系

本体是**灰黑铅笔稿**（角色轮廓、场景结构用素描线绘制），彩色线条叠加标注运动：

| 颜色 | 线型 | 标注对象 | 含义 |
|------|------|---------|------|
| ⚫ 灰/黑 | 素描线 | 铅笔稿本体 | 角色轮廓、场景结构 |
| 🔴 红色 | 实线箭头 | 人物/物体运动 | "画面里谁往哪动" |
| 🔵 蓝色 | 虚线箭头 | 镜头运动 | "镜头往哪动" |
| 🟢 绿色 | 波浪线/点线箭头 | 特效/冲击/能量 | "冲击波/光线/能量往哪去" |

**三色关系解读**：
- 红蓝同向（→→）：角色移动 + 镜头跟移（tracking shot）
- 红蓝反向（→←）：角色前进 + 镜头后退拉远
- 红蓝交叉（↑→）：角色跳跃 + 镜头横摇
- 绿+红叠加：角色挥砍同时冲击波扩散
- 绿+蓝叠加：镜头推进同时光线汇聚
- 只有红线：角色运动，固定机位
- 只有蓝线：空镜运动，如缓慢推入
- 只有绿线：静态画面但有能量场/光线流动

---

## 两段式系统提示词（生产级）

以下两段系统提示词直接来自 ComfyUI 生产工作流，可直接用于 LLM API 调用。

### Stage 1：分镜剧本生成器

```
你是一位好莱坞顶级电影导演兼分镜师。你的任务是将用户提供的镜头描述，精准地转化为专业的影视分镜头脚本，重点标注运动设计。

请仔细分析动作、节奏和空间关系，将其拆解为9个连续镜头格，按照以下结构输出：

【镜头编号】：Shot 1, Shot 2... Shot 9
【景别】：大远景 / 远景 / 全景 / 中景 / 近景 / 特写 / 过肩镜头
【摄像机角度】：平视 / 仰视 / 俯视 / 鸟瞰 / 倾斜
【摄像机运动】：固定 / 推 / 拉 / 摇 / 上下摇 / 跟 / 环绕
【光影氛围】：高调 / 低调 / 冷色调 / 暖色调 / 霓虹 / 逆光 / 丁达尔效应
【画面描述】：详细描述画面中出现的人物动作、神态、服装及环境细节
  （剔除心理描写，只写可视化的动作/神态/环境）
【人物运动（红色实线箭头）】：描述画面中人物的移动方向、动作轨迹、肢体运动
  例：角色从左侧入画，向右侧奔跑 → 红色实线箭头向右
【镜头运动（蓝色虚线箭头）】：描述摄像机的运动方向和方式
  例：镜头跟随角色右移 → 蓝色虚线箭头向右
【特效/能量（绿色波浪箭头）】：描述冲击波、光线、粒子、速度线等视觉特效的扩散方向
  例：左手挥砍产生弧形冲击波向右扩散 → 绿色波浪箭头向右
【SD生图提示词 (English)】：根据画面描述生成英文 prompt，必须包含三色线指令：
  本体为灰黑铅笔稿（gray-black pencil draft sketch），
  Red solid arrows = character/object movement,
  Blue dashed arrows = camera movement,
  Green wavy arrows = effects/impact/energy direction

要求：
1. 三色运动线是核心输出——每格都需要明确标注
2. 镜头之间的运动衔接要符合影视剪辑逻辑（动接动、视线匹配等）
3. 忽略心理描写，转化为可视化的微表情或动作
4. 英文 prompt 必须包含三色线指令
5. 特效标注要明确"是什么特效"和"往哪个方向扩散"
```

### Stage 2：分镜大师（九宫格图像 Prompt）

```
你是一位专业电影分镜师。请将用户输入的分镜头脚本转化为一张3x3九宫格分镜图的图像生成 prompt。

格式要求：
1. 开头第一句：'3x3 grid, seamless, borderless'
2. 第二句：'Gray-black pencil draft sketch. Red solid arrows indicate character/object movement. Blue dashed arrows indicate camera movement. Green wavy arrows indicate effects/impact/energy direction.'
3. 依次描述9个格子，每格格式：
   Panel N (位置): 景别, 机位 | 画面描述
     Red arrow: [人物运动方向]
     Blue dashed arrow: [镜头运动方向]
     Green wavy arrow: [特效/能量方向（如无则写 none）]
4. 结尾：'no margins, no film black bars, panels tightly connected, monochrome sketch with colored motion lines overlay'

直接输出整段 prompt，不要任何多余文字。
```

---

## Prompt 完整模板

```
3x3 grid, seamless, borderless
Gray-black pencil draft sketch.
Red solid arrows indicate character/object movement.
Blue dashed arrows indicate camera movement.
Green wavy arrows indicate effects, impact, or energy direction.

Panel 1 (top left): [景别], [机位], [画面描述]
  Red arrow: [人物运动轨迹]
  Blue dashed arrow: [镜头运动轨迹]
  Green wavy arrow: [特效/能量方向]

Panel 2 (top center): [景别], [机位], [画面描述]
  Red arrow: [人物运动轨迹]
  Blue dashed arrow: [镜头运动轨迹]
  Green wavy arrow: [特效/能量方向]

... (重复至 Panel 9，每格三色线完备)

Panel 9 (bottom right): [景别], [机位], [画面描述]
  Red arrow: [人物运动轨迹]
  Blue dashed arrow: [镜头运动轨迹]
  Green wavy arrow: [特效/能量方向]

构图基准参考 @shot-ref-S01-Shot01 的合成帧
角色外观参考 @LuRan-multiview 的多视图
场景空间参考 @Dojo-Day 的场景空镜
no margins, no film black bars, panels tightly connected,
monochrome sketch with colored motion lines overlay
```

---

## 九宫格时间线（含三色运动设计）

```
[格1] 起始构图           [格2] 动作发展           [格3] 动作完成
 ⚫灰黑铅笔稿             ⚫灰黑铅笔稿             ⚫灰黑铅笔稿
 🔵固定                  🔴角色入画→              🔴角色落位
 🔴静态                   🔵跟摇→                  🔵停
 🟢无                     🟢无                    🟢无

[格4] 视角切换           [格5] 关键时刻           [格6] 反应/结果
 ⚫灰黑铅笔稿             ⚫灰黑铅笔稿             ⚫灰黑铅笔稿
 🔵切中景                 🔴挥砍↓                  🔵慢推→
 🔴转身                   🔵慢镜头                 🔴受击后退←
 🟢无                     🟢冲击波→扩散            🟢火星飞溅↗

[格7] 新构图             [格8] 推向高潮           [格9] 镜头结束
 ⚫灰黑铅笔稿             ⚫灰黑铅笔稿             ⚫灰黑铅笔稿
 🔵切全景                 🔴冲刺+跳跃↗             🔴收势
 🔴入画→                  🔵急速推→                🔵固定
 🟢无                     🟢能量光柱↑               🟢光线消散→
```

---

## 每格六要素

| 要素 | 说明 | 示例 |
|------|------|------|
| ⚫ 本体 | 灰黑铅笔稿（角色轮廓+场景结构） | pencil draft sketch |
| 景别 | 画面取景范围 | wide, medium, close-up |
| 机位 | 拍摄角度 | eye-level, low-angle, high-angle |
| 角色位置+动作 | 角色在画面中的位置和行为 | walks right from left |
| 🔴 人物运动线 | 角色/物体的移动轨迹（红色实线箭头） | Red arrow: rightward running arc |
| 🔵 镜头运动线 | 摄像机的运动方向（蓝色虚线箭头） | Blue dashed arrow: track right |
| 🟢 特效/能量线 | 冲击波/光线/粒子的扩散方向（绿色波浪箭头） | Green wavy arrow: impact wave radiates right |

---

## 反面示例

```
❌ "a beautiful ninja fighting in a forest"
   → 没有景别、没有机位、没有运动线

❌ "9 panel storyboard of a fight scene"
   → 没声明 3x3 grid，模型可能生成独立图

❌ "top left: character moves"
   → "moves" 太模糊——往哪移？运动线怎么画？

❌ "Red arrow shows movement, Blue dashed shows camera"
   → 没声明灰黑铅笔稿本体 + 漏了绿色特效线

✅ "Panel 1 (top left): WIDE SHOT, eye-level, gray-black pencil sketch.
    @LuRan-multiview stands left facing right, ready stance.
    Red arrow: none (static character).
    Blue dashed arrow: static camera.
    Green wavy arrow: none."

✅ "Panel 5 (center): MEDIUM SHOT, low-angle, gray-black pencil sketch.
    @LuRan-multiview slashes downward with sword.
    Red arrow: solid arrow arcing down-right.
    Blue dashed arrow: slow push-in toward character.
    Green wavy arrow: energy shockwave radiates outward from blade impact."
```

---

## 常见陷阱

1. **忘了三色线声明** — prompt 开头必须写"Red solid arrows... Blue dashed arrows... Green wavy arrows..."
2. **忘了灰黑铅笔稿声明** — 本体是"gray-black pencil draft sketch"，不是全彩成品图
3. **9 格独立无运动关联** — 每格的三色线应该串联成一个连续的运动节奏
4. **三色线方向矛盾** — 格2红线向右、格3红线突然向左，动作不连贯
5. **只有红线没有蓝线/绿线** — 忘了标注镜头运动或特效方向（固定机位也要声明"static camera"，无特效也要写"none"）
6. **背景占太多 prompt** — 灰黑铅笔稿背景不重要，token 留给运动描述
7. **没引用角色资产** — prompt 里写 `@LuRan-multiview` 但 refs.image 没加
8. **3x3 grid 开头缺失** — 模型可能生成 9 张独立图而非网格
9. **特效方向模糊** — 不能只写"有特效"，要写"冲击波向右扩散 / 光线从上方汇聚"

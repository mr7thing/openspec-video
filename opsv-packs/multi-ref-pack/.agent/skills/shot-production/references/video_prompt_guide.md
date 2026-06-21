# 视频 Prompt 编写指南

> 适用阶段：S6 视频生产

---

## 核心原则

```
视频 prompt = 场景氛围 + 角色动作 + 镜头运动 + 光影变化
```

视频 prompt 不是从零写，而是**组合已有的信息**：

| 信息源 | 来源 | 用在哪 |
|--------|------|--------|
| 场景 mood/lighting | S2 场景定档 | 气氛 |
| 角色 action | S1 Script.md | 动作 |
| 角色对话 | S1 Script.md | 台词（如有） |
| 镜头 camera_movement | S1 Script.md | 运镜 |
| shot_type | S1 Script.md | 景别 |
| 镜头参考帧光影 | S5 shot-ref | 光影基准 |
| 分镜构图 | S5.5 shot-storyboard | 参考图引导 |

## Prompt 结构

```
[场景氛围], [角色动作], [镜头运动]. [光影细节]. [风格标签].

示例：
A martial artist in flowing red robes walks slowly into a traditional
Japanese dojo temple courtyard at dawn. Morning light streams through
the wooden doors, casting long dramatic shadows. The camera dollies in
smoothly from a wide establishing shot, tracking his confident stride.
Dust particles float in the golden sunbeams. Cinematic, 4k, volumetric
lighting.
```

## 4 类参考图组合

| 参考图 | 来源 | prompt 中怎么配合 |
|--------|------|-----------------|
| 角色多视图 @LuRan-multiview | S4 | prompt 描述动作时与多视图中姿势一致 |
| 场景空镜 @Dojo-Day | S4 | prompt 描述环境时与空镜布局一致 |
| 镜头参考帧 @shot-ref-S01-Shot01 | S5 | prompt 的光影方向/色调与参考帧一致——光影基准 |
| 分镜草图 @storyboard-S01-Shot01 | S5.5 | prompt 的构图/运镜与草图一致 |

## 反面示例

```
❌ "a ninja fight scene"                    → 太笼统，模型自由发挥
❌ "a beautiful cinematic video of a girl"   → 无构图指导，角色可能走样
✅ "WIDE SHOT of @LuRan-multiview walking into @Dojo-Day at dawn, camera dollies in"
```

## 常见陷阱

1. **prompt 与分镜草图矛盾** — 文字说 wide shot，草图是 close-up → 模型困惑
2. **多参考图但 prompt 没配合** — 参考图提供了角色外观，但 prompt 描述的动作与参考图不同
3. **太短** — < 50 字符模型缺乏信息
4. **太啰嗦** — 超过 200 字符注意力分散
5. **忘了加风格标签** — cinematic, 4k, volumetric lighting 等

## 最佳长度

50-150 字符，刚好包含：场景 + 动作 + 运镜 + 光影

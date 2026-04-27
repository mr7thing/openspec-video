# Shotlist

> OpsV 视频工程图纸（v0.8 规范：显式账本模式）
> 该文档为视频指令的 Single Source of Truth。不仅限于机位，所有发送给模型的描述必须显式落笔。

## Shot 01 (5s)

```yaml
id: shot_01
status: draft
first_frame: "../../opsv-queue/videospec/zerocircle/volcengine.seadream/shot_01.png"
last_frame: null
video_path: null
```

**Video Prompt:**
场景定位于破损的 实验室 (@scene_lab)，英雄 (@hero) 发现了一个发光的核心。
**Motion**: 镜头从中景缓慢拉近至面部特写，周围有细微的灰尘飘浮，动作极慢，情绪凝重。

> [!note] 导演附加参数区
> [心跳音效](./refs/dark_ambient.wav)
> [光影参考](./refs/lighting.jpg)

**[Review 审查区]**
> 这里供机器回填视频草案，供导演审查推翻。
<!-- opsv review 将在此植入： [✅ 视频草案 1](../../opsv-queue/videospec/endcircle/volcengine.seedance/shot_01.mp4) -->


## Shot 02 (4s)

```yaml
id: shot_02
status: draft
first_frame: "@FRAME:shot_01_last"
last_frame: null
video_path: null
```

**Video Prompt:**
无缝顺接上一镜。英雄 (@hero) 紧紧握住发光核心。
**Motion**: 镜头环绕主角旋转，光芒逐渐强化。

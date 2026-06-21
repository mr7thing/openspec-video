# Sample Camera Blocking — 镜头调度文档范本

```yaml
---
category: frame_klein9b_camera
status: drafting
id: camera-S01-Shot01
shot_id: S01-Shot01
prompt: >
  push in to extreme close-up, frontal upward shot, character centered,
  dramatic lighting. Camera dollies in smoothly from a wide establishing shot,
  tracking the character's confident stride. Dust particles float in golden sunbeams.
generation_type: image
seed: 865816361310933
refs:
  image:
    - "@Woman-Character"
    - "@Palace-Scene"
---

# 镜头调度：S01-Shot01

## 镜头描述
推镜头至极特写，正面仰角，角色居中，戏剧性光影。

## 运镜
dolly in（轨道推进）

## 景别
wide → extreme close-up

## 参考资产
- 角色：@Woman-Character
- 场景：@Palace-Scene

## 资产路径
待 `opsv run` 后由 Guardian 回写 `asset_id`
```

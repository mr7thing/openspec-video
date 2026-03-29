# OPSV-SHOT-0.4 分镜与动画规格 (Shot/Animation Spec)

> 定义 OpsV 0.4 环境下的分镜语法、动态控制参数及长镜头继承逻辑。本版本强化了 **动静分离原则**，确保视频生成的特征一致性。

---

## 1. 核心设计哲学

- **@锚点解耦**：分镜中严禁出现“黑发、红瞳”等视觉描写，必须使用 `@role_K` 引用。
- **动静分离**：视觉特征由 `Approved References` (a-ref) 提供；本规格仅负责：**镜头运镜**、**角色肢体动作**、**环境动态演变**。
- **平行宇宙**：默认支持 `--model all`。编译器会自动为每个启用的引擎生成任务。

---

## 2. YAML 结构定义

此结构适用于 `Script.md` (前中期) 与 `Shotlist.md` (后期动画控制)。

```yaml
shots:
  - id: "shot_1"
    duration: 5s              # 建议时长 3-5s，上限 15s
    # --- 视觉输入 (Static Input) ---
    first_image: "artifacts/drafts_2/shot_1_draft_2.png" # 精确首帧路径，或 @FRAME:shot_0_last (长镜头继承)
    reference_images:         # 自动由编译器从引用的 @entity a-ref 中提取，无需人工维护
      - "artifacts/drafts_1/role_K_turnaround.png"
    # --- 动态控制 (Motion Control) ---
    camera_motion: "Extreme macro, slow push in"       # 运镜指令
    motion_prompt_zh: "镜头极微距推进，蚕茧表面缓慢裂开"     # 中文意图
    motion_prompt_en: >                                # 英文 API 核心指令 (给视频大模型)
      Macro shot, surface slowly cracking, morning dew trembling, 
      cinematic smooth motion, high frame rate quality.
    # --- 质检标记 (QA Metadata) ---
    entities: ["@role_butterfly", "@scene_cocoon"]     # 本镜头涉及的实体
```

---

## 3. 关键字段深度说明

### 3.1 `first_image` 与长镜头继承
- **确指路径**：指向由 `opsv review` 确认后的最佳草图。
- **继承指针 `@FRAME:<id>_last`**：
  - 代表使用前一个 Shot 生成视频的最后一帧作为本镜头的首帧。
  - 核心用途：保证同一段运动在不同分镜间的完美转场连贯性。

### 3.2 `motion_prompt_en` (强制全英文)
- **准则**：仅描述“变动的部分”。
- **禁区**：禁止出现任何形容词性外貌描述。例如：
  - ❌ `A beautiful girl in red dress running...`
  - ✅ `Subject running rapidly towards the light, hair fluttering in the wind...` (美不美、穿什么由首帧和参考图定)。

---

## 4. 目录与编译约束 (0.4.3+)

- **任务生成**：`opsv animate` 将解析分镜文件。
- **输出隔离**：视频产物严格按照模型引擎隔离存储：
  - `artifacts/videos/[EngineName]/shot_1_v1.mp4`
- **风格注入**：编译器会自动将 `project.md` 中的 `global_style_postfix` 注入每一个视频生成任务，确保全片调色与质感统一。

---

## 5. 质检门禁 (Supervisor /opsv-qa)

| 检查项 | 逻辑说明 |
| :--- | :--- |
| **特征泄漏检查** | 扫描 `motion_prompt_en` 是否含有颜色、外观等违禁词。 |
| **参考图对齐** | 验证所引用的 `@entity` 是否拥有定档的 `Approved References`。 |
| **首帧合法性** | 检查图片路径是否存在，或者 `@FRAME` 指针是否闭环。 |

---

> *OPSV-SHOT-0.4 | OpsV 0.4.3 | 最后更新: 2026-03-28*

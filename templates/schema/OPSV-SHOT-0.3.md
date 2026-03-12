# OpenSpec-Video (OpsV) 0.3 Shot Specification (OPSV-SHOT-0.3.md)

本规范定义了 OpsV 0.3 环境下的分镜语法及端点约束设计。这是实现“精准时空锁定”与自动化模型调度的基础。

## 1. 核心架构逻辑
与 0.2 中纯视觉构图的静态表达不同，0.3 的 Shot 协议引入了**对时间轴与动作演变的控制**，即首帧、尾帧及多语言提示词分离。

每个文件（例如 `videospec/shots/Shotlist.md`）的最前部必须使用 YAML 列表声明所有的动作和图像状态，这可极大降低正则解析崩溃的概率。

## 2. YAML 结构定义

```yaml
shots:
  - shot: 1
    duration: 5s              # 严格时间约束，用于影视化剪辑组装
    first_image: "artifacts/drafts_2/K_idle.png"       # 【必选】首帧图（直接对应 API image 参数），或者指向前一个镜头的 @FRAME:<shot_id>_last 延迟指针
    middle_image: "artifacts/drafts_2/K_turn.png"      # 【备选】中间帧图（用于后续的高级模型插帧或运镜定位）
    last_image: "artifacts/drafts_2/K_walk.png"        # 【备选】尾帧图（如果模型支持基于首尾帧的双条件生成）
    target_last_prompt: "昏暗灯光下，一个魁梧的半机械人举着枪瞄准" # 【新增】靶向诱饵词，若存在，系统会在纯生图队列自动挂载并下发一个生成任务用于补尾帧。
    reference_images:                                  # 【扩展】参考图组，可用于保留 @实体的特征设定
      - "videospec/elements/role_K.png"
    motion_prompt_zh: "镜头向右平移，人物缓慢转头，街区雨滴下落" # 中文原意动作描述（供人类核对或 LLM 分析）
    motion_prompt_en: "camera pan right, subject slowly turns head, rain drops falling in neon street..." # 英文 API 唯一动作指令（给底层视频大模型识别）
```

## 3. 字段说明

- `first_image`: 管线目前极度依赖此字段。在目前所有图生视频的模型（如 Wan2.2、Sora、Luma 等）中，首帧直接决定了世界的基调。该路径必须指向人类在 OpsV 0.2 阶段 review 确认后的原图。或者写为 `@FRAME:<shot_id>_last` 用于声明继承前一个镜头的自动截帧。
- `middle_image` & `last_image`: 对未来的储备。调度器 (`VideoModelDispatcher`) 将根据当前的设定的模型能力主动判断是否需将这二者封装上传。
- `target_last_prompt`: 当需要补充专门的尾帧又不想单独开分镜时，将其写出，图片编译系统就会生成 `<shot_id>_last` 图像任务。
- `motion_prompt_en`: **严禁包含任何人物外貌特征**（如黑大衣、义眼）。外貌必须全部交由 `first_image` 传递，避免模型在理解语言指令时发生特征渗透现象。
- 所有 Image 字段的资源将在底层由 TypeScript 编译器强制展开为 OS 绝对路径，这保证了工作流和模型的独立性。

## 4. Draft 生命周期与命名规范 (0.3.2+)

为了保留导演在创作早期的决策自由度，系统采用了**延迟绑定**策略：

### 4.1 自动命名规则
- **初始分镜生成**：统一命名为 `shot_X_draft_N.png`。不预设首/尾帧角色，仅表示该镜头的视觉候选。
- **定向补帧生成**：通过 `target_last_prompt` 触发的任务，命名为 `shot_X_target_last_N.png`，在 review 时自动打上意图标签。

### 4.2 画廊化审阅 (Script.md)
所有的 draft 和 target 图片都会被回写到 `Script.md` 的画廊区域。导演通过批注指定角色（如："Draft 2 做首帧"），由 Animator 最终在 `Shotlist.md` 中完成指针绑定。


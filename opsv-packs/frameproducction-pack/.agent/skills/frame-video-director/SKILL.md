---
name: frame-video-director
description: >
  导演台视频合成 — 基于 LTX Director 工作流，将角色资产、场景资产、镜头调度结果
  组合为完整时间线，生成带音频同步的合成视频。
  Use this skill whenever the user wants to assemble the final video timeline
  using the LTX Director ComfyUI workflow, combine approved assets into segments,
  control timing/guide strength/audio sync, and produce the final mp4 output.
  Trigger on: "导演台", "video director", "timeline", "时间线", "视频合成", "LTX Director",
  "compose video", "final render".
  Distinguishes from multi-ref-pack's shot-production by using LTX Director node
  (not Seedance) with explicit timeline_data segments, audio latent concatenation,
  and per-segment guide strength control.
disable-model-invocation: false
user-invocable: true
---

# 导演台视频合成 (Frame Video Director)

> **阶段**: S7 · 视频合成 (Stage 7)
> **输入**: S3 角色资产 + S4 场景资产 + S5 声音资产 + S6 镜头调度 + S6 Next Scene
> **产出**: 合成视频（mp4 + 音频）+ `asset_id` 回写
> **技能数**: 1（本技能独占 S7）
> **验收**: `opsv validate --dir videospec --category frame_video_director` + 视频审阅

---

## 1. 职责边界

**你做**：
- 读取所有 S3-S6 的 `approved` 资产（角色图、场景图、声音、镜头调度图）
- 编写导演台时间线 `timeline_data`（segments 数组），每段指定图像、prompt、长度
- 设置 `global_prompt`、`segment_lengths`、`guide_strength` 等参数
- 调用 `opsv comfy` 编译导演台任务
- 执行 `opsv run` 生成合成视频
- 处理视频审阅后的迭代（调整时间线、修改 segment prompt）

**你不做**：
- 修改角色/场景资产（那是 S3/S4 的事）
- 修改声音资产（那是 S5 的事）
- 修改镜头调度（那是 S6 的事）

---

## 2. 触发条件

- S3 角色资产全部 `approved`
- S4 场景/道具资产全部 `approved`
- S5 声音资产全部 `approved`
- S6 镜头调度 + Next Scene 全部 `approved`

---

## 3. 工作流程

```
S3 角色资产 + S4 场景资产 + S5 声音 + S6 镜头调度 + S6 Next Scene
      │
      ▼
┌──────────────────────────────┐
│ Step 1: 组装时间线 segments  │
│   每个 segment = {           │
│     imageFile, prompt,       │
│     start, length            │
│   }                          │
│   global_prompt = 整体叙事    │
│   segment_lengths = 每段秒数  │
│   guide_strength = 1.0 每段  │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 2: 创建导演台文档        │
│   shots/epXX/director_       │
│   EP{XX}.md                   │
│   frontmatter: prompt +      │
│   duration + refs            │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 3: 编译+执行视频合成     │
│   opsv comfy --manifest M    │
│          --category           │
│          frame_video_director │
│   opsv run <task.json>       │
│   → 产出 mp4 视频(含音频)     │
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Step 4: 审阅+审批+资产回写    │
│   opsv review --circle       │
│   opsv approved              │
│   回写 asset_id               │
└─────────────────────────────┘
```

---

## 4. 这 7 个关切在本技能如何贯彻

### ① 生产流程
4 步：组装时间线 → 创建文档 → 编译执行 → 审阅回写。

### ② 依赖处理
- **上游**: S3-S6 所有资产 `approved`
- **验证**: `opsv refs check` 确认 `refs.image` 中每个 `@id` 都已 `approved`

### ③ 提示词生成
时间线 prompt 的编写规则：
- `global_prompt`：整体叙事描述（一段话概括全片）
- `local_prompts`：每段独立 prompt，用 `|` 分隔
- `timeline_data`：JSON 字符串，每个 segment 包含 imageFile + prompt + start + length
- **每段 imageFile 必须是已 approved 的资产路径**

### ④ 引用语法
- `refs.image` 包含所有用于时间线的资产引用
- 编译时 OPSV 将 `@id` 解析为实际文件路径并填入 `timeline_data`

### ⑤ 任务环编排
- 最后一个 Circle（S7），依赖所有上游 Circle 完成
- 编译时自动检查所有上游资产的 `status: approved`

### ⑥ 迭代与 Review
- 视频节奏不对 → 调整 `segment_lengths` → `opsv iterate` → 重新合成
- 某段画面不连贯 → 调整该 segment 的 prompt → 重新合成
- 审阅标准：节奏是否流畅、音画是否同步、转场是否自然
- 审阅通过后：
  - 无修改：`opsv review` → `opsv approved`
  - 有修改：标记 `syncing` → Guardian 回写 → `opsv approved`

### ⑦ 资产回写
```yaml
asset_id: "opsv-queue/<project>_circleN/ltx-director/EP01_1.mp4"
```

---

## 5. 注意事项（踩过的坑）

1. **timeline_data 是 JSON 字符串** — 必须在 frontmatter 中以字符串形式存储，不能是嵌套对象
2. **segment_lengths 逗号分隔** — 如 `"24,24,24,23"`，对应每个 segment 的帧数
3. **guide_strength 逗号分隔** — 如 `"1.0,1.0,1.0"`，控制每段引导强度
4. **resize_method 默认 crop** — 如果素材尺寸不一致，crop 会裁边，fit 会留黑边
5. **音频同步依赖 LTXVConditioning** — 声音资产必须通过 refs.audio 注入
6. **duration_frames = duration_seconds × frame_rate** — LTX Director 节点内部计算
7. **CRF 19 是推荐值** — 平衡质量和文件大小
8. **root 目录 .md 不验证** — 导演台文档放在 `shots/epXX/` 下

---

## 6. references/

- `references/director_timeline_guide.md` — 时间线组装指南（segment 编写规范、参数说明）
- `references/sample_director.md` — 导演台文档完整范本
- `references/ltx_director_params.md` — LTX Director 节点参数详解

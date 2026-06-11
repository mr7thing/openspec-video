# 角色三视图文档模板

## ⚠️ 前置条件

**必须先有 approved 的角色概念图**，才能生成三视图。
三视图以概念图为参考输入，确保视觉一致性。

## 文档结构

```yaml
---
category: comic_character_turnaround
status: drafting
title: "<角色名> — 角色三视图"
character_id: "@<character>"                    # 关联的角色文档 ID
based_on_concept: "<path/to/concept.png>"        # 输入：approved 概念图路径
workflow_id: "<runninghub-workflow-id>"          # 三视图工作流 ID
node_mapping:
  prompt:
    nodeId: "6"
    fieldName: "text"
  negative_prompt:
    nodeId: "7"
    fieldName: "text"
  seed:
    nodeId: "3"
    fieldName: "seed"
  image1:                                        # 概念图作为风格锚点
    nodeId: "10"
    fieldName: "image"
---

## 输入

| 输入 | 来源 | 用途 |
|------|------|------|
| 概念图 | `@<character>.approved_concept` | IPAdapter 风格锚点，保证三视图与概念图一致性 |
| 角色视觉描述 | `@<character>.visual_detailed` | 拼入 prompt，描述角色外观特征 |
| 角色身份特征 | `@<character>.prompt` | 提取关键视觉符号（发型/服饰/配饰/体型特征） |

## 三视图 Prompt 规范

### ⚠️ 关键约束

三视图是**纯技术参考图**，必须：
- **纯色/透明背景** — 完全剔除场景、光影氛围、环境渲染
- **标准多角度** — 正面 / 侧面（45°） / 背面 / 表情集
- **中性光照** — 无戏剧化打光，确保服装/配饰/发型清晰可辨
- **保持概念图风格** — 通过 IPAdapter 锁定画风

### Prompt 模板

```yaml
prompt: >
  Character turnaround reference sheet of <角色描述>.
  
  Four views in a clean layout:
  - Front view (center): full body standing straight, arms slightly away from body,
    neutral expression, facing directly at camera.
  - Three-quarter view (left): 45-degree angle, showing side profile and 
    costume details from an angle.
  - Back view (right): full body from behind, showing hair style from back,
    costume back details, any back accessories.
  - Expression sheet (bottom strip): 4-6 small facial expression portraits —
    neutral, angry, sad, surprised, smirking, determined.
  
  Clean solid light grey background (#E8E8E8). No environment, no lighting drama,
  no shadows on the background. Even studio lighting for maximum costume and
  feature clarity. Technical reference sheet style, not illustration.
  
  Must match the character design from the reference image exactly:
  same face structure, same costume, same color palette, same hair style.
  
  <style_postfix>
```

## 输出定义

| 输出 | 格式 | 用途 |
|------|------|------|
| 三视图 PNG | `elements/characters/<char_id>_turnaround.png` | 分镜生图时作为角色视觉锚点 |
| approved_turnaround | 写入 `@<character>` 的 refs | 后续引用时可选概念图或三视图 |

## 验证标准 (opsv validate)

```
□ 三视图已生成且文件存在
□ 人物外观与概念图一致（人工比对）
□ 背景为纯色/透明，无环境渲染
□ 四个标准角度齐全（正面/侧面/背面/表情）
□ 角色文档中 confirmed_turnaround 已更新
```

## 工作流节点设计（ComfyUI）

```
LoadImage (概念图) ──→ IPAdapter ──→ KSampler ──→ VAE Decode ──→ SaveImage
                              ↑
CLIP Text Encode (prompt) ────┤
CLIP Text Encode (negative) ──┤
                              ↑
                        CR Seed
```

**标记节点 Title**（在 ComfyUI 中右键 → Title）：
- `opsv-prompt` → CLIP Text Encode (正向)
- `opsv-negative_prompt` → CLIP Text Encode (负向)
- `opsv-seed` → CR Seed
- `opsv-image1` → Load Image (概念图作为风格参考)

## 编译命令

```bash
# 生成三视图
opsv comfy --model runninghub.comic --category comic_character_turnaround

# 回写到角色文档（Agent 手动执行）
# 将生成的 turnaround 路径写入 @character.md 的 approved_turnaround 字段
```

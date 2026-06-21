---
name: microlesson-pack
title: 数字人微课制作管线
version: 1.0.0
author: Uncle7
created: 2026-06-20
---

# 数字人微课制作管线 (Micro-lesson Production Pack)

> **定位**: 基于 OPSV + Remotion + ComfyUI LTX2.3 的数字人微课自动化制作技能包
> **核心能力**: 将课程大纲 + PPT + 语音稿 → 带数字人讲解的微课视频

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 管线编排 | OPSV | 项目管理、技能调度、质量验证 |
| 视频编排 | Remotion (React) | 场景切换、PPT动画、数字人视频合成 |
| 数字人生成 | ComfyUI LTX2.3 | 音频驱动 Talking Head 视频生成 |
| 图像生成 | Multi-Ref Pack (可选) | 背景图、角色形象生成 |

## 管线概览

```
课程大纲 (markdown)
       │
       ▼
┌─────────────────┐
│ S0: lesson-planner │  ← 拆解课程结构，定义课时/讲/页/数字人触发点
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ S1: ppt-organizer  │  ← 组织PPT图片 + 语音稿，生成 slide 元数据
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ S2: digital-human-planner │  ← 规划哪些页面需要数字人，数字人位置和时长
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ S3: digital-human-generator │  ← 通过 LTX2.3 ComfyUI 工作流生成数字人视频
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ S4: remotion-compiler │  ← 编译 Remotion React 组件，编排场景切换
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│ S5: remotion-renderer │  ← 渲染最终微课视频
└─────────────────┘
```

## 视频模式说明

微课采用固定背景 + PPT + 数字人的三层结构：

1. **开场模式**: 数字人在画面中央介绍课程，PPT不显示
2. **讲解模式**: 数字人移到画面一侧，PPT占据大部分画面
3. **聚焦模式**: PPT全屏放大，数字人不出现（纯PPT讲解）
4. **过渡模式**: 数字人再次出现，PPT缩小回到讲解位置
5. **谢幕模式**: 最后一页数字人出镜做总结

## 快速开始

```bash
# 1. 进入项目目录
cd /path/to/course-project

# 2. 初始化微课项目
opsv new-course "课程名称" --output videospec/

# 3. 运行管线（S0 → S5）
opsv run --course lessons/01-intro

# 4. 验证质量
opsv validate --dir videospec/lessons/01-intro

# 5. 渲染视频
opsv render --course lessons/01-intro --output output.mp4
```

## 与其他 Pack 的关系

- **multi-ref-pack**: 可用于生成背景图、角色形象等视觉资产
- **frameproduction-pack**: 提供 ComfyUI 工作流管理范式参考
- **ops-skills-create**: 提供基础技能开发模板

## 文件结构

```
microlesson-pack/
├── README.md                    # 本文件
├── DESIGN_DECISIONS.md          # 架构决策记录
├── SKILL_SPEC.md               # 技能包规范
├── _category_validate.yaml     # 分类验证规则
├── videospec/                  # 微课项目输出目录
│   ├── course-plan.md          # 课程总计划
│   ├── lessons/                # 各课目录
│   │   └── {lesson_id}/
│   │       ├── metadata.md     # 课程元数据
│   │       ├── slides/         # PPT幻灯片元数据
│   │       ├── dh_plan.md      # 数字人规划
│   │       ├── assets/         # 生成的素材
│   │       │   ├── dh_*.mp4    # 数字人视频
│   │       │   └── bg.png      # 背景图
│   │       └── remotion/       # Remotion 组件
│   │           └── index.tsx
│   └── remotion-src/           # 共享 Remotion 组件库
├── .agent/skills/              # OPSV 技能
│   ├── lesson-planner/
│   ├── ppt-organizer/
│   ├── digital-human-planner/
│   ├── digital-human-generator/
│   ├── remotion-compiler/
│   └── remotion-renderer/
└── comfyui-workflows/          # ComfyUI 工作流
    └── opsv-ltx2.3-digital-human_api.json
```

## 关键设计原则

1. **Remotion 是导演**: 所有场景切换、动画、时序都由 Remotion React 组件控制
2. **数字人是素材**: 通过 LTX2.3 预渲染为 MP4 素材，Remotion 负责合成
3. **PPT 是主角**: 数字人只是辅助，PPT 内容才是核心
4. **模块化**: 每课独立编译，支持批量处理多课
5. **可迭代**: 支持单独重新生成某个数字人视频或某页 PPT 而不影响其他部分

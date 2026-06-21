---
name: graphify-drama
description: 剧本图谱分析 — 提取场景/角色(含龙套)/道具/镜头技巧，生成结构化拆解表 + project.md 风格定调
trigger: /graphify-drama
---

# /graphify-drama

> 基于 graphify 的剧本语义提取和分析工具。
> 使用专用 extraction prompt（`extraction_system.txt`）替代 graphify 默认的代码库 prompt，
> 针对中文剧本/小说脚本提取场景、角色（含龙套）、道具、镜头技巧等实体及其关系。
>
> **产出**: 分析数据 + `videospec/project.md`（项目风格定调）
> **验收**: `opsv validate --dir videospec`（验证 project.md）

## 前置条件

### graphify 安装

本技能依赖 graphify。确认 graphify 已安装：

```
pip install graphify
```

### 自定义 Extraction Prompt

本技能使用专用 extraction prompt（`extraction_prompt.md`），需要 graphify 支持自定义 prompt。

**方法一：环境变量（推荐，需配合 llm.py 补丁）**

```bash
export GRAPHIFY_EXTRACTION_PROMPT_FILE="<本 SKILL 目录>/extraction_system.txt"
```

补丁方案见 `patch_llm.md`，或手动修改 `graphify/llm.py`：
- 在 `_EXTRACTION_SYSTEM` 赋值后添加：从 `GRAPHIFY_EXTRACTION_PROMPT_FILE` 读取文件内容覆盖

**方法二：直接替换（临时方案）**

编辑 `graphify/graphify/llm.py`，将 `_EXTRACTION_SYSTEM` 变量内容替换为 `extraction_prompt.md` 中的 prompt。

---

## 命令

```
/graphify-script extract [目录] [--backend <backend>]    # 运行 graphify 提取剧本图谱
/graphify-script breakdown [--ep <N>]                    # 从图谱生成拆解表（角色/场景/道具清单）
/graphify-script scenes                                  # 列出所有场景及其关联
/graphify-script characters [--all]                      # 列出所有角色；--all 含龙套
/graphify-script props                                   # 列出所有道具及使用关系
/graphify-script query "<问题>"                          # 关系查询（角色关联/道具流转/场景链）
/graphify-script scene <scene_id>                        # 查看特定场景的完整关联
/graphify-script character <角色名>                       # 查看特定角色的完整关联
/graphify-script report                                  # 生成分析报告
/graphify-script stats                                   # 统计摘要
```

---

## 命令详解

### `/graphify-script extract [目录] [--backend <backend>]`

**用途**：运行 graphify 语义提取，生成剧本知识图谱。

**流程**：
1. 确认 `GRAPHIFY_EXTRACTION_PROMPT_FILE` 已设置
2. 运行 `graphify <目录> --backend <backend> --no-viz`
3. 等待提取完成，确认 `graphify-out/graph.json` 已生成
4. 输出统计摘要

**参数**：
- `目录`：剧本所在目录，默认当前目录
- `--backend`：LLM 后端，默认 ollama。支持：ollama, deepseek, kimi, gemini, claude, openai

**示例**：
```
/graphify-script extract . --backend ollama
/graphify-script extract /path/to/script --backend deepseek
```

**输出**：
```
[graphify-script] 提取完成
  实体: 78 nodes (scene:12, character:35, prop:15, location:8, shot_technique:5, episode:3)
  关系: 156 edges
  社区: 6 communities
  报告: graphify-out/GRAPH_REPORT.md
```

---

### `/graphify-script breakdown [--ep <N>]`

**用途**：从图谱提取结构化拆解表，供 `beat-script` 参考。

**流程**：
1. 读取 `graphify-out/graph.json`
2. 按 entity type 分类整理：
   - **角色表**：全部 character 节点，按登场频次（degree）排序
   - **场景表**：全部 scene 节点，按 episode 分组
   - **道具表**：全部 prop 节点，标注使用者
   - **地点表**：全部 location 节点
   - **镜头技巧**：全部 shot_technique 节点
3. 输出为 markdown 表格

**示例**：
```
/graphify-script breakdown

# 剧本拆解表

## 角色清单 (35)
| 角色 | 类型 | 登场集 | 登场场景数 | 关联道具 |
|------|------|--------|-----------|---------|
| 陆然 | 主角 | 全剧 | 12 | 婚碑, 龙珠, 沧澜剑诀 |
| 云璃 | 主角 | 1-10 | 8 | 凤血晶 |
| 玄微 | 反派 | 1-8 | 6 | 玄焰熔炉, 噬心咒 |
| 官员甲 | 龙套 | 2 | 1 | - |
| 黑衣人 | 龙套 | 5,7-8 | 3 | - |
...

## 场景清单 (12)
| 场景 | 集 | 地点 | 角色数 | 道具 |
|------|---|------|--------|------|
| 1-1 日/外 宗庙禁地 | 1 | 宗庙禁地 | 4 | 婚碑, 玄焰熔炉 |
...

## 道具清单 (15)
| 道具 | 类型 | 使用者 | 首次出现 |
|------|------|--------|---------|
| 婚碑 | 法器 | 陆然 | 第一集 |
...
```

---

### `/graphify-script scenes`

列出所有场景节点，标注所属集、地点、出现角色数。

```
/graphify-script scenes

第一集 (3 场景):
  scene_1-1  日/外 宗庙禁地           [4角色] 陆然,云璃,玄微,禁军
  scene_1-2  日/外 宗庙禁地·光幕      [2角色] 幼年云璃,幼年陆然
  ...

第二集 (2 场景):
  ...
```

---

### `/graphify-script characters [--all]`

列出全部角色（默认显示主要角色，`--all` 包含龙套）。

```
/graphify-script characters --all

主角 (2):
  char_luran    陆然       登场:12场景  关联道具:5  互动角色:8
  char_yunli    云璃       登场:8场景   关联道具:2  互动角色:5

反派 (2):
  char_xuanwei  玄微       登场:6场景   关联道具:3  互动角色:4
  ...

龙套 (8):
  char_guanyuanjia   官员甲    登场:1场景
  char_guanyuanyi    官员乙    登场:1场景
  char_jinjun        禁军      登场:2场景
  char_heimengren    黑衣人    登场:3场景
  ...
```

---

### `/graphify-script props`

列出全部道具，标注使用者、首次出现集、关联场景。

```
/graphify-script props

核心道具 (5):
  prop_hunbei         婚碑         使用者:陆然       首现:ep_01  关联场景:4
  prop_longzhu        龙珠         使用者:陆然       首现:ep_01  关联场景:3
  prop_xuanyanronglu  玄焰熔炉     使用者:玄微       首现:ep_01  关联场景:2
  prop_fengxuejing    凤血晶       使用者:云璃,天凤  首现:ep_03  关联场景:2
  prop_longmai        龙脉         使用者:-         首现:ep_01  关联场景:3

次要道具 (10):
  prop_canglanjianjue 沧澜剑诀     使用者:陆然       首现:ep_04
  ...
```

---

### `/graphify-script query "<问题>"`

图形化查询，走 graphify 的 BFS/DFS 引擎。

```
/graphify-script query "婚碑和龙脉是什么关系"
/graphify-script query "陆然用过哪些道具"
/graphify-script query "哪些角色出现在宗庙禁地"
```

---

### `/graphify-script scene <scene_id>`

查看特定场景的完整关联图。

```
/graphify-script scene scene_1-1

## 场景: 1-1 日/外 宗庙禁地

### 角色
  - char_luran (陆然) — appears_in, speaks_in
  - char_yunli (云璃) — appears_in, speaks_in
  - char_xuanwei (玄微) — appears_in, speaks_in
  - char_jinjun (禁军) — appears_in

### 道具
  - prop_hunbei (婚碑) — 云璃要砸碎, 陆然解释镇压妖族
  - prop_xuanyanronglu (玄焰熔炉) — 玄微使用, 吸入陆然

### 地点
  - loc_zongmiaojindi (宗庙禁地) — set_in

### 镜头技巧
  - tech_vo (VO) — shot_with: 陆然画外音
  - tech_zimu (字幕) — shot_with: 字幕标注角色身份

### 过渡
  → scene_1-2 (光幕回忆)
```

---

### `/graphify-script character <角色名>`

查看特定角色的完整关联图。

```
/graphify-script character 陆然

## 角色: 陆然 | 主角·龙族 | 全剧

### 登场场景 (12)
  scene_1-1, scene_1-2, scene_2-1, scene_2-2, ...

### 使用/拥有的道具 (5)
  prop_hunbei (婚碑) — owns, uses
  prop_longzhu (龙珠) — owns
  prop_canglanjianjue (沧澜剑诀) — uses
  ...

### 互动角色 (8)
  char_yunli (云璃) — interacts_with, opposes
  char_xuanwei (玄微) — opposes
  char_tianfeng (天凤) — interacts_with
  ...

### 镜头技巧
  tech_vo (VO) — 画外音叙事
```

---

### `/graphify-script report`

读取 `graphify-out/GRAPH_REPORT.md`，用中文翻译为叙事层面的分析。

```
/graphify-script report

# 剧本图谱分析报告

## God Nodes（结构枢纽）
- 陆然 (degree: 12) — 连接所有主要社区，是叙事中心
- 婚碑 (degree: 8) — 连接龙族、皇室、妖族三条线
- 云璃 (degree: 6) — 连接皇室、凤族、复仇线

## 社区结构
- C0: 陆然阵营（陆然、龙珠、沧澜剑诀、修罗剑）
- C1: 皇室阵营（云璃、玄微、玄文帝、玄焰熔炉）
- C2: 婚碑-龙脉体系（婚碑、龙脉、海底妖族）
- C3: 凤族体系（天凤、凤血晶、凤凰本相）

## Surprising Connections（意外关联）
- 陆然 ↔ 天凤：跨阵营关联，暗示龙族-凤族深层关系
- 婚碑 ↔ 云璃：既是镇压也是婚约，双重绑定

## 建议关注
- 婚碑作为连接最多社区的节点，拆解时应重点展开其视觉呈现
- 龙套角色（官员甲、黑衣人）虽节点小，但提供了故事背景信息
```

---

### `/graphify-script stats`

快速统计。

```
/graphify-script stats

实体: 78
  场景(scene):     12
  角色(character): 35 (主角2, 反派2, 配角5, 龙套26)
  道具(prop):      15
  地点(location):   8
  镜头技巧(shot_technique): 5
  集(episode):      3

关系: 156
  角色→场景(appears_in):  68
  角色↔角色(interacts_with): 32
  角色→道具(uses/owns):     18
  场景→地点(set_in):        12
  场景↔场景(transitions_to): 10
  其他:                     16

社区: 6
平均节点度数: 4.0
```

---

## 与 OPSV Pipeline 对接

`graphify-drama` 的输出直接供给 OPSV 拆解流水线：

```
graphify-drama extract
        │
        ├──→ 分析数据（实体/关系/报告）
        │
        └──→ project.md（风格定调）
                 │
                 ▼
        beat-script (S2)  ← Beat 拆解，读取 project.md 风格
```

### project.md（本技能产出）

完成语义提取后，基于剧本的基调（时代背景、叙事风格、情感氛围）确定项目视觉风格，生成 `videospec/project.md`。

```yaml
---
category: multi_ref_breakdown
status: drafting
title: "<项目名>"
style: anime | realistic | 3d-render
created: "<YYYY-MM-DD>"
---

## 核心角色

<!-- graphify 区分主角/反派/配角 vs 龙套，核心角色在此列出。龙套不列。 -->

| ID | 角色名 | 类型 | 一句话描述 |
|----|--------|------|-----------|
| LuRan | 陆然 | 主角 | 红衣龙族高手，头顶龙角，体内蕴龙珠 |
| YunLi | 云璃 | 主角 | 大玄女帝，玄黑衮服，凤凰本相残缺左翼 |
| XuanWei | 玄微 | 反派 | 国师，月白法袍，手持拂尘，觊觎龙丹 |
| MoYu | 莫雨 | 配角 | 白衣女剑客，陆然徒弟，身怀修罗剑 |

## 风格定调

- **style**: anime | realistic | 3d-render
- **时代背景**: <一句话>
- **叙事调性**: <紧张/史诗/温柔/暗黑...>
- **色彩基调**: <暖/冷/高饱和/低饱和...>
```

### 对 beat-script (S2) 的支撑

| 维度 | 纯 LLM 拆解 | graphify-script + LLM |
|------|-----------|----------------------|
| 角色完整性 | 可能遗漏龙套 | 图谱保证全部提取 |
| 道具追踪 | 靠 LLM 记忆 | 图谱记录使用链 |
| 跨集一致性 | 逐集独立，可能矛盾 | 图谱统一视角 |
| 关系查询 | 依赖 LLM 推理 | BFS/DFS 精确遍历 |
| 社区发现 | 无 | Leiden 算法自动聚类 |

---

## 提取质量对比（以 Dragon_Ball 测试为例）

| 指标 | 默认 prompt | 剧本专用 prompt（预期） |
|------|-----------|---------------------|
| 实体数 | 15 | 60-90 |
| 角色 | 4（仅主要） | 20-35（含全部龙套） |
| 道具 | 4 | 10-15 |
| 场景 | 0（不识别） | 10-15 |
| 镜头技巧 | 0 | 4-8 |
| 关系数 | 12 | 120-200 |
| 社区 | 5 | 6-8 |
| 孤岛节点 | 11/15 (73%) | 预计 < 20% |

---

## 文件结构

```
<剧本项目>/
  script.md                   ← 剧本文件（或 chapters/ 目录）
  graphify-out/               ← graphify 生成（不手动编辑）
    graph.json
    graph.html
    GRAPH_REPORT.md
  .graphifyignore             ← 排除 graphify-out/
```

---

## 已知限制

1. **单文件提取**：当前 graphify 将 `.md` 识别为 `DOCUMENT` 类型，按 token_budget 打包。大剧本需关注截断（默认 20000 字符/文件）。
2. **龙套同名合并**：如果多个龙套使用相同描述（如"禁军"在多集出现），graphify 的 label 去重机制可能将它们合并为一个节点。需要手动 review。
3. **镜头技巧识别依赖 LLM 阅读理解**：VO/OS/闪回等技巧需要 LLM 准确理解剧本格式标注。
4. **社区标签**：graphify 的 community labeling 需要单独的 LLM 调用，需要后端有对应的默认模型。

---

## 这 7 个关切在本技能如何贯彻

> 本技能是管线中最特殊的一环：**不直接使用 OPSV 命令进行编译/执行**，而是基于外部 `graphify` Python 库解析剧本。以下在 OPSV 体系框架内映射其行为。

### ① 生产流程
- **输入**：用户提供的剧本 `.md` 文件或目录
- **处理**：调用 `graphify extract` 提取实体/关系 → `graphify scenes` 分幕 → `graphify characters/props` 细化
- **产出**：`graphify-out/graph.json`（知识图谱） + `videospec/project.md`（项目风格定调）
- 本技能完成后 Agent 带着 `project.md` + `graph.json` 进入 S2 beat-script

### ② 依赖处理
- 本技能是 S1，**无上游 OPSV 文档依赖**
- `videospec/project.md` 产出后可用 `opsv validate --category project` 检查基本字段
- 本技能不参与 Circle DAG（不产出 refs 指向或被指向的内容）

### ③ 提示词生成
- `extraction_prompt.md` 和 `extraction_system.txt` 是 graphify LLM 调用的提示词
- project.md 的 prompt 字段用于后续阶段风格锚定
- **注意**：graphify-drama 不产出 `prompt` 字段给 OPSV 编译使用

### ④ 引用语法
- project.md 中不包含 `refs` 字段
- `graph.json` 中的实体 id 会被 S2 beat-script 用作 `@id` 引用源

### ⑤ 任务环编排
- 本阶段不涉及 `circle create`、`imagen`、`animate` 等 OPSV 命令
- 产出 project.md 后仅需 `opsv validate --category project`

### ⑥ 迭代与 Review
- graphify 提取结果不理想 → 改 `extraction_prompt.md` / 剧本格式 → 重新运行 graphify
- project.md 审阅用 `opsv validate` → 手动 review 内容质量
- 本阶段不使用 `opsv iterate`（无 task JSON 可迭代）

### ⑦ 资产回写
- graphify 产出不写入 `## Approved References`
- project.md 的 status 可由 Agent 手动改为 `approved` 后进入 S2
- 后续阶段的资产回写由各自技能处理

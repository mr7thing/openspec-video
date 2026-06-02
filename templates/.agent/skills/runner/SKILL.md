---
name: opsv-runner
description: Runner-Agent 执行引擎 — Circle 管理、任务编译、物理渲染、审查启动、迭代决策。
---

# Runner-Agent 执行引擎

## 职责边界

**你做**：`opsv circle create/refresh`、`opsv imagen/animate/comfy`、`opsv run`、`opsv review`、`opsv iterate`。

**你不做**：文档创作（Creative）、内容校验（Guardian）。仅当 Guardian 输出放行信号后方可启动。

---

## 准入条件

收到 Guardian 放行信号前，不执行任何操作：

```
✅ GUARDIAN CLEARANCE
approved:  [...]    ← 必须有
blocked:   []       ← 必须为空
```

---

## 标准管线

### 步骤 1：Circle 初始化（首次）

```bash
opsv circle create --dir videospec
```

**产出**：`opsv-queue/videospec_circle1/_manifest.json`

**多剧集**：
```bash
opsv circle create --dir episode_2
```

### 步骤 2：编译任务

```bash
# 图像生成（自动推断当前开放的 Circle，默认跳过已 approved 资产）
opsv imagen --model volcengine.seadream
opsv imagen --model siliconflow.qwenimg
opsv imagen --model minimax.default

# 指定 Circle
opsv imagen --model volcengine.seadream --manifest opsv-queue/videospec_circle1/_manifest.json

# 强制重新生成已 approved 资产
opsv imagen --model volcengine.seadream --no-skip-approved

# 视频生成（自动推断末端 Circle）
opsv animate --model volcengine.seedance
opsv animate --model siliconflow.wan

# ComfyUI 工作流
opsv comfy --model runninghub.default
opsv comfy --model comfylocal.klein9b
```

**产出**：`opsv-queue/videospec_circle{N}/{provider}.{model}_NNN/{id}.json`

> 视频生成不仅限于 shotlist。ComfyUI 工作流（`opsv comfy`）可以对**任意 category** 的文档生成视频，如 4 帧/9 帧工作流配置。`shotlist` 是内置的批量视频编排格式，适用于 prompt→API 管线。

### 步骤 3：执行渲染

```bash
# 单个任务
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/@hero.json

# 整个 provider 目录
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/

# 并发执行
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/ -c 3
```

**行为**：
- 跳过已有产出（`id_1.png` 存在 → 跳过 `id.json`）
- 跳过已有 `_error.log`（除非 `--retry`）
- 产出命名：`id_1.ext`（初始）、`id_2_1.ext`（修改）

### 步骤 4：启动审查

```bash
opsv review                          # 全局模式
opsv review --circle                 # Manifest 模式
opsv review --latest                 # 仅最新 Circle
opsv review --port 3100 --ttl 600    # 自定义端口和超时
```

审查中操作：
- **Approve** → CLI 根据产出文件名自动判断状态
  - `id_1.png` → `status: approved`
  - `id_2_1.png` → `status: syncing`
- **Draft** → `status: drafting` + 记录 `draft_ref`

### 步骤 5：刷新状态

```bash
opsv circle refresh
```

**输出解读**：

| 图标 | 含义 | 决策 |
|------|------|------|
| ⭕ | 无资产被批准 | 执行当前层级的 imagen/animate |
| ⏳ | 部分资产已批准 | 继续完成剩余 → 仍**禁止**编译下游层级 |
| ✅ | 全部已批准 | **允许**在同一 Circle 目录内编译下一层级 |

### 步骤 6：推进到下一层级

ZeroCircle 全部 approved 后，在同一 Circle 目录内对 FirstCircle 资产执行 `opsv imagen --model <m>`。编译产出写入同一 `videospec_circle1/` 目录（新 provider 子目录）。

仅在 `opsv circle refresh` 报告层级结构变化时，才需 `opsv circle create` 新建批次。

---

## 迭代工作流

### 迭代决策指南

Draft 后根据情况选择路径：

| 情况 | 操作 | 命令 |
|------|------|------|
| **仅微调 prompt/seed** | 克隆 task JSON → 编辑 → 重跑 | `opsv iterate task.json` |
| **需修改源文档** | 改 `.md` → 重新编译 | `opsv imagen --no-skip-approved` |
| **需修改 refs** | 改 `.md` refs → 刷新 Circle → 重新编译 | `opsv circle refresh` → `opsv imagen` |
| **批量重试失败** | 重跑失败任务 | `opsv run dir/ --retry` |

### 快速迭代示例

```bash
# 1. 克隆任务（自动递增序号）
opsv iterate opsv-queue/videospec_circle1/volcengine.seadream_001/@hero.json
# → 生成 @hero_2.json

# 2. 编辑 @hero_2.json（改 prompt、seed 等）

# 3. 执行
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001/@hero_2.json
# → 生成 @hero_2_1.png

# 4. 审查
opsv review

# 5. approve 后，Guardian 执行 syncing → approved 对齐
```

**迭代铁律**：修改任务必须用 `opsv iterate`，严禁手动 `cp`。`opsv iterate` 自动清除 `_opsv.compiledAt` 字段。

### 批量迭代

```bash
# 克隆整个 provider 目录
opsv iterate opsv-queue/videospec_circle1/volcengine.seadream_001/
# → 生成 volcengine.seadream_001_it_001/

# 编辑目录内 task JSON → 批量执行
opsv run opsv-queue/videospec_circle1/volcengine.seadream_001_it_001/
```

---

## Draft 回滚流程

审查 Draft 后：

1. 从 review UI 获取驳回原因和 `draft_ref`（失败产出路径）
2. 输出回滚信号给 Creative-Agent：

```
🔄 DRAFT ROLLBACK
asset:     "@shot_01.md"
reason:    "光影过暗，需要增加逆光"
draft_ref: "opsv-queue/videospec_circle2/volcengine.seadream_001/shot_01_1.png"
next: "Creative, please revise"
```

3. Creative 修改完成后 → Guardian 重新校验 → Runner 重新执行

---

## 跨 Circle 迭代

ZeroCircle 资产在 FirstCircle 渲染时发现问题需要修改：

1. 回到 ZeroCircle 源 `.md`，修改 `visual_detailed` / `prompt`
2. Guardian 校验 → Runner 执行：
   ```bash
   opsv imagen --model <m> --no-skip-approved
   opsv run <path>
   opsv review
   ```
3. Guardian 完成 syncing 对齐
4. `opsv circle refresh` 确认 ZeroCircle 恢复 ✅
5. 回到 FirstCircle 继续推进

---

## 快速参考

| 阶段 | 命令 |
|------|------|
| 初始化 Circle | `opsv circle create --dir videospec` |
| 刷新状态 | `opsv circle refresh` |
| 编译图像 | `opsv imagen --model <m>` |
| 编译视频 | `opsv animate --model <m>` |
| 编译 ComfyUI | `opsv comfy --model <m>` |
| 执行渲染 | `opsv run <path/dir>` |
| 启动审查 | `opsv review` |
| 批量审批 | `opsv approved` |
| 克隆迭代 | `opsv iterate <path>` |
| 聚合脚本 | `opsv script` |

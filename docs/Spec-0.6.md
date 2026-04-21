# OpenSpec-Video v0.6.2 Specification

> 从 v0.5.19 到 v0.6.2 的架构升级总览 (从 Spooler 演进为 Circle/Batch 管线)

## 重大变更 (Breaking Changes)

### 1. 从 UUID 队列到 Circle/Batch 透明管线
- **废弃**: `SpoolerQueue.ts` 及 `.opsv-queue/inbox` 物理层级。
- **新增**: `opsv-queue/{CircleFullName}/{Provider}/queue_{N}/` 物理层级。
- **命名规范**:
  - CircleFullName: {WordCircle}_{Index} (例如: zerocircle_1, firstcircle_1)。
  - Word: zerocircle, firstcircle, secondcircle, thirdcircle, fourthcircle, fifthcircle。
- **新增**: BatchManifestManager.ts 用于管理批次清单 (queue.json)。
- **新增**: opsv queue compile 支持 --circle 参数，实现跨 Circle 的依赖隔离。

### 2. 生成流程 (v0.6.2)
- **编译器 (Compiler)**: 产出 StandardTaskIntent JSON，包含纯净的任务描述，不带执行状态。
- **执行器 (Executor)**: QueueWatcher 负责扫描物理批次目录，将意图注入 Provider 并保存执行结果。

### 3. 标准任务意图 (StandardTaskIntent)
Payload 结构定义:
```json
{
  "shotId": "shot_01",
  "type": "image_generation | video_generation",
  "provider": "volcengine",
  "model": "sea_dream_image",
  "prompt": "prompt text...",
  "params": { "size": "1280x720", "steps": 25 },
  "reference_images": ["path/to/img.png"]
}
```

## 核心组件

| 组件 | 路径 | 说明 |
|------|------|------|
| StandardAPICompiler | src/core/compiler/StandardAPICompiler.ts | 意图枢纽，负责参数防御与队列分配 |
| BatchManifestManager | src/core/queue/BatchManifestManager.ts | 批次清单管理与原子任务注册 |
| QueueWatcher | src/executor/QueueWatcher.ts | 物理目录扫描与 Provider 调度 |
| JobGenerator | src/automation/JobGenerator.ts | 结合依赖图自动下发 Circle 任务 |

## 已删除组件
| 组件 | 原路径 | 替代方案 |
|------|--------|----------|
| ImageModelDispatcher | src/executor/ | opsv queue run |
| VideoModelDispatcher | src/executor/ | opsv queue run |
| genImage/genVideo | src/commands/ | opsv queue compile + run |

## 参数防御策略 (Defense)
- **SiliconFlow**: 强制对齐到推荐的分辨率列表（如 1664x928），并对冗余尺寸字段进行清洗。
- **Volcengine**: 自动映射逻辑分辨率（2K）到物理像素，确保符合 API 下限要求。
- **Minimax**: 自动注入提示词优化器设置，增强生成稳定性。

---

## 文档体系
- **项目全景**: docs/cn/01-OVERVIEW.md (待更新)
- **生成流**: forUncle7/generate-flow.md (权威设计)


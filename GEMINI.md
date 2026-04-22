# OpsV v0.6.3 架构镜像

## 核心拓扑
- **Compilers**: `StandardAPICompiler` (AOT 意图产出) -> `BatchManifestManager` (清单注册)
- **Queue**: `opsv-queue/{CircleFullName}/{Provider}/queue_{Batch}/` (物理状态持久化)
- **Executor**: `QueueWatcher` (递归扫描器) -> `Providers` (原子转换器)
- **Review**: `ReviewServer` (批次感知渲染)

## 模块依赖
- `src/core/queue`: 真相源 (Manifest + Pure Intention)
- `src/core/compiler`: 编译器核心 (StandardAPICompiler)
- `src/executor/providers`: 执行末梢 (Stateless Transformer)
- `src/commands`: CLI 交互层 (Cycle-Aware Logic)

## 技术栈
- **Runtime**: Node.js + TypeScript
- **I/O**: fs-extra + Atomic Rename
- **Manifest**: JSON (queue.json)
- **Spec**: Markdown + YAML Frontmatter

## 命名规范 (Circle-Naming)
- `ZeroCircle_N`: 基础资产层 (elements, scenes)
- `FirstCircle_N`: 复合资产层 (shots/image)
- `SecondCircle_N`: 动态生成层 (shots/video)


# CLI 命令速查 (Multi-Ref Pack 版)

> 完整命令树参考 `opsv --help`

---

## 初始化与校验

| 命令 | 说明 |
|------|------|
| `opsv init <name>` | 初始化新项目 |
| `opsv validate` | 校验 videospec/ 下所有文档 |
| `opsv validate --dir <path>` | 校验指定目录 |
| `opsv validate --category <cat>` | 按分类校验 |
| `opsv validate --strict` | 严格模式（warning 报错） |

## Circle 管理

| 命令 | 说明 |
|------|------|
| `opsv circle create --dir videospec` | 创建依赖图+批次目录 |
| `opsv circle refresh --dir videospec` | 刷新状态+拓扑排序 |

## 编译

| 命令 | 说明 |
|------|------|
| `opsv imagen --manifest <m> --category <cat>` | 编译图像任务 |
| `opsv imagen --manifest <m> --file <id>` | 编译单个资产 |
| `opsv animate --manifest <m> --category <cat>` | 编译视频任务 |

## 执行

| 命令 | 说明 |
|------|------|
| `opsv run <task.json...>` | 执行任务 |
| `opsv iterate <path>` | 迭代重做（不覆盖历史） |

## 审阅与审批

| 命令 | 说明 |
|------|------|
| `opsv review --circle` | 本地审阅 |
| `opsv approved --file "@id1,@id2"` | 批量审批 |
| `opsv refs check` | 检查 refs 一致性 |
| `opsv refs sync` | 自动填充 refs |

## 辅助

| 命令 | 说明 |
|------|------|
| `opsv image-stitch <imgs...> --right --output <out>` | 拼接图片 |
| `opsv comfy-node-mapping --workflow <wf>` | 提取 ComfyUI 节点 |

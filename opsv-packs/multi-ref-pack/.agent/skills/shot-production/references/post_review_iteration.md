# 审阅后迭代流程

> 适用阶段：S4/S5/S5.5/S6 审阅后

---

## 迭代路径

### 路径 A：仅改 prompt（不换参考图）

```
审阅不通过
    ↓
opsv iterate <task_path>   # 在原有任务基础上修改
    ↓
修改 prompt（不改 refs）
    ↓
opsv run <新 task.json>
    ↓
审阅 → approved
```

### 路径 B：改参考图（回上游）

```
审阅发现角色一致性有问题
    ↓
回 S4 修改 @LuRan-multiview 资产
    ↓
审阅 → syncing → asset_id 回写
    ↓
回到 S5/S5.5/S6 → 更新 refs
    ↓
opsv iterate → 重新生成
```

### 路径 C：改分镜（结构问题）

```
审阅发现构图不流畅
    ↓
回 S5 修改 storyboard prompt
    ↓
重新生成分镜草图
    ↓
回到 S6 → 更新参考图 refs
    ↓
opsv animate → 重新生成视频
```

## 迭代后文件命名（OPSV 内置规则）

OPSV 以任务 JSON 的文件名为基础自动命名产物，无需手动指定：

| 轮次 | 文件名 | 说明 |
|------|--------|------|
| 第 1 版 | `{任务json名}_1.png` | 首次执行 |
| 第 2 版（重跑） | `{任务json名}_2.png` | 同参数重跑 |
| 修改版 | `{任务json名}_m1_1.png` | iterate 修改任务 JSON 后执行 |
| 修改版再跑 | `{任务json名}_m1_2.png` | 修改后重跑 |

> 迭代时改的是任务 JSON（prompt/duration/seed 等），不是改文档。文档通过 syncing 回写来同步任务 JSON 中的修改。

历史版本不删除，只增不删。

## 迭代 vs 回写

| 动作 | 说明 |
|------|------|
| `opsv iterate <task>` | 修改任务文件并重新生成 |
| `syncing` 状态 | 任务文件有修改，需回写到源文档 |
| 回写后 `approved` | 迭代最终结束 |

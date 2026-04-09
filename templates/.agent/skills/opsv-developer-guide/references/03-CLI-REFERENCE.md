# CLI 命令参考 (v0.5)

## 命令总览

| 命令 | 说明 | 阶段 |
|------|------|------|
| `opsv init` | 初始化项目结构 | 项目启动 |
| `opsv generate` | 编译文档为图像生成任务 | 图像管线 |
| `opsv gen-image` | 执行图像生成（调用 API） | 图像管线 |
| `opsv review` | 启动 Review 页面服务 | 审阅 |
| `opsv deps` | 分析资产依赖关系 | 分析 |
| `opsv animate` | 编译 Shotlist 为视频任务 | 视频管线 |
| `opsv gen-video` | 执行视频生成（调用 API） | 视频管线 |
| `opsv daemon` | 全局后台服务管理 | 基础设施 |

## opsv init

初始化 OpsV 项目结构。

```bash
opsv init
```

创建目录结构：
```
videospec/
├── elements/       # 元素文档
├── scenes/         # 场景文档
├── shots/          # 分镜文档
└── project.md      # 项目配置
.env/
├── secrets.env     # API 密钥
└── api_config.yaml # 模型配置
```

## opsv generate

编译 Markdown 文档为图像生成任务 (`jobs.json`)。

```bash
# 编译全部规范目录
opsv generate

# 编译指定目录或文件
opsv generate videospec/elements

# 预览模式（仅生成第一个分镜）
opsv generate -p

# 指定分镜
opsv generate --shots 1,5,12
```

**v0.5 变更**:
- 集成 DependencyGraph 严格模式，依赖未 approved 的任务自动阻塞
- 集成编译期通用校验（双引号清洗、必填字段检查）
- Script.md 从正文 `## Shot NN` 解析，不再读 frontmatter `shots[]`
- 输出带批次号的 `jobs_batch_N.json`

### 选项

| 选项 | 说明 |
|------|------|
| `-p, --preview` | 预览模式，仅生成第一个分镜 |
| `--shots <list>` | 逗号分隔的分镜 ID 列表 |

## opsv gen-image

执行图像生成任务。

```bash
# 使用所有启用的模型
opsv gen-image

# 指定模型
opsv gen-image -m flux-pro

# 多模型逗号分隔
opsv gen-image -m flux-pro,sdxl

# 仅校验不执行
opsv gen-image --dry-run

# 跳过失败任务继续执行
opsv gen-image -s
```

**v0.5 变更**:
- 新增 `--dry-run` 模式，仅做两阶段校验
- 执行前自动进行模型特定校验（像素约束、宽高比、Prompt 长度）
- 支持逗号分隔的多模型指定

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-m, --model <model>` | 目标模型（逗号分隔，或 "all"） | `all` |
| `-c, --concurrency <num>` | 并发数 | `1` |
| `-s, --skip-failed` | 跳过失败任务继续执行 | `false` |
| `--dry-run` | 仅校验不执行 | `false` |

## opsv review

**v0.5 全新**: 启动本地 Review 页面服务。

```bash
# 启动 Review 服务（默认端口 3456）
opsv review

# 指定端口
opsv review -p 8080

# 指定批次号
opsv review -b 3
```

Review 页面功能：
- 📸 按 Job 分组展示候选图（支持多模型对比）
- ✅ 多选 Approve（支持自定义变体名，默认使用序号）
- 📋 格式检查（检测 frontmatter 缺失字段）
- 🔄 自动 `git commit`

Approve 操作自动执行：
1. 复制选中图片到 `artifacts/` 并重命名
2. 回写 `## Approved References` 到源文档
3. 更新 `status: approved`
4. 追加 `reviews` 记录
5. 执行 `git add . && git commit`

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 服务端口 | `3456` |
| `-b, --batch <num>` | 指定批次号（默认最新） | 最新 |

## opsv deps

**v0.5 新增**: 分析资产依赖关系，显示推荐生成顺序。

```bash
opsv deps
```

输出示例：
```
📊 依赖图分析:

  ✅ elder_brother (无依赖)
  ⚠️ younger_brother (依赖 elder_brother)
  ✅ classroom (无依赖)

推荐生成顺序:
  第1批: elder_brother, classroom (无依赖，可立即生成)
  第2批: younger_brother

已保存: .opsv/dependency-graph.json
```

## opsv animate

编译 Shotlist.md 为视频生成任务。

```bash
opsv animate
```

**v0.5 变更**:
- 从 Shotlist.md 正文 `## Shot NN` 解析（优先）
- 使用 `frame_ref` 替代 `schema_0_3`
- 删除 `middle_image`（无实际 API 支持）

## opsv gen-video

执行视频生成任务。

```bash
# 使用所有启用的视频模型
opsv gen-video

# 指定模型
opsv gen-video -m seedance
```

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-m, --model <model>` | 目标模型 | `all` |
| `-s, --skip-failed` | 跳过失败任务 | `false` |

## opsv daemon

全局后台服务管理。

```bash
opsv daemon start    # 启动
opsv daemon stop     # 停止
opsv daemon status   # 查看状态
```

## 典型工作流

```bash
# 1. 初始化
opsv init

# 2. 编写文档（elements/*.md, scenes/*.md, Script.md）

# 3. 分析依赖
opsv deps

# 4. 编译任务
opsv generate

# 5. 执行图像生成
opsv gen-image --dry-run     # 先校验
opsv gen-image               # 再执行

# 6. 审阅 & Approve
opsv review                  # 打开浏览器 http://localhost:3456

# 7. 迭代（回到步骤 4，依赖图会自动更新）

# 8. 视频管线
opsv animate
opsv gen-video
```

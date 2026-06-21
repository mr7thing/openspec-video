# OpsV CLI (videospec) — 项目核心理解

> 基于对代码库、分支变更及架构的深入审查，2026-05-28

---

## 1. 项目定位

**OpsV CLI**（npm 包名 `videospec`）是一个 AI 视频生成工作流管理工具。它解决的核心问题是：**用 AI 生成视频/图片是一个多轮、多模型、多产出物的过程，需要系统化的素材管理、质量审查和迭代追踪。**

类比：如果把单次 AI 图片生成比作 `git commit`，OpsV 就是 `git` + `GitHub PR review` 的结合体——它管理生成产物的生命周期，提供可视化审查界面，并将审查决策写回源文档形成闭环。

---

## 2. 核心概念

### 2.1 Circle（圈）

Circle 是一次批量生成任务的容器。一个 circle 包含多个 asset（素材），每个 asset 可能由不同 AI provider 生成。Circle 的元数据存储在 `opsv-queue/<circle-name>/_manifest.json` 中。

```
opsv-queue/
  circle-dragon-pearl/
    _manifest.json          ← circle 元数据
    runninghub.img01_003/   ← provider 产出目录
      dragon_pearl_1.png
      dragon_pearl_2.png
    minimax.img02_001/
      dragon_pearl_v2.mp4
```

### 2.2 Document（文档）— 单一事实来源

每个素材对应一个 Markdown 文档，位于 `videospec/` 目录下。文档的 **YAML frontmatter** 是素材状态的权威记录：

```yaml
---
status: approved          # drafting | syncing | approved
prompt: "一条龙叼着珍珠..."
model: minimax
reviews:
  - timestamp: "2026-05-28T10:00:00Z"
    action: approved
    outputFile: "dragon_pearl_1.png"
    note: "光影效果好，通过"
---
# 龙珠素材

## Approved References
![dragon_pearl_1](path/to/file)
```

### 2.3 Queue（队列）

`opsv-queue/` 是所有生成产物的存放目录。每个 circle 是一个子目录，circle 内的每个 provider-task 组合又是一个子目录。审查通过后，产出物从 queue 被"提升"到 document body 中的引用区。

### 2.4 Review（审查）

审查是 OpsV 的核心闭环：生成 → 可视化审查 → 决策（通过/反馈/修订）→ 状态写回 frontmatter → 下次生成时携带上下文。

---

## 3. 架构分层

```
┌─────────────────────────────────────────┐
│  CLI Commands (commander.js)            │
│  review / run / circle / login / ...    │
├─────────────────────────────────────────┤
│  Core Services                          │
│  ManifestReader  ApproveService         │
│  ReviewStrategy   FrontmatterParser     │
│  RefResolver      RefBinder             │
├─────────────────────────────────────────┤
│  Executor                               │
│  QueueRunner → BaseApiProvider          │
│  → RunningHub / Minimax / SiliconFlow   │
│    / Volcengine / ComfyLocal            │
├─────────────────────────────────────────┤
│  Review UI (Express)                    │
│  ReviewServer → controllers → middleware│
├─────────────────────────────────────────┤
│  Tunnel Layer                           │
│  CloudClient → TunnelClient (WS)        │
│  CloudflaredManager (cloudflared 隧道)  │
├─────────────────────────────────────────┤
│  Auth Layer                             │
│  CredentialManager  DeviceFlowClient    │
└─────────────────────────────────────────┘
```

### 3.1 CLI 命令层

| 命令 | 功能 |
|------|------|
| `opsv review` | 启动可视化审查服务器（本地或云端隧道） |
| `opsv run` | 执行 circle 的批量生成任务 |
| `opsv circle` | 创建/管理 circle |
| `opsv login` | OAuth Device Flow 登录云端 |
| `opsv validate` | 校验文档 frontmatter 和 refs |
| `opsv init` | 初始化项目结构 |
| `opsv iterate` | 迭代生成（基于审查反馈重新生成） |
| `opsv refs` | 管理 @refs 引用系统 |

### 3.2 Core 服务层

- **ManifestReader**: 读取/写入 `_manifest.json`，管理 circle 中 asset 的状态
- **ApproveService**: 审批操作的业务逻辑——写 frontmatter、更新文档引用、更新 manifest
- **ReviewStrategy**: 两种审查模式——`ManifestReviewStrategy`（按 circle）和 `GlobalReviewStrategy`（跨 circle）
- **FrontmatterParser**: 解析和修改 Markdown 文档的 YAML frontmatter
- **RefResolver / RefBinder**: `@refs` 引用系统——在文档间建立素材引用关系

### 3.3 执行器层

- **QueueRunner**: 按顺序或并行执行 circle 中的所有生成任务
- **BaseApiProvider**: 抽象基类——`submit → poll → download`
- **各 Provider**: 封装不同 AI 平台的 API 差异

### 3.4 Review UI 层

Express 服务器，提供两类接口：

| 路由 | 功能 |
|------|------|
| `/api/documents` | 列出所有文档及 category |
| `/api/documents/:path` | 获取文档内容（含内嵌图片引用） |
| `/api/outputs/:circle/:assetId` | 获取产出物列表 |
| `/api/approve/:circle/:assetId` | 审批通过/反馈/修订 |
| `/api/review-approve` | 跨 circle 审批（Manifest-free 模式） |

### 3.5 隧道层

云端审查的两种路由模式：

```
Tunnel 模式 (默认):            Relay 模式 (降级):
┌──────┐    cloudflared     ┌─────────┐
│ 浏览器 │ ────────────────→ │ cloudflared │ → localhost:3100
└──────┘                    └─────────┘
                             
┌──────┐    WebSocket        ┌─────────┐    HTTP
│ 浏览器 │ ────────────────→ │ OpsV Cloud │ ─────→ CLI (WS client)
└──────┘                    └─────────┘
```

- **CloudflaredManager**: 自动下载并管理 cloudflared 二进制，创建临时隧道
- **TunnelClient**: WebSocket 客户端，将云端请求代理到本地 Express（13 字节自定义帧协议，支持分块传输和访问日志批量上传）
- **CloudClient**: REST API 客户端，管理会话生命周期

---

## 4. 数据流 — 完整生命周期

```
1. 用户创建 circle
   opsv circle create → _manifest.json

2. 用户执行生成
   opsv run → QueueRunner → Provider API → 产出物写入 queue/

3. 用户启动审查
   opsv review → Express 服务器 → 浏览器显示文档 + 产出物

4. 用户做出审查决策
   浏览器 POST /api/approve → ApproveService:
     a. 写 reviewEntry 到 frontmatter
     b. 更新 frontmatter status
     c. 写 approved/design refs 到文档 body
     d. 更新 _manifest.json 中的 asset.status

5. 用户迭代
   opsv iterate → 读取 frontmatter feedback → 重新生成 → 新产出物
```

---

## 5. 云端集成

### 5.1 认证

OAuth 2.0 Device Flow（适合 CLI 工具的无头登录）：

```
CLI                              OpsV Cloud
 │  POST /auth/device-code        │
 │ ← deviceCode, verificationUrl  │
 │  打开浏览器 → 用户登录授权      │
 │  POST /auth/device-token       │  轮询（每 5 秒，最多 10 分钟）
 │ ← accessToken, refreshToken    │
 │  保存到 ~/.opsv/credentials.json (chmod 600)
```

### 5.2 云端审查流程

```
CLI                              OpsV Cloud
 │  opsv review --cloud           │
 │  POST /api/sessions            │
 │ ← sessionId, sessionToken,     │
 │   reviewToken, reviewUrl       │
 │                                │
 │  启动 cloudflared 隧道         │
 │  PUT /api/sessions/:sid/       │
 │    tunnel-url                  │
 │                                │
 │  WebSocket 连接                │
 │ ← 心跳 / 请求代理 / 通知       │
 │                                │
 │  用户 SIGINT                   │
 │  POST /api/sessions/:sid/close │
 │  WS 断开 → cloudflared 停止    │
```

### 5.3 令牌体系（共 5 种）

| 令牌 | 类型 | 用途 | 生命周期 |
|------|------|------|----------|
| `accessToken` | JWT | CLI 访问云端 API | 1 小时 |
| `refreshToken` | JWT | 刷新 accessToken | 30 天 |
| `sessionToken` | 32-byte hex | WebSocket 握手 + HMAC 派生 | 会话期间 |
| `reviewToken` | 16-byte hex | 审查者 URL 访问 (`?t=`) | 可轮换 |
| tunnel access token (`?a=`) | HMAC | 通过 cloudflared 的单次访问 | 5 分钟 TTL，一次性 |

---

## 6. 关键设计决策

### 6.1 Frontmatter 作为状态载体

文档的 YAML frontmatter 是整个系统的事实来源——不依赖数据库。这使得：
- 文档可独立版本控制（git 友好）
- 跨工具可移植（任何编辑器都能读写）
- 审查历史天然附着于素材文档

### 6.2 双模式审查

| 模式 | 触发方式 | 适用场景 |
|------|---------|---------|
| Manifest-driven | `opsv review --circle` | 单 circle 审查，按 manifest 组织 |
| Global | `opsv review` | 跨 circle 浏览，按文档 category 组织 |

### 6.3 Manifest-free 审批（reviewApproveController）

新增的 `reviewApproveController` 不依赖 `_manifest.json`——它直接操作文档 frontmatter + `.review-state.json`。这使得跨 circle 的合并审查成为可能。

### 6.4 隧道帧协议

CLI 和云端之间的 WebSocket 通信使用自定义 13 字节帧头：
```
[type:1B][reqId:4B][payloadLen:4B][chunkIdx:2B][totalChunks:2B][payload...]
```
支持 HTTP 请求代理（type=1）、分块响应（type=2）、心跳（PING=3/PONG=4）、通知（NOTIFY=7）和访问日志批量上传（LOG_BATCH=8）。

---

## 7. 当前分支状态

**分支**: `feat/phase1-3-cloud-lifecycle`（13 commits ahead of main）

| Commit | 内容 |
|--------|------|
| `da4b8ff` | 🔧 修复：调试日志清理、内存泄漏、进程挂起 |
| `811da07` | 🔄 命名重构：snake_case → camelCase，对齐服务端 |
| `1f21363` | ✨ Review UI spec + reviewApproveController |
| `4dc301d` | ✨ RunningHub outputs 端点 + POST 轮询 |
| `1bf70dc` | ✨ buildPayload 支持 context 注入 apiKey |
| `950379f` | 🐛 CloudflaredManager auth header 和错误处理 |
| `7a1f00a` | 🔧 代码结构重构 |
| `57de1c1` | ✨ OAuth Device Flow 登录 |
| `fc00dcf` | 🐛 SIGINT/SIGTERM 清理云端会话 |
| `cbf5f52` | ✨ 云端生命周期命令 + 隧道客户端测试 |
| `b082e8b` | ✨ review --cloud 隧道集成 |

**测试**: 27 套件 / 208 测试 ✅ | **TypeScript**: 编译零错误 ✅

---

## 8. 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Node.js (Bun 构建) |
| 语言 | TypeScript |
| CLI 框架 | commander.js |
| Web 服务器 | Express |
| WebSocket | ws |
| 日志 | winston |
| 测试 | Jest + supertest |
| 隧道 | cloudflared (自动下载) |
| 云端通信 | axios + WebSocket |
| QR 码 | qrcode-terminal |
| 终端 UI | chalk |

---

## 9. 伴生项目

| 项目 | 关系 |
|------|------|
| `opsv-cloud` | 云端服务——会话管理、隧道中继、OAuth 认证、支付/订阅 |
| `compound-engineering-plugin` | AI 编码工作流——`ce-brainstorm`、`ce-plan`、`ce-code-review` 等 |

客户端 (`openspec-video`) 和服务端 (`opsv-cloud`) 的 API 契约必须保持同步——当前两个分支已完成命名对齐（camelCase），需同步部署。

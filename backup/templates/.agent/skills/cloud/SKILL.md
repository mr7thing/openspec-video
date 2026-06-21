---
name: opsv-cloud
description: OpsV Cloud 工作流 — OAuth 登录、云端隧道审查、会话管理。
---

# Cloud 工作流

## 概述

OpsV Cloud 允许将本地审查服务器通过安全隧道暴露到公网，实现远程协作审查。支持两种路由模式：

| 模式 | 原理 | 适用 |
|------|------|------|
| **Tunnel** | cloudflared 创建临时公网 URL，直连本地 | 默认，低延迟 |
| **Relay** | 云端通过 WebSocket 转发流量 | 隧道不可用时的降级方案 |

---

## 首次使用

### 1. 登录

```bash
opsv login
```

OAuth 2.0 Device Flow：
1. CLI 向云端请求设备码
2. 自动打开浏览器 → 输入邮箱密码授权
3. 终端等待轮询 → 收到 access token
4. 凭证加密存储至 `~/.opsv/credentials.json`（权限 600）

**凭证文件字段**：
```json
{
  "email": "user@example.com",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": "2026-05-28T12:00:00.000Z",
  "plan": "pro"
}
```

**Token 生命周期**：access token 1 小时，refresh token 30 天。过期自动刷新。

### 2. 启动云端审查

```bash
opsv review --cloud
```

**流程**：
1. CLI 向云端 POST `/api/sessions` → 获取 sessionId + reviewUrl
2. 自动下载/启动 cloudflared → 创建公网隧道
3. CLI 向云端 PUT `/api/sessions/:sid/tunnel-url` → 报告隧道地址
4. CLI 建立 WebSocket 连接到云端（心跳 + 请求代理）
5. 终端打印审查 URL + QR 码
6. 审查 URL 同时写入 `.opsv-review-url` 文件（防截断）

**输出示例**：
```
Cloud review URL: https://opsv.cloud/s/abc123?t=hex-review-token
Cloud session: abc123
Full URL saved to: .opsv-review-url
[QR code]
```

### 3. 安全机制

- **审查 URL**: `?t=<reviewToken>` — 16 字节 hex，可轮换
- **隧道访问令牌**: `?a=<hmac>` — 基于 sessionToken 的单次使用 HMAC，5 分钟 TTL
- **WebSocket 认证**: 连接时通过 `?token=<sessionToken>` 验证

---

## 会话管理

### 查看会话状态

```bash
opsv review --cloud --status <sessionId>
```

返回 JSON：会话状态、路由模式、流量使用、创建/关闭时间。

### 轮换审查 Token

当审查 URL 泄露或需要刷新访问权限时：

```bash
opsv review --cloud --rotate-review-token <sessionId>
```

轮换后旧 token 立即失效，新 URL 需重新分享。

### 关闭会话

```bash
opsv review --cloud --close <sessionId>
```

清理：WebSocket 断开 → cloudflared 停止 → 会话标记为 closed。

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPSV_CLOUD_URL` | 云端服务地址（默认 `https://opsv.cloud`） |
| `OPSV_CLOUD_API_KEY` | API Key（未登录时的备用认证方式） |

---

## 故障排查

| 症状 | 可能原因 | 解决 |
|------|---------|------|
| `opsv login` 超时 | 设备码过期（10分钟） | 重新运行 `opsv login` |
| `opsv review --cloud` 报 401 | access token 过期 | 重新 `opsv login` |
| 审查 URL 404 | 隧道未建立或会话已关闭 | `opsv review --cloud --status <sid>` 检查 |
| 审查页面打不开 | cloudflared 下载失败或端口冲突 | 检查网络 / 换端口 `--port` |
| 移动端无法访问 | relay 不可用且隧道被墙 | 尝试 `--cloud-url <custom>` 使用自建中继 |
| `--rotate-review-token` 报错 | 会话已关闭或不存在 | 重新 `opsv review --cloud` |

---

## 云端 + CI 集成提示

在 CI 环境中使用 API Key 代替 OAuth 登录：

```bash
export OPSV_CLOUD_URL="https://opsv.example.com"
export OPSV_CLOUD_API_KEY="opsv_xxxxxxxxxxxx"

opsv review --cloud --cloud-url "$OPSV_CLOUD_URL" --cloud-api-key "$OPSV_CLOUD_API_KEY"
```

# OpsV 图像 Provider 接口规范（v0.5.2）

> 本文件记录所有图像生成 Provider 必须遵守的接口契约与接入规范。

---

## 1. 设计理念（方案 A：强制接口）

**v0.5.2 起，`generateAndDownload` 是所有 ImageProvider 唯一的必须方法。**

旧的两步式模式（`generateImage` 返回 URL → Dispatcher 手动下载）已废除。每个 Provider 现在作为完整的"提交-轮询-下载"执行单元，Dispatcher 无需关心内部细节，只调用一个方法，一个承诺。

```
之前（废弃）:
  Dispatcher → provider.generateImage() → result.url
  Dispatcher → download(result.url) → 写盘
  缺陷：Dispatcher 必须知道每个 Provider 的保存策略 → instanceof 死代码

之后（现行）:
  Dispatcher → provider.generateAndDownload(job, model, apiKey, outputPath)
  Provider 内部承担：提交 + 轮询 + 下载 + 写盘
  好处：接口即合约，无 instanceof，无分支，新增 Provider 零侵入
```

---

## 2. 接口定义

```typescript
export interface ImageProvider {
    /** 唯一标识符，对应 api_config.yaml 中的 provider 字段 */
    providerName: string;

    /**
     * 执行完整的图像生成→写盘流程（唯一必须方法）
     *
     * 成功：文件已写入 outputPath，函数正常 resolve
     * 失败：抛出含详细信息的 Error 或 OpsVError
     * 超时：抛出含 "超时" 或 "timeout" 关键词的 Error
     */
    generateAndDownload(
        job: Job,
        modelName: string,
        apiKey: string,
        outputPath: string
    ): Promise<void>;

    /** 可选：能力探针 */
    supportsFeature?(feature: string): boolean;
}
```

---

## 3. 现有 Provider 一览

| Provider 类 | 文件 | 任务类型 | 状态 |
|-------------|------|---------|------|
| `SeaDreamProvider` | providers/SeaDreamProvider.ts | image_generation | ✅ 已实现 generateAndDownload |
| `MinimaxImageProvider` | providers/MinimaxImageProvider.ts | image_generation | ✅ 已实现 generateAndDownload |

---

## 4. 新增 Provider 强制规范

### 4.1 三条铁律（继承自防御性 API 协议）

1. **深度穿透解析**：不假设响应体结构唯一。兼容 `data.id`、`data.data.id` 多种变体，使用防御性代码。
2. **强力证据式日志**：任何非 2xx 或格式异常必须 `JSON.stringify(rawResponse)` 记录完整载荷，禁止模糊 `undefined` 输出。
3. **Axios 防空逻辑**：必须区分 `error.response`（API 业务错误）和 `error.code`（如 `ETIMEDOUT`，网络中断）。

### 4.2 接入步骤清单

```
需要实现：
  ✅ providerName: string（匹配 api_config.yaml 的 provider 字段）
  ✅ generateAndDownload(job, modelName, apiKey, outputPath): Promise<void>
  
  ✅ 内部实现：
     1. 从 job.payload 读取参数
     2. POST 提交生成请求（按官方 API 格式）
     3. 轮询直到完成（建议间隔 3-5 秒，超时抛异常）
     4. 下载图片 Buffer，写入 outputPath
     5. 验证文件存在且大小 > 0

需要注册：
  ✅ 在 ImageModelDispatcher.registerProviders() 中添加
  ✅ 在 api_config.yaml 中配置 provider 字段

禁止：
  ❌ 在 Provider 内部使用 instanceof 检测其他 Provider
  ❌ 返回 ImageGenerationResult（旧接口，已废弃）
  ❌ 让 Dispatcher 知道 URL 下载逻辑
```

### 4.3 超时约定

```typescript
// Provider 内部应自行管理超时
const TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const deadline = Date.now() + TIMEOUT_MS;

while (Date.now() < deadline) {
    const status = await pollStatus(requestId);
    if (status === 'completed') break;
    await sleep(3000);
}

if (Date.now() >= deadline) {
    throw new Error(`生成超时 (${TIMEOUT_MS / 1000}s): ${job.id}`);
    // ↑ 含 "超时" 关键词，Dispatcher 可识别
}
```

---

## 5. Dispatcher 调用协议（内部）

Dispatcher 唯一职责：**路由 + 注入配置 + 统计结果**。

```typescript
// ImageModelDispatcher.dispatchJob 伪码
await provider.generateAndDownload(job, targetModel, apiKey, finalOutputPath);
// 就这一行，无 instanceof，无分支
```

---

> *「接口是合约，文档是保险，测试是证明。」*
> *OpsV v0.5.2 | 更新时间: 2026-04-12*

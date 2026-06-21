# OpsV v0.9.0 重构计划

> 目标：根治技术债务，建立插件化架构，测试覆盖率提升至 80%+
> 原则：不考虑向后兼容，大刀阔斧重构

---

## Phase 1: DI 容器与统一上下文

### 任务
1. 新建 `src/container/` 模块
   - `Container.ts` — 依赖注入容器，管理 Provider/Compiler 注册表
   - `OpsVContext.ts` — 运行时上下文（projectRoot、config、logger）
2. 重构 `ConfigLoader` — 从单例改为普通类，由 Context 持有唯一实例
3. 重构 `cli.ts` — 启动时创建 Context，注册所有 Provider/Compiler
4. 重构 `QueueRunner` — 通过 Container 解析 Provider，不再硬编码
5. 重构 `TaskBuilder` — 通过 Container 解析 Compiler

### 产出
- `src/container/Container.ts`
- `src/container/OpsVContext.ts`
- 修改 `src/cli.ts`, `src/utils/configLoader.ts`
- 修改 `src/executor/QueueRunner.ts`, `src/core/compiler/TaskBuilder.ts`

---

## Phase 2: BaseApiProvider 基类

### 任务
1. 新建 `src/executor/providers/BaseApiProvider.ts`
   - 统一处理：config 加载、API Key 解析、提交、梯度轮询、下载、日志、resume
   - 定义抽象方法：`buildHeaders`、`submitTask`、`parseTaskId`、`queryStatus`、`parseOutputUrl`
2. 重写 Volcengine / SiliconFlow / Minimax / RunningHub / ComfyLocal / Webapp Provider
   - 每个 Provider 只保留差异逻辑（URL 构造、响应解析）
3. 新建 `src/executor/HttpClient.ts` — 统一 Axios 封装（认证、重试、超时、日志）

### 产出
- `src/executor/providers/BaseApiProvider.ts`
- `src/executor/HttpClient.ts`
- 重写 6 个 Provider 文件

---

## Phase 3: 类型安全重构

### 任务
1. 重构 `src/types/Job.ts`
   - `TaskJson` 改为 `BaseTaskJson<TPayload>` 泛型
   - 每个 Provider 定义自己的 Payload 接口
2. 重构 `ProviderCompiler` 接口
   - `compile()` 返回 `BaseTaskJson<unknown>`，运行时由具体 Compiler 决定
3. 消除所有 `as any` 和 `delete (payload as any)._opsv`
   - 使用结构化分离：编译时生成 `{ payload, _opsv }`，不再从同一对象删除字段

### 产出
- 修改 `src/types/Job.ts`
- 修改 `src/core/compiler/ProviderCompiler.ts`
- 修改所有 Compiler/Provider 文件

---

## Phase 4: Review UI 分层

### 任务
1. 拆分 `src/commands/review.ts`
   - `src/review-ui/ReviewServer.ts` — Express app 工厂
   - `src/review-ui/routes.ts` — 路由注册
   - `src/review-ui/controllers/` — 各 API 控制器
   - `src/review-ui/middleware/errorHandler.ts` — 统一错误中间件
2. 错误处理中间件自动映射 `OpsVError.code → HTTP 状态码`

### 产出
- `src/review-ui/ReviewServer.ts`
- `src/review-ui/routes.ts`
- `src/review-ui/controllers/*.ts`
- `src/review-ui/middleware/errorHandler.ts`

---

## Phase 5: 测试覆盖（核心目标）

### 测试矩阵

| 模块 | 测试文件 | 覆盖点 |
|------|---------|--------|
| Container | `container/Container.test.ts` | 注册、解析、生命周期 |
| OpsVContext | `container/OpsVContext.test.ts` | 配置加载、根目录解析 |
| ConfigLoader | `utils/configLoader.test.ts` | YAML 解析、环境变量、错误 |
| DependencyGraph | `core/__tests__/DependencyGraph.test.ts` | 拓扑排序、循环检测、Circle 命名（已存在，扩展） |
| FrontmatterParser | `core/__tests__/FrontmatterParser.test.ts` | 解析、更新、追加 review |
| ApproveService | `core/__tests__/ApproveService.test.ts` | 审批、状态流转、manifest 更新 |
| BaseApiProvider | `executor/providers/BaseApiProvider.test.ts` | 提交、轮询、下载、resume、重试 |
| HttpClient | `executor/HttpClient.test.ts` | 请求、重试、超时、错误转换 |
| QueueRunner | `executor/__tests__/QueueRunner.test.ts` | 分组、并发、跳过、retry |
| TaskBuilder | `core/compiler/__tests__/TaskBuilder.test.ts` | 编译、模型解析、dry-run |
| ReviewServer | `review-ui/__tests__/ReviewServer.test.ts` | API 路由、文件服务、审批 |
| PathSecurity | `utils/__tests__/pathSecurity.test.ts` | 路径遍历防护 |
| Polling | `executor/__tests__/polling.test.ts` | 日志读写、轮询间隔、resume |

### 目标
- 测试文件数：7 → 20+
- 核心模块覆盖率：80%+
- 使用 Jest + ts-jest，mock fs、axios、express

---

## Phase 6: 验证

1. `npm run build` — TypeScript 编译通过
2. `npm test` — 所有测试通过
3. `npm run lint` — ESLint 无错误

---

## 不兼容变更清单

- `ConfigLoader.getInstance()` 已移除，改为通过 `Context.configLoader` 访问
- `TaskJson` 不再是 `{ [key: string]: any }`，改为 `{ payload: T; _opsv: TaskMeta }`
- Provider 构造函数签名变更：接收 `context: OpsVContext`
- `QueueRunner` 构造函数不再硬编码 Provider，改为从 Container 注入

# OpenSpec-Video 改进计划

> 基于 TECHNICAL_ANALYSIS.md 章节 9 的技术债务分析制定

---

## 目标

1. 消除类型安全隐患 (`as any`)
2. 建立标准化错误处理体系
3. 引入结构化日志系统
4. 建立核心模块单元测试覆盖

---

## 阶段一：基础架构改进 (P0)

### 1.1 类型安全增强

**问题**: `JobGenerator.ts` 等多处使用 `as any` 强制类型转换

**改进措施**:
- 为 Job 创建严格的类型守卫函数
- 使用 `satisfies` 运算符替代 `as`
- 修复 WebSocket payload 的 `any` 类型

### 1.2 错误处理标准化

**问题**: 缺乏统一的错误码体系，错误信息格式不一致

**改进措施**:
- 创建 `src/errors/OpsVError.ts` 基类
- 定义错误码枚举 `OpsVErrorCode`
- 所有模块统一抛出 OpsVError

### 1.3 日志系统

**问题**: 直接使用 `console.log/warn/error`

**改进措施**:
- 引入 `winston` 日志库
- 创建 `src/utils/logger.ts`
- 支持分级日志和环境配置

---

## 阶段二：测试覆盖 (P0)

### 2.1 测试框架配置

**文件**: `tests/` 目录

**测试模块**:
1. `AssetCompiler.test.ts` - 资产编译测试
2. `AssetManager.test.ts` - 资产管理测试
3. `JobGenerator.test.ts` - 任务生成测试
4. `PromptSchema.test.ts` - Schema 校验测试
5. `OpsVError.test.ts` - 错误处理测试

### 2.2 Mock 策略

- 文件系统: `mock-fs` 或手动 mock
- WebSocket: `jest-websocket-mock`
- HTTP API: `nock`

---

## 阶段三：代码重构 (P1)

### 3.1 JobGenerator 拆分

将 597 行的 `JobGenerator.ts` 拆分为:
- `BaseJobGenerator.ts` - 基类
- `AssetJobGenerator.ts` - 资产任务生成
- `ShotJobGenerator.ts` - 分镜任务生成
- `PromptAssembler.ts` - 提示词组装

---

## 实施进度

| 阶段 | 状态 | 完成时间 |
|------|------|----------|
| 错误处理体系 | 🚧 进行中 | - |
| 日志系统 | 🚧 进行中 | - |
| 类型安全修复 | 🚧 进行中 | - |
| 单元测试 | 🚧 进行中 | - |

---

## 验证标准

1. ✅ 所有 `as any` 被移除
2. ✅ 测试覆盖率达到 60% 以上
3. ✅ 所有测试用例通过
4. ✅ 无 TypeScript 编译错误
5. ✅ CLI 功能正常

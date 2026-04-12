# OpenSpec-Video v0.5.1 发布说明

**发布日期**: 2026-04-12

## 版本更新摘要

v0.5.1 是 v0.5.0 的安全修复和架构改进版本，包含关键安全漏洞修复、核心模块异步化改造和类型安全改进。

---

## 🔐 安全修复 (Security Fixes)

### 1. 修复命令注入漏洞 (CVE级别: High)
- **文件**: `src/review-ui/server.ts`
- **问题**: 使用 `execSync` 直接拼接用户输入，存在命令注入风险
- **修复**: 
  - 将 `execSync` 替换为 `execFileSync`，使用参数数组
  - 新增输入验证工具 `src/utils/validation.ts`
  - 添加超时保护（30秒）

### 2. 输入验证框架
- **新增文件**: `src/utils/validation.ts`
- **功能**:
  - Git消息验证（移除控制字符和危险shell字符）
  - 模型名称验证（Zod Schema）
  - 安全文件路径验证（防止目录遍历）
  - Shot ID验证
  - 并发数验证

---

## 🏗️ 架构改进 (Architecture Improvements)

### 3. 核心模块异步化改造
- **新增文件**: `src/utils/fileUtils.ts`
  - 完整的异步文件操作工具类
  - 支持批量文件读取、目录遍历
  - 自动创建父目录

- **改造的文件**:
  - `src/core/ApprovedRefReader.ts` - 全异步API
  - `src/core/AssetManager.ts` - 异步加载目录
  - `src/core/AssetCompiler.ts` - 异步配置加载
  - `src/core/SpecParser.ts` - 异步文件读取
  - `src/core/RefResolver.ts` - 异步解析引用

### 4. 类型安全改进
- **文件**: `src/core/DependencyGraph.ts`
  - 将 `as any` 替换为具体联合类型 `'element' | 'scene' | 'shot'`
- **文件**: `src/types/FrontmatterSchema.ts`
  - 移除 `as any` 类型断言
- **文件**: `src/executor/VideoModelDispatcher.ts`
  - 移除不必要的 `as any`

---

## 🐛 错误处理改进 (Error Handling)

### 5. Promise拒绝处理
- **文件**: `src/executor/VideoModelDispatcher.ts`
- **改进**:
  - 新增 `DispatchResult` 接口定义结果结构
  - 为每个 job 添加 try-catch 包装
  - 添加超时机制（默认5分钟）
  - 支持 `failFast` 模式
  - 错误时记录失败原因并继续处理其他 jobs

### 6. 统一错误处理体系
- **新增文件**: `src/errors/OpsVError.ts`
  - `OpsVErrorCode` 枚举 - 定义所有错误码
  - `OpsVError` 基类
  - 专用错误子类
  - `ErrorFactory` 工厂函数

- **新增文件**: `src/utils/errorHandler.ts`
  - `normalizeError()` - 错误标准化
  - `handleError()` - 错误处理
  - `createErrorResponse()` - 错误响应
  - `safeAsync()` - 安全异步包装

---

## 📊 变更统计

| 类别 | 数量 |
|------|------|
| 修改的文件 | 15+ |
| 新增的文件 | 5 |
| 安全漏洞修复 | 1 (Critical) |
| TypeScript错误修复 | 全部 |
| 新增的工具函数 | 30+ |

---

## 🔄 迁移指南

从 v0.5.0 升级到 v0.5.1 不需要任何代码更改。直接更新依赖即可：

```bash
npm update videospec
```

---

## 📝 相关链接

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 详细实施计划
- [FIXES_APPLIED.md](./FIXES_APPLIED.md) - 完整修复清单
- [QUALITY_REVIEW_SUMMARY.md](./QUALITY_REVIEW_SUMMARY.md) - 质量审查报告

---

**维护者**: Uncle7  
**许可证**: MIT

# OpenSpec-Video 代码库问题修复方案

## 概述

本方案针对代码质检发现的问题，提供系统性的修复路径。问题按优先级分为 P0-P4 四个等级。

---

## 🔴 P0 - 关键安全与稳定性问题（1-2天）

### 1. 命令注入安全漏洞 [CRITICAL]

**文件**: `src/review-ui/server.ts:86-95`

**问题代码**:
```typescript
// 危险：直接拼接用户输入到命令
const cmd = `git commit -m "${message}"`;
execSync(cmd);
```

**修复方案**:
```typescript
import { execFileSync } from 'child_process';

// 安全的做法：使用参数数组
execFileSync('git', ['commit', '-m', message], {
    cwd: projectRoot,
    encoding: 'utf-8'
});
```

**验证步骤**:
1. 在 review message 中输入 `"; rm -rf /; "` 测试
2. 确认命令被正确转义

---

### 2. 输入验证缺失 [CRITICAL]

**文件**: 多处 CLI 命令处理

**问题**: 用户输入直接用于文件路径、模型名称等，无白名单验证

**修复方案**:
```typescript
// src/commands/utils.ts - 新建验证工具
import { z } from 'zod';

export const ModelNameSchema = z.enum([
    'flux-pro', 'flux-dev', 'sdxl', 'seedance', 'kling', 'wan2.2-i2v'
]);

export const PathSchema = z.string().regex(/^[a-zA-Z0-9_\-\/\.]+$/);

export const ShotIdSchema = z.string().regex(/^\d+$/);

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
            throw new Error(`验证失败:\n${messages.join('\n')}`);
        }
        throw error;
    }
}
```

---

## 🟠 P1 - 核心功能稳定性（3-5天）

### 3. 未处理的 Promise 拒绝 [IMPORTANT]

**文件**: `src/executor/VideoModelDispatcher.ts:78-92`

**问题代码**:
```typescript
async dispatchAll(jobs: VideoJob[], model: string) {
    // 缺少 try-catch
    const results = await Promise.all(jobs.map(j => this.dispatch(j, model)));
    // 如果有一个失败，整个调用栈崩溃
}
```

**修复方案**:
```typescript
async dispatchAll(jobs: VideoJob[], model: string): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    
    for (const [index, job] of jobs.entries()) {
        try {
            logger.info(`[${index + 1}/${jobs.length}] 调度任务: ${job.id}`);
            const result = await this.dispatchWithTimeout(job, model, 300000); // 5分钟超时
            results.push({ jobId: job.id, status: 'success', result });
        } catch (error) {
            logger.error(`任务 ${job.id} 失败:`, error);
            results.push({ 
                jobId: job.id, 
                status: 'failed', 
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // 根据配置决定是否继续
            if (this.config.failFast) {
                throw new AggregateError([error], `任务 ${job.id} 失败，停止后续任务`);
            }
        }
    }
    
    return results;
}

private async dispatchWithTimeout(job: VideoJob, model: string, timeoutMs: number) {
    return Promise.race([
        this.dispatch(job, model),
        new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`任务超时 (${timeoutMs}ms)`)), timeoutMs)
        )
    ]);
}
```

---

### 4. 同步文件操作阻塞事件循环 [IMPORTANT]

**文件**: 多处使用同步 API

**问题**: 大量使用 `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync`

**修复方案**:
```typescript
// 创建异步文件工具类 src/utils/fileUtils.ts
import { promises as fs, constants } from 'fs';
import path from 'path';

export class FileUtils {
    static async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath, constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    static async readJson<T>(filePath: string): Promise<T> {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }

    static async writeJson(filePath: string, data: unknown): Promise<void> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    static async safeReadFile(filePath: string, defaultContent: string = ''): Promise<string> {
        if (await this.exists(filePath)) {
            return fs.readFile(filePath, 'utf-8');
        }
        return defaultContent;
    }
}
```

---

## 🟡 P2 - 代码质量改进（2-3天）

### 5. any 类型滥用

**修复策略**:
1. 在 `src/types/` 中补充缺失的类型定义
2. 使用 `unknown` 替代 `any`，配合类型守卫
3. 为外部库添加类型声明

```typescript
// 示例：替换 any 类型
// 修改前
function processJob(job: any): any {
    return job.data;
}

// 修改后
import { JobDefinition, JobResult } from '../types';

function processJob(job: unknown): JobResult {
    if (!isValidJob(job)) {
        throw new OpsVError('INVALID_JOB', 'Invalid job structure');
    }
    return job.data as JobResult;
}

function isValidJob(job: unknown): job is JobDefinition {
    return (
        typeof job === 'object' &&
        job !== null &&
        'id' in job &&
        'data' in job
    );
}
```

---

### 6. 错误处理不一致

**修复方案**:
统一错误处理模式：

```typescript
// src/errors/ErrorHandler.ts
import { logger } from '../utils/logger';
import { OpsVError, ErrorCode } from './OpsVError';

export interface ErrorContext {
    operation: string;
    file?: string;
    input?: unknown;
}

export class ErrorHandler {
    static handle(error: unknown, context: ErrorContext): never {
        // 转换未知错误
        const opsvError = this.normalizeError(error, context);
        
        // 记录详细日志
        logger.error(`[${opsvError.code}] ${context.operation} failed:`, {
            error: opsvError.message,
            context,
            stack: opsvError.stack
        });
        
        // 抛出标准化错误
        throw opsvError;
    }
    
    static normalizeError(error: unknown, context: ErrorContext): OpsVError {
        if (error instanceof OpsVError) {
            return error;
        }
        
        if (error instanceof Error) {
            return new OpsVError(
                'OPERATION_FAILED' as ErrorCode,
                `${context.operation}: ${error.message}`,
                { cause: error, context }
            );
        }
        
        return new OpsVError(
            'UNKNOWN_ERROR' as ErrorCode,
            `${context.operation}: Unknown error`,
            { context }
        );
    }
    
    static async withHandling<T>(
        operation: () => Promise<T>,
        context: ErrorContext
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            this.handle(error, context);
        }
    }
}
```

---

## 🔵 P3 - 长期优化（1-2周）

### 7. 架构优化

**God Object 拆分** (`AssetManager.ts`):
- 拆分为 `AssetParser`, `AssetCompiler`, `AssetValidator`, `AssetRepository`

**配置集中管理**:
- 创建 `src/config/` 目录
- 统一配置验证和默认值

---

## 执行计划

### 第1周（关键安全修复）
| 天数 | 任务 | 负责人 |
|------|------|--------|
| 1-2 | 修复命令注入漏洞 | Dev |
| 2-3 | 添加输入验证工具 | Dev |
| 3-4 | 修复未处理的Promise | Dev |
| 4-5 | 添加核心测试覆盖 | Dev + QA |

### 第2周（质量改进）
| 天数 | 任务 | 负责人 |
|------|------|--------|
| 1-2 | 异步化文件操作 | Dev |
| 2-3 | 消除 any 类型 | Dev |
| 3-4 | 统一错误处理 | Dev |
| 4-5 | 代码审查和合并 | Tech Lead |

---

## 验证清单

修复完成后，确认以下项目：

- [ ] 命令注入测试通过（尝试 `"; rm -rf /; "`）
- [ ] 所有测试用例通过 (`npm test`)
- [ ] 代码覆盖率 > 80%
- [ ] TypeScript 严格模式无错误
- [ ] Lint 无警告 (`npm run lint`)
- [ ] 手动测试所有 CLI 命令

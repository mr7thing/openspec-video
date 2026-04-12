# OpenSpec-Video 问题修复实施计划

## 第一阶段：安全漏洞修复（1-2天）

### 1.1 修复命令注入漏洞

**文件**: `src/review-ui/server.ts`

**修复步骤**:
1. 将所有 `execSync` 替换为 `execFileSync` 或参数化调用
2. 对用户输入进行白名单验证
3. 添加错误处理

**代码变更**:
```typescript
// 修复前
import { execSync } from 'child_process';

const cmd = `git commit -m "${message}"`;
execSync(cmd, { cwd: projectRoot });

// 修复后
import { execFileSync } from 'child_process';
import { validateGitMessage } from '../utils/validation';

// 验证消息
const sanitizedMessage = validateGitMessage(message);
if (!sanitizedMessage) {
    throw new OpsVError('INVALID_INPUT', 'Git message contains invalid characters');
}

// 安全执行
execFileSync('git', ['commit', '-m', sanitizedMessage], {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 30000
});
```

### 1.2 添加输入验证工具

**新建文件**: `src/utils/validation.ts`

```typescript
import { z } from 'zod';

// Git消息验证
export function validateGitMessage(message: unknown): string | null {
    if (typeof message !== 'string') return null;
    
    // 移除控制字符和危险字符
    const sanitized = message
        .replace(/[\x00-\x1F\x7F]/g, '')  // 控制字符
        .replace(/[`$&|;<>]/g, '')       // 危险shell字符
        .trim();
    
    // 长度限制
    if (sanitized.length === 0 || sanitized.length > 1000) {
        return null;
    }
    
    return sanitized;
}

// 模型名称验证
export const ModelNameSchema = z.enum([
    'flux-pro', 'flux-dev', 'flux-schnell',
    'sdxl', 'sdxl-lightning',
    'seedance', 'kling', 'wan2.2-i2v',
    'minimax-image', 'minimax-video'
]);

// 文件路径验证
export const SafePathSchema = z.string()
    .regex(/^[a-zA-Z0-9_\-\/\.]+$/, 'Path contains invalid characters')
    .refine(
        path => !path.includes('..'),
        'Path cannot contain parent directory references'
    );

// Shot ID验证
export const ShotIdSchema = z.string().regex(/^\d+$/, 'Shot ID must be numeric');

// 导出的验证函数
export function validateModelName(model: unknown): string {
    return ModelNameSchema.parse(model);
}

export function validateFilePath(path: unknown): string {
    return SafePathSchema.parse(path);
}

export function validateShotId(id: unknown): string {
    return ShotIdSchema.parse(id);
}
```

### 1.3 修复未处理的 Promise 拒绝

**文件**: `src/executor/VideoModelDispatcher.ts`

```typescript
// 修复后的 dispatchAll 方法
async dispatchAll(jobs: VideoJob[], model: string): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    
    logger.info(`开始调度 ${jobs.length} 个视频生成任务，模型: ${model}`);
    
    for (const [index, job] of jobs.entries()) {
        try {
            logger.info(`[${index + 1}/${jobs.length}] 处理任务: ${job.id}`);
            
            // 验证任务
            this.validateJob(job);
            
            // 执行调度，带超时
            const result = await this.dispatchWithTimeout(job, model, 300000);
            results.push({ jobId: job.id, status: 'success', result });
            
            logger.info(`任务 ${job.id} 完成`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`任务 ${job.id} 失败:`, errorMessage);
            
            results.push({ 
                jobId: job.id, 
                status: 'failed', 
                error: errorMessage 
            });
            
            // 根据配置决定是否继续
            if (this.config.failFast) {
                throw new OpsVError(
                    'DISPATCH_FAILED',
                    `任务 ${job.id} 失败，根据 failFast 配置停止后续任务`,
                    { cause: error }
                );
            }
        }
    }
    
    // 生成摘要
    const summary = this.generateSummary(results);
    logger.info('调度完成:', summary);
    
    return results;
}

private dispatchWithTimeout<T>(
    job: VideoJob, 
    model: string, 
    timeoutMs: number
): Promise<T> {
    return Promise.race([
        this.dispatch(job, model) as Promise<T>,
        new Promise<never>((_, reject) => 
            setTimeout(() => 
                reject(new OpsVError('TIMEOUT', `任务执行超时 (${timeoutMs}ms)`)), 
                timeoutMs
            )
        )
    ]);
}
```

---

## 🟠 P2 - 代码质量改进（2-3天）

### 2.1 异步化文件操作

**文件**: `src/core/AssetCompiler.ts`, `src/core/SpecParser.ts` 等

**批量替换策略**:

```typescript
// 步骤 1: 使用 FileUtils 工具类
import { FileUtils } from '../utils/fileUtils';

// 替换前
if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // ...
}

// 替换后
if (await FileUtils.exists(filePath)) {
    const content = await FileUtils.readFile(filePath);
    // ...
}
```

**迁移优先级**:
1. `src/core/*.ts` - 核心引擎（最高优先级）
2. `src/executor/*.ts` - 执行器
3. `src/automation/*.ts` - 自动化
4. `src/commands/*.ts` - CLI 命令

---

### 2.2 消除 any 类型

**策略**: 分阶段消除

**阶段 1 - 高优先级文件**:
- `src/core/AssetCompiler.ts`
- `src/automation/JobGenerator.ts`
- `src/executor/ImageModelDispatcher.ts`

**示例转换**:
```typescript
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
    return job.data;
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

## 🟡 P3 - 架构优化（5-7天）

### 3.1 拆分 God Object

**文件**: `src/core/AssetManager.ts`

**拆分方案**:
```
AssetManager (当前)
├── AssetParser      - 解析资产文件
├── AssetCompiler    - 编译资产引用
├── AssetValidator   - 验证资产完整性
├── AssetRepository  - 资产持久化
└── AssetResolver    - 资产路径解析
```

---

## 📝 验证清单

每个修复完成后，执行以下验证：

### 安全修复
- [ ] 命令注入测试通过 (`"; rm -rf /; "`)
- [ ] 输入验证拒绝非法字符
- [ ] 文件路径验证阻止目录遍历 (`../etc/passwd`)

### 功能测试
- [ ] 所有单元测试通过 (`npm test`)
- [ ] 代码覆盖率 > 80%
- [ ] TypeScript 严格模式无错误
- [ ] Lint 无警告 (`npm run lint`)

### 集成测试
- [ ] `opsv init` 正常工作
- [ ] `opsv generate` 正确编译
- [ ] `opsv gen-image` 正常调用API
- [ ] `opsv review` 服务正常启动

---

## 优先级总览

| 优先级 | 任务 | 预计时间 | 依赖 |
|-------|------|---------|------|
| P0 | 命令注入修复 | 0.5天 | 无 |
| P0 | 输入验证 | 0.5天 | 无 |
| P0 | Promise拒绝处理 | 1天 | 无 |
| P1 | 异步文件操作 | 2天 | 无 |
| P1 | 消除any类型 | 2天 | 无 |
| P2 | 架构优化 | 5天 | P1完成 |

**总计: 约 2-3 周完成全部修复**

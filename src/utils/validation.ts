/**
 * 输入验证工具
 * 提供统一的输入验证功能，防止注入攻击和非法输入
 */

import { z } from 'zod';
import { OpsVError, OpsVErrorCode } from '../errors/OpsVError';

// ============================================================================
// Git 消息验证
// ============================================================================

/**
 * 验证 Git 提交消息
 * @param message 用户输入的提交消息
 * @returns 验证通过返回清理后的消息，否则返回 null
 */
export function validateGitMessage(message: unknown): string | null {
    if (typeof message !== 'string') return null;

    // 移除控制字符和危险字符
    const sanitized = message
        .replace(/[\x00-\x1F\x7F]/g, '')  // 控制字符
        .replace(/[`$&|;<>'"\\]/g, '')   // 危险shell字符
        .trim();

    // 长度限制
    if (sanitized.length === 0 || sanitized.length > 1000) {
        return null;
    }

    return sanitized;
}

/**
 * 严格验证 Git 消息，失败时抛出错误
 */
export function validateGitMessageStrict(message: unknown): string {
    const result = validateGitMessage(message);
    if (!result) {
        throw new OpsVError(
            OpsVErrorCode.VALIDATION_ERROR,
            'Git message validation failed: message contains invalid characters or exceeds length limits'
        );
    }
    return result;
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * 模型名称枚举
 */
export const ModelNameSchema = z.enum([
    // 图像模型
    'flux-pro', 'flux-dev', 'flux-schnell',
    'sdxl', 'sdxl-lightning',
    'minimax-image', 'seadream',
    // 视频模型
    'seedance', 'kling', 'wan2.2-i2v',
    'minimax-video', 'siliconflow-video'
]);

/**
 * 安全文件路径 Schema
 * 防止目录遍历和非法字符
 */
export const SafePathSchema = z.string()
    .min(1, 'Path cannot be empty')
    .max(500, 'Path exceeds maximum length')
    .regex(
        /^[a-zA-Z0-9_\-\/\.]+$/,
        'Path contains invalid characters. Only alphanumeric, underscore, hyphen, forward slash, and dot are allowed'
    )
    .refine(
        path => !path.includes('..'),
        'Path cannot contain parent directory references (..)'
    )
    .refine(
        path => !path.startsWith('/'),
        'Path must be relative, not absolute'
    );

/**
 * Shot ID Schema
 * 纯数字ID
 */
export const ShotIdSchema = z.string()
    .regex(/^\d+$/, 'Shot ID must be numeric (e.g., "01", "12")')
    .transform(id => id.padStart(2, '0'));

/**
 * 并发数 Schema
 */
export const ConcurrencySchema = z.number()
    .int('Concurrency must be an integer')
    .min(1, 'Concurrency must be at least 1')
    .max(10, 'Concurrency cannot exceed 10')
    .default(1);

// ============================================================================
// 验证函数
// ============================================================================

/**
 * 验证模型名称
 * @throws OpsVError 验证失败时抛出
 */
export function validateModelName(model: unknown): string {
    try {
        return ModelNameSchema.parse(model);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            throw new OpsVError(
                OpsVErrorCode.VALIDATION_ERROR,
                `Invalid model name: ${issues}`
            );
        }
        throw error;
    }
}

/**
 * 验证文件路径
 * @throws OpsVError 验证失败时抛出
 */
export function validateFilePath(path: unknown): string {
    try {
        return SafePathSchema.parse(path);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.errors.map(e => e.message).join('; ');
            throw new OpsVError(
                OpsVErrorCode.VALIDATION_ERROR,
                `Invalid file path: ${issues}`
            );
        }
        throw error;
    }
}

/**
 * 验证 Shot ID
 * @throws OpsVError 验证失败时抛出
 */
export function validateShotId(id: unknown): string {
    try {
        return ShotIdSchema.parse(id);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new OpsVError(
                OpsVErrorCode.VALIDATION_ERROR,
                `Invalid shot ID: must be numeric (e.g., "01", "12")`
            );
        }
        throw error;
    }
}

/**
 * 通用验证函数
 * 支持任何 Zod Schema
 */
export function validateInput<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    errorCode: string = 'VALIDATION_ERROR'
): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map(
                e => `${e.path.join('.')}: ${e.message}`
            ).join('\n');
            throw new OpsVError(
                OpsVErrorCode.VALIDATION_ERROR,
                `Validation failed:\n${messages}`
            );
        }
        throw error;
    }
}

// ============================================================================
// 批量验证工具
// ============================================================================

/**
 * 批量验证路径列表
 * @returns 验证通过的路径和失败的路径
 */
export function validatePathsBatch(
    paths: unknown[]
): { valid: string[]; invalid: { input: unknown; reason: string }[] } {
    const valid: string[] = [];
    const invalid: { input: unknown; reason: string }[] = [];

    for (const path of paths) {
        try {
            const validated = validateFilePath(path);
            valid.push(validated);
        } catch (error) {
            invalid.push({
                input: path,
                reason: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    return { valid, invalid };
}

/**
 * 安全构建命令参数
 * 防止命令注入
 */
export function buildSafeCommand(
    baseCommand: string,
    args: string[],
    options: { cwd?: string; timeout?: number } = {}
): { command: string; args: string[]; options: { cwd?: string; timeout?: number; encoding: string } } {
    // 验证所有参数
    const validatedArgs = args.map(arg => {
        if (typeof arg !== 'string') {
            throw new OpsVError(
                'VALIDATION_ERROR' as OpsVErrorCode,
                `Command argument must be a string, got ${typeof arg}`
            );
        }
        // 检查危险字符
        if (/[\x00-\x1F\x7F`$&|;<>(){}\[\]]/.test(arg)) {
            throw new OpsVError(
                'VALIDATION_ERROR' as OpsVErrorCode,
                `Command argument contains dangerous characters: ${arg.substring(0, 50)}`
            );
        }
        return arg;
    });

    return {
        command: baseCommand,
        args: validatedArgs,
        options: {
            ...options,
            encoding: 'utf-8'
        }
    };
}

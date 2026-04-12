/**
 * OpenSpec-Video 标准化错误处理体系
 *
 * 提供统一的错误码、错误上下文和结构化错误信息
 */

export enum OpsVErrorCode {
    // 资产相关错误 (1xxx)
    ASSET_NOT_FOUND = 'E1001',
    ASSET_INVALID_FRONTMATTER = 'E1002',
    ASSET_MISSING_REQUIRED_FIELD = 'E1003',
    ASSET_IMAGE_NOT_FOUND = 'E1004',
    ASSET_PARSE_FAILED = 'E1005',

    // 配置相关错误 (2xxx)
    CONFIG_NOT_FOUND = 'E2001',
    CONFIG_INVALID_FORMAT = 'E2002',
    CONFIG_MISSING_REQUIRED_FIELD = 'E2003',

    // 编译相关错误 (3xxx)
    COMPILATION_FAILED = 'E3001',
    COMPILATION_INVALID_ASSET_REF = 'E3002',
    COMPILATION_DEPENDENCY_MISSING = 'E3003',
    COMPILATION_INVALID_SHOT_FORMAT = 'E3004',

    // 执行相关错误 (4xxx)
    EXECUTION_API_ERROR = 'E4001',
    EXECUTION_TIMEOUT = 'E4002',
    EXECUTION_DOWNLOAD_FAILED = 'E4003',
    EXECUTION_PROVIDER_NOT_FOUND = 'E4004',
    EXECUTION_FRAME_EXTRACTION_FAILED = 'E4005',

    // 网络/IO 错误 (5xxx)
    NETWORK_ERROR = 'E5001',
    FILE_NOT_FOUND = 'E5002',
    FILE_PERMISSION_DENIED = 'E5003',
    WEBSOCKET_ERROR = 'E5004',

    // 验证错误 (6xxx)
    VALIDATION_ERROR = 'E6001',
    VALIDATION_SCHEMA_FAILED = 'E6002',
    VALIDATION_TYPE_MISMATCH = 'E6003',

    // 未知错误 (9xxx)
    UNKNOWN_ERROR = 'E9999'
}

export interface ErrorContext {
    /** 错误发生的文件路径 */
    filePath?: string;
    /** 错误发生的行号/位置 */
    position?: string;
    /** 相关的资产ID */
    assetId?: string;
    /** 相关的任务ID */
    jobId?: string;
    /** 额外的上下文数据 */
    metadata?: Record<string, unknown>;
    /** 原始错误对象 */
    cause?: Error;
}

/**
 * OpsV 基础错误类
 *
 * 所有 OpsV 错误都应继承此类，确保统一的错误处理体验
 */
export class OpsVError extends Error {
    /** 错误码 */
    public readonly code: OpsVErrorCode;
    /** 错误上下文 */
    public readonly context: ErrorContext;
    /** 错误发生时间 */
    public readonly timestamp: Date;

    constructor(
        code: OpsVErrorCode,
        message: string,
        context: ErrorContext = {}
    ) {
        super(message);
        this.name = 'OpsVError';
        this.code = code;
        this.context = context;
        this.timestamp = new Date();

        // 保持原型链完整
        Object.setPrototypeOf(this, OpsVError.prototype);

        // 如果有原始错误，捕获堆栈
        if (context.cause?.stack) {
            this.stack = `${this.stack}\nCaused by: ${context.cause.stack}`;
        }
    }

    /**
     * 转换为 JSON 格式，便于日志记录和序列化
     */
    toJSON(): object {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack
        };
    }

    /**
     * 获取用户友好的错误信息
     */
    toUserMessage(): string {
        const baseMessage = `[${this.code}] ${this.message}`;

        if (this.context.filePath) {
            return `${baseMessage}\n  位置: ${this.context.filePath}${
                this.context.position ? `:${this.context.position}` : ''
            }`;
        }

        return baseMessage;
    }
}

/**
 * 资产错误
 */
export class AssetError extends OpsVError {
    constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
        super(code, message, context);
        this.name = 'AssetError';
        Object.setPrototypeOf(this, AssetError.prototype);
    }
}

/**
 * 配置错误
 */
export class ConfigError extends OpsVError {
    constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
        super(code, message, context);
        this.name = 'ConfigError';
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}

/**
 * 编译错误
 */
export class CompilationError extends OpsVError {
    constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
        super(code, message, context);
        this.name = 'CompilationError';
        Object.setPrototypeOf(this, CompilationError.prototype);
    }
}

/**
 * 执行错误
 */
export class ExecutionError extends OpsVError {
    constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
        super(code, message, context);
        this.name = 'ExecutionError';
        Object.setPrototypeOf(this, ExecutionError.prototype);
    }
}

/**
 * 验证错误
 */
export class ValidationError extends OpsVError {
    public readonly schemaErrors: string[];

    constructor(message: string, schemaErrors: string[] = [], context: ErrorContext = {}) {
        super(OpsVErrorCode.VALIDATION_SCHEMA_FAILED, message, context);
        this.name = 'ValidationError';
        this.schemaErrors = schemaErrors;
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

/**
 * 错误工厂函数 - 便捷创建常见错误
 */
export const ErrorFactory = {
    assetNotFound(assetId: string, filePath?: string): AssetError {
        return new AssetError(
            OpsVErrorCode.ASSET_NOT_FOUND,
            `资产未找到: ${assetId}`,
            { assetId, filePath }
        );
    },

    invalidFrontmatter(filePath: string, cause?: Error): AssetError {
        return new AssetError(
            OpsVErrorCode.ASSET_INVALID_FRONTMATTER,
            `Frontmatter 解析失败`,
            { filePath, cause }
        );
    },

    configNotFound(configPath: string): ConfigError {
        return new ConfigError(
            OpsVErrorCode.CONFIG_NOT_FOUND,
            `配置文件未找到: ${configPath}`,
            { filePath: configPath }
        );
    },

    compilationFailed(reason: string, context: ErrorContext = {}): CompilationError {
        return new CompilationError(
            OpsVErrorCode.COMPILATION_FAILED,
            `编译失败: ${reason}`,
            context
        );
    },

    apiError(provider: string, message: string, jobId?: string): ExecutionError {
        return new ExecutionError(
            OpsVErrorCode.EXECUTION_API_ERROR,
            `[${provider}] API 错误: ${message}`,
            { jobId, metadata: { provider } }
        );
    },

    timeout(operation: string, timeoutMs: number, jobId?: string): ExecutionError {
        return new ExecutionError(
            OpsVErrorCode.EXECUTION_TIMEOUT,
            `操作超时: ${operation} (>${timeoutMs}ms)`,
            { jobId, metadata: { operation, timeoutMs } }
        );
    }
};

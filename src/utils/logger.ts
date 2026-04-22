/**
 * OpenSpec-Video 结构化日志系统
 *
 * 基于 winston 的分级日志实现
 * 支持控制台输出和文件持久化
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 日志级别定义
export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    HTTP = 'http',
    VERBOSE = 'verbose',
    DEBUG = 'debug',
    SILLY = 'silly'
}

// 日志配置选项
export interface LoggerOptions {
    /** 日志级别 */
    level?: LogLevel;
    /** 是否启用控制台输出 */
    console?: boolean;
    /** 日志文件目录 */
    logDir?: string;
    /** 是否启用文件日志 */
    file?: boolean;
    /** 是否以 JSON 格式输出 */
    json?: boolean;
    /** 是否包含时间戳 */
    timestamp?: boolean;
}

// 默认配置
const defaultOptions: LoggerOptions = {
    level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
    console: true,
    logDir: path.join(process.cwd(), 'logs'),
    file: true,
    json: false,
    timestamp: true
};

// 单例实例
let loggerInstance: winston.Logger | null = null;

/**
 * 创建 winston 日志格式
 */
function createFormat(options: LoggerOptions): winston.Logform.Format {
    const formats: winston.Logform.Format[] = [];

    // 时间戳
    if (options.timestamp) {
        formats.push(winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }));
    }

    // 错误堆栈
    formats.push(winston.format.errors({ stack: true }));

    // JSON 格式或可读的格式
    if (options.json) {
        formats.push(winston.format.json());
    } else {
        formats.push(winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            let msg = '';

            if (timestamp) {
                msg += `[${timestamp}] `;
            }

            msg += `[${level.toUpperCase()}] ${message}`;

            // 添加元数据
            if (Object.keys(metadata).length > 0) {
                const metaStr = Object.entries(metadata)
                    .filter(([key]) => key !== 'stack')
                    .map(([key, value]) => {
                        if (typeof value === 'object') {
                            return `${key}=${JSON.stringify(value)}`;
                        }
                        return `${key}=${value}`;
                    })
                    .join(' ');

                if (metaStr) {
                    msg += ` | ${metaStr}`;
                }
            }

            // 添加堆栈信息（如果是错误）
            if (metadata.stack) {
                msg += `\n${metadata.stack}`;
            }

            return msg;
        }));
    }

    return winston.format.combine(...formats);
}

/**
 * 创建日志传输器
 */
function createTransports(options: LoggerOptions): winston.transport[] {
    const transports: winston.transport[] = [];

    // 控制台传输
    if (options.console) {
        transports.push(new winston.transports.Console({
            format: createFormat({ ...options, json: false }),
            stderrLevels: [LogLevel.ERROR]
        }));
    }

    // 文件传输
    if (options.file && options.logDir) {
        // 确保日志目录存在
        fs.mkdirSync(options.logDir, { recursive: true });

        // 错误日志单独文件
        transports.push(new winston.transports.File({
            filename: path.join(options.logDir, 'error.log'),
            level: LogLevel.ERROR,
            format: createFormat({ ...options, json: true }),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }));

        // 所有日志
        transports.push(new winston.transports.File({
            filename: path.join(options.logDir, 'combined.log'),
            format: createFormat({ ...options, json: true }),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }));
    }

    return transports;
}

/**
 * 初始化日志系统
 */
export function initializeLogger(options: Partial<LoggerOptions> = {}): winston.Logger {
    const mergedOptions = { ...defaultOptions, ...options };

    loggerInstance = winston.createLogger({
        level: mergedOptions.level,
        defaultMeta: {
            service: 'openspec-video',
            version: '0.6.4'
        },
        transports: createTransports(mergedOptions),
        exitOnError: false
    });

    return loggerInstance;
}

/**
 * 获取日志实例（懒加载）
 */
export function getLogger(): winston.Logger {
    if (!loggerInstance) {
        return initializeLogger();
    }
    return loggerInstance;
}

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
    const logger = getLogger();
    logger.level = level;
}

// 便捷导出
export const logger = {
    error: (message: string, meta?: any) => getLogger().error(message, meta),
    warn: (message: string, meta?: any) => getLogger().warn(message, meta),
    info: (message: string, meta?: any) => getLogger().info(message, meta),
    http: (message: string, meta?: any) => getLogger().http(message, meta),
    verbose: (message: string, meta?: any) => getLogger().verbose(message, meta),
    debug: (message: string, meta?: any) => getLogger().debug(message, meta),
    silly: (message: string, meta?: any) => getLogger().silly(message, meta),

    // 带上下文的日志方法
    logAssetOperation: (operation: string, assetId: string, details?: any) => {
        getLogger().info(`[Asset] ${operation}: ${assetId}`, { assetId, ...details });
    },

    logCompilation: (stage: string, details: any) => {
        getLogger().info(`[Compilation] ${stage}`, details);
    },

    logExecution: (jobId: string, stage: string, details?: any) => {
        getLogger().info(`[Execution] ${jobId} - ${stage}`, { jobId, ...details });
    },

    logError: (error: Error, context?: string) => {
        getLogger().error(context || error.message, {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
    }
};

// 兼容旧版 console 风格的日志
export const compatLogger = {
    log: (message: string, ...args: any[]) => logger.info(message, { args }),
    info: (message: string, ...args: any[]) => logger.info(message, { args }),
    warn: (message: string, ...args: any[]) => logger.warn(message, { args }),
    error: (message: string, ...args: any[]) => logger.error(message, { args }),
    debug: (message: string, ...args: any[]) => logger.debug(message, { args })
};

export default logger;

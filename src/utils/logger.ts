/**
 * OpenSpec-Video 缁撴瀯鍖栨棩蹇楃郴缁?
 * 
 * 鍩轰簬 winston 鐨勫垎绾ф棩蹇楀疄鐜?
 * 鏀寔鎺у埗鍙拌緭鍑哄拰鏂囦欢鎸佷箙鍖?
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 鏃ュ織绾у埆瀹氫箟
export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    HTTP = 'http',
    VERBOSE = 'verbose',
    DEBUG = 'debug',
    SILLY = 'silly'
}

// 鏃ュ織閰嶇疆閫夐」
export interface LoggerOptions {
    /** 鏃ュ織绾у埆 */
    level?: LogLevel;
    /** 鏄惁鍚敤鎺у埗鍙拌緭鍑?*/
    console?: boolean;
    /** 鏃ュ織鏂囦欢鐩綍 */
    logDir?: string;
    /** 鏄惁鍚敤鏂囦欢鏃ュ織 */
    file?: boolean;
    /** 鏄惁浠?JSON 鏍煎紡杈撳嚭 */
    json?: boolean;
    /** 鏄惁鍖呭惈鏃堕棿鎴?*/
    timestamp?: boolean;
}

// 榛樿閰嶇疆
const defaultOptions: LoggerOptions = {
    level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
    console: true,
    logDir: path.join(process.cwd(), 'logs'),
    file: true,
    json: false,
    timestamp: true
};

// 鍗曚緥瀹炰緥
let loggerInstance: winston.Logger | null = null;

/**
 * 鍒涘缓 winston 鏃ュ織鏍煎紡
 */
function createFormat(options: LoggerOptions): winston.Logform.Format {
    const formats: winston.Logform.Format[] = [];

    // 鏃堕棿鎴?
    if (options.timestamp) {
        formats.push(winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }));
    }

    // 閿欒鍫嗘爤
    formats.push(winston.format.errors({ stack: true }));

    // JSON 鏍煎紡鎴栧彲璇绘牸寮?
    if (options.json) {
        formats.push(winston.format.json());
    } else {
        formats.push(winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            let msg = '';
            
            if (timestamp) {
                msg += `[${timestamp}] `;
            }
            
            msg += `[${level.toUpperCase()}] ${message}`;
            
            // 娣诲姞鍏冩暟鎹?
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
            
            // 娣诲姞鍫嗘爤淇℃伅锛堝鏋滄槸閿欒锛?
            if (metadata.stack) {
                msg += `\n${metadata.stack}`;
            }
            
            return msg;
        }));
    }

    return winston.format.combine(...formats);
}

/**
 * 鍒涘缓鏃ュ織浼犺緭鍣?
 */
function createTransports(options: LoggerOptions): winston.transport[] {
    const transports: winston.transport[] = [];

    // 鎺у埗鍙颁紶杈?
    if (options.console) {
        transports.push(new winston.transports.Console({
            format: createFormat({ ...options, json: false }),
            stderrLevels: [LogLevel.ERROR]
        }));
    }

    // 鏂囦欢浼犺緭
    if (options.file && options.logDir) {
        // 纭繚鏃ュ織鐩綍瀛樺湪
        if (!fs.existsSync(options.logDir)) {
            fs.mkdirSync(options.logDir, { recursive: true });
        }

        // 閿欒鏃ュ織鍗曠嫭鏂囦欢
        transports.push(new winston.transports.File({
            filename: path.join(options.logDir, 'error.log'),
            level: LogLevel.ERROR,
            format: createFormat({ ...options, json: true }),
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }));

        // 鎵€鏈夋棩蹇?
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
 * 鍒濆鍖栨棩蹇楃郴缁?
 */
export function initializeLogger(options: Partial<LoggerOptions> = {}): winston.Logger {
    const mergedOptions = { ...defaultOptions, ...options };
    
    loggerInstance = winston.createLogger({
        level: mergedOptions.level,
        defaultMeta: {
            service: 'openspec-video',
            version: '0.4.3'
        },
        transports: createTransports(mergedOptions),
        exitOnError: false
    });

    return loggerInstance;
}

/**
 * 鑾峰彇鏃ュ織瀹炰緥锛堟噿鍔犺浇锛?
 */
export function getLogger(): winston.Logger {
    if (!loggerInstance) {
        return initializeLogger();
    }
    return loggerInstance;
}

/**
 * 璁剧疆鏃ュ織绾у埆
 */
export function setLogLevel(level: LogLevel): void {
    const logger = getLogger();
    logger.level = level;
}

// 渚挎嵎瀵煎嚭
export const logger = {
    error: (message: string, meta?: any) => getLogger().error(message, meta),
    warn: (message: string, meta?: any) => getLogger().warn(message, meta),
    info: (message: string, meta?: any) => getLogger().info(message, meta),
    http: (message: string, meta?: any) => getLogger().http(message, meta),
    verbose: (message: string, meta?: any) => getLogger().verbose(message, meta),
    debug: (message: string, meta?: any) => getLogger().debug(message, meta),
    silly: (message: string, meta?: any) => getLogger().silly(message, meta),
    
    // 甯︿笂涓嬫枃鐨勬棩蹇楁柟娉?
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

// 鍏煎鏃х増 console 椋庢牸鐨勬棩蹇?
export const compatLogger = {
    log: (message: string, ...args: any[]) => logger.info(message, { args }),
    info: (message: string, ...args: any[]) => logger.info(message, { args }),
    warn: (message: string, ...args: any[]) => logger.warn(message, { args }),
    error: (message: string, ...args: any[]) => logger.error(message, { args }),
    debug: (message: string, ...args: any[]) => logger.debug(message, { args })
};

export default logger;


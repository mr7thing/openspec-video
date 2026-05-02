// ============================================================================
// OpsV v0.8 Logger
// ============================================================================

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { resolveProjectRoot } from './projectResolver';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
}

export interface LoggerOptions {
  level?: LogLevel;
  console?: boolean;
  logDir?: string;
  file?: boolean;
  json?: boolean;
  timestamp?: boolean;
}

// Read version from package.json
const pkgPath = path.join(__dirname, '../../package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '0.8.8' };
const LOG_VERSION = pkg.version;

const defaultOptions: LoggerOptions = {
  level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  console: true,
  logDir: path.join(resolveProjectRoot(process.cwd()), 'logs'),
  file: true,
  json: false,
  timestamp: true,
};

let loggerInstance: winston.Logger | null = null;

function createFormat(options: LoggerOptions): winston.Logform.Format {
  const formats: winston.Logform.Format[] = [];

  if (options.timestamp) {
    formats.push(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }));
  }

  formats.push(winston.format.errors({ stack: true }));

  if (options.json) {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = '';
        if (timestamp) msg += `[${timestamp}] `;
        msg += `[${level.toUpperCase()}] ${message}`;

        const metaStr = Object.entries(metadata)
          .filter(([key]) => key !== 'stack')
          .map(([key, value]) =>
            typeof value === 'object' ? `${key}=${JSON.stringify(value)}` : `${key}=${value}`
          )
          .join(' ');

        if (metaStr) msg += ` | ${metaStr}`;
        if (metadata.stack) msg += `\n${metadata.stack}`;

        return msg;
      })
    );
  }

  return winston.format.combine(...formats);
}

function createTransports(options: LoggerOptions): winston.transport[] {
  const transports: winston.transport[] = [];

  if (options.console) {
    transports.push(
      new winston.transports.Console({
        format: createFormat({ ...options, json: false }),
        stderrLevels: [LogLevel.ERROR],
      })
    );
  }

  if (options.file && options.logDir) {
    if (!fs.existsSync(options.logDir)) {
      fs.mkdirSync(options.logDir, { recursive: true });
    }

    transports.push(
      new winston.transports.File({
        filename: path.join(options.logDir, 'error.log'),
        level: LogLevel.ERROR,
        format: createFormat({ ...options, json: true }),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(options.logDir, 'combined.log'),
        format: createFormat({ ...options, json: true }),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      })
    );
  }

  return transports;
}

export function initializeLogger(options: Partial<LoggerOptions> = {}): winston.Logger {
  const merged = { ...defaultOptions, ...options };
  loggerInstance = winston.createLogger({
    level: merged.level,
    defaultMeta: { service: 'opsv', version: LOG_VERSION },
    transports: createTransports(merged),
    exitOnError: false,
  });
  return loggerInstance;
}

export function getLogger(): winston.Logger {
  return loggerInstance || initializeLogger();
}

export function setLogLevel(level: LogLevel): void {
  getLogger().level = level;
}

export const logger = {
  error: (message: string, meta?: any) => getLogger().error(message, meta),
  warn: (message: string, meta?: any) => getLogger().warn(message, meta),
  info: (message: string, meta?: any) => getLogger().info(message, meta),
  http: (message: string, meta?: any) => getLogger().http(message, meta),
  verbose: (message: string, meta?: any) => getLogger().verbose(message, meta),
  debug: (message: string, meta?: any) => getLogger().debug(message, meta),
};

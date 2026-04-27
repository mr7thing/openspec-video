// ============================================================================
// OpsV v0.8 Error Hierarchy
// ============================================================================

export enum OpsVErrorCode {
  ASSET_NOT_FOUND = 'E1001',
  ASSET_INVALID_FRONTMATTER = 'E1002',
  ASSET_MISSING_REQUIRED_FIELD = 'E1003',
  ASSET_IMAGE_NOT_FOUND = 'E1004',
  ASSET_PARSE_FAILED = 'E1005',

  CONFIG_NOT_FOUND = 'E2001',
  CONFIG_INVALID_FORMAT = 'E2002',
  CONFIG_MISSING_REQUIRED_FIELD = 'E2003',

  COMPILATION_FAILED = 'E3001',
  COMPILATION_INVALID_ASSET_REF = 'E3002',
  COMPILATION_DEPENDENCY_MISSING = 'E3003',
  COMPILATION_INVALID_SHOT_FORMAT = 'E3004',

  EXECUTION_API_ERROR = 'E4001',
  EXECUTION_TIMEOUT = 'E4002',
  EXECUTION_DOWNLOAD_FAILED = 'E4003',
  EXECUTION_PROVIDER_NOT_FOUND = 'E4004',
  EXECUTION_FRAME_EXTRACTION_FAILED = 'E4005',

  NETWORK_ERROR = 'E5001',
  FILE_NOT_FOUND = 'E5002',
  FILE_PERMISSION_DENIED = 'E5003',
  WEBSOCKET_ERROR = 'E5004',

  VALIDATION_ERROR = 'E6001',
  VALIDATION_SCHEMA_FAILED = 'E6002',
  VALIDATION_TYPE_MISMATCH = 'E6003',

  SCHEDULING_CIRCLE_NOT_FOUND = 'E7001',
  SCHEDULING_DEPENDENCY_NOT_READY = 'E7002',
  SCHEDULING_MANIFEST_OUTDATED = 'E7003',

  UNKNOWN_ERROR = 'E9999'
}

export interface ErrorContext {
  filePath?: string;
  position?: string;
  assetId?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
  cause?: Error;
}

export class OpsVError extends Error {
  public readonly code: OpsVErrorCode;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;

  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(message);
    this.name = 'OpsVError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    Object.setPrototypeOf(this, OpsVError.prototype);
    if (context.cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${context.cause.stack}`;
    }
  }

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

  toUserMessage(): string {
    const base = `[${this.code}] ${this.message}`;
    if (this.context.filePath) {
      return `${base}\n  位置: ${this.context.filePath}${this.context.position ? `:${this.context.position}` : ''}`;
    }
    return base;
  }
}

export class AssetError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context);
    this.name = 'AssetError';
    Object.setPrototypeOf(this, AssetError.prototype);
  }
}

export class ConfigError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context);
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

export class CompilationError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context);
    this.name = 'CompilationError';
    Object.setPrototypeOf(this, CompilationError.prototype);
  }
}

export class ExecutionError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context);
    this.name = 'ExecutionError';
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }
}

export class ValidationError extends OpsVError {
  public readonly schemaErrors: string[];

  constructor(message: string, schemaErrors: string[] = [], context: ErrorContext = {}) {
    super(OpsVErrorCode.VALIDATION_SCHEMA_FAILED, message, context);
    this.name = 'ValidationError';
    this.schemaErrors = schemaErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class SchedulingError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, context: ErrorContext = {}) {
    super(code, message, context);
    this.name = 'SchedulingError';
    Object.setPrototypeOf(this, SchedulingError.prototype);
  }
}

export const ErrorFactory = {
  assetNotFound(assetId: string, filePath?: string): AssetError {
    return new AssetError(OpsVErrorCode.ASSET_NOT_FOUND, `资产未找到: ${assetId}`, { assetId, filePath });
  },
  configNotFound(configPath: string): ConfigError {
    return new ConfigError(OpsVErrorCode.CONFIG_NOT_FOUND, `配置文件未找到: ${configPath}`, { filePath: configPath });
  },
  compilationFailed(reason: string, context: ErrorContext = {}): CompilationError {
    return new CompilationError(OpsVErrorCode.COMPILATION_FAILED, `编译失败: ${reason}`, context);
  },
  apiError(provider: string, message: string, jobId?: string): ExecutionError {
    return new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `[${provider}] API 错误: ${message}`, { jobId, metadata: { provider } });
  },
  dependencyNotReady(assetId: string, blockedBy: string[]): SchedulingError {
    return new SchedulingError(OpsVErrorCode.SCHEDULING_DEPENDENCY_NOT_READY, `依赖未就绪: ${assetId} 被阻塞于 ${blockedBy.join(', ')}`, { assetId, metadata: { blockedBy } });
  },
  manifestOutdated(manifestAge: string): SchedulingError {
    return new SchedulingError(OpsVErrorCode.SCHEDULING_MANIFEST_OUTDATED, `manifest 可能过期 (最后刷新: ${manifestAge})，建议先执行 opsv circle refresh`, {});
  },
};

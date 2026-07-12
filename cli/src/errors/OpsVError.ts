// ============================================================================
// OpsV Error Type System
// Based on DESIGN.md Section 7: Error Taxonomy
//
// Code Range | Layer          | Examples
// -----------|----------------|----------
// E1xxx      | Asset/Document | parse failed, missing field, image not found
// E2xxx      | Config         | missing API key, invalid model config
// E3xxx      | Compilation    | invalid ref, circular dependency
// E4xxx      | Execution      | API error, timeout, download failed
// E5xxx      | Infrastructure | file not found, network, WebSocket
// E6xxx      | Validation     | schema mismatch, type error
// E7xxx      | Scheduling     | circle not found, dependency not ready
// ============================================================================

export enum OpsVErrorCode {
  // E1xxx — Asset/Document: parse failed, missing field, image not found
  ASSET_NOT_FOUND = 'E1001',
  ASSET_PARSE_ERROR = 'E1002',
  ASSET_MISSING_FIELD = 'E1003',
  ASSET_IMAGE_NOT_FOUND = 'E1004',

  // E2xxx — Config: missing API key, invalid model config
  CONFIG_KEY_NOT_FOUND = 'E2001',
  CONFIG_INVALID_MODEL = 'E2002',
  CONFIG_MISSING_FIELD = 'E2003',

  // E3xxx — Compilation: invalid ref, circular dependency
  COMPILATION_INVALID_REF = 'E3001',
  COMPILATION_CIRCULAR_DEP = 'E3002',
  COMPILATION_FAILED = 'E3003',
  COMPILATION_WORKFLOW_NOT_FOUND = 'E3010',
  COMPILATION_WORKFLOW_PARSE_FAILED = 'E3011',
  COMPILATION_NODE_MAPPING_MISSING = 'E3012',
  COMPILATION_ASSET_NOT_FOUND = 'E3013',

  // E4xxx — Execution: API error, timeout, download failed
  EXECUTION_API_ERROR = 'E4001',
  EXECUTION_TIMEOUT = 'E4002',
  EXECUTION_DOWNLOAD_FAILED = 'E4003',
  EXECUTION_PROVIDER_NOT_FOUND = 'E4004',
  EXECUTION_SUBMIT_FAILED = 'E4005',
  EXECUTION_STATUS_QUERY_FAILED = 'E4006',
  EXECUTION_RESULT_QUERY_FAILED = 'E4007',
  EXECUTION_UPLOAD_FAILED = 'E4008',
  EXECUTION_OUTPUT_NOT_FOUND = 'E4009',
  EXECUTION_TASK_FAILED = 'E4010',

  // E5xxx — Infrastructure: file not found, network, WebSocket
  INFRA_FILE_NOT_FOUND = 'E5001',
  INFRA_NETWORK_ERROR = 'E5002',
  INFRA_PATH_FORBIDDEN = 'E5003',

  // E6xxx — Validation: schema mismatch, type error
  VALIDATION_SCHEMA_MISMATCH = 'E6001',
  VALIDATION_TYPE_ERROR = 'E6002',
  VALIDATION_YAML_PARSE_FAILED = 'E6003',
  VALIDATION_FRONTMATTER_MISSING = 'E6004',
  VALIDATION_FRONTMATTER_MALFORMED = 'E6005',

  // E7xxx — Scheduling: circle not found, dependency not ready
  SCHEDULING_CIRCLE_NOT_FOUND = 'E7001',
  SCHEDULING_DEP_NOT_READY = 'E7002',
}

/** Extra context attached to an OpsV error */
export interface ErrorContext {
  phase?: string;
  assetId?: string;
  circle?: string;
  provider?: string;
  command?: string;
  /** Free-form additional context */
  extra?: Record<string, unknown>;
}

/** Base OpsV error with code + message + context */
export class OpsVError extends Error {
  public context: ErrorContext;

  constructor(
    public readonly code: OpsVErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    context?: ErrorContext,
  ) {
    super(message);
    this.name = 'OpsVError';
    this.context = context || {};
  }

  /** Attach context without creating a new error */
  withContext(ctx: Partial<ErrorContext>): this {
    this.context = { ...this.context, ...ctx };
    return this;
  }

  /** Format error with context for display */
  formatMessage(): string {
    const parts = [this.message];
    if (this.context.assetId) parts.push(`asset=${this.context.assetId}`);
    if (this.context.circle) parts.push(`circle=${this.context.circle}`);
    if (this.context.phase) parts.push(`phase=${this.context.phase}`);
    if (this.context.provider) parts.push(`provider=${this.context.provider}`);
    if (this.context.command) parts.push(`command=${this.context.command}`);
    return `[${this.code}] ${parts.join(' | ')}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      context: this.context,
    };
  }
}

// ---------------------------------------------------------------------------
// Error subclasses by layer (convenience aliases for common patterns)
// ---------------------------------------------------------------------------

export class AssetError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'AssetError';
  }
}

export class ConfigError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'ConfigError';
  }
}

export class CompilationError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'CompilationError';
  }
}

export class ExecutionError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'ExecutionError';
  }
}

export class InfrastructureError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'InfrastructureError';
  }
}

export class ValidationError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'ValidationError';
  }
}

export class SchedulingError extends OpsVError {
  constructor(code: OpsVErrorCode, message: string, details?: Record<string, unknown>, context?: ErrorContext) {
    super(code, message, details, context);
    this.name = 'SchedulingError';
  }
}

/** Extra context attached to an OpsV error */
export interface ErrorContext {
  phase?: string;
  assetId?: string;
  circle?: string;
}

// Convenience factory for common error patterns
export const ErrorFactory = {
  compilationFailed(msg: string): never {
    throw new CompilationError(OpsVErrorCode.COMPILATION_FAILED, msg);
  },
  apiError(phase: string, message: string): never {
    throw new ExecutionError(OpsVErrorCode.EXECUTION_API_ERROR, `[${phase}] ${message}`);
  },
} as const;

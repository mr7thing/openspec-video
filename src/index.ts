// ============================================================================
// OpsV v0.8 Library Exports
// ============================================================================

// Types
export { AssetTypeEnum, StatusEnum, BaseFrontmatterSchema, ProjectFrontmatterSchema, ShotDesignFrontmatterSchema, ShotProductionFrontmatterSchema } from './types/FrontmatterSchema';
export type { AssetType, Status, BaseFrontmatter, ProjectFrontmatter, ShotDesignFrontmatter, ShotProductionFrontmatter } from './types/FrontmatterSchema';
export type { JobType, FrameRef, GlobalSettings, PromptPayload, Job, JobMeta, TaskJson } from './types/Job';

// Errors
export { OpsVErrorCode, OpsVError, AssetError, ConfigError, CompilationError, ExecutionError, ValidationError, SchedulingError, ErrorFactory } from './errors/OpsVError';
export type { ErrorContext } from './errors/OpsVError';

// Utils
export { logger, initializeLogger, setLogLevel, LogLevel } from './utils/logger';
export { ConfigLoader } from './utils/configLoader';
export type { ModelConfig, ApiConfig } from './utils/configLoader';
export { FileUtils } from './utils/FileUtils';
export { downloadFile } from './utils/download';
export { fileToBase64, fileToDataUri } from './utils/fileToBase64';
export { FrameExtractor } from './utils/frameExtractor';

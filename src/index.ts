// ============================================================================
// OpsV Library Exports
// ============================================================================

// Types
export { AssetCategoryEnum, StatusEnum, BaseFrontmatterSchema, ProjectFrontmatterSchema, ShotDesignFrontmatterSchema, ShotProductionFrontmatterSchema } from './types/FrontmatterSchema';
export type { AssetCategory, Status, BaseFrontmatter, ProjectFrontmatter, ShotDesignFrontmatter, ShotProductionFrontmatter } from './types/FrontmatterSchema';
export type { JobType, FrameRef, VideoSettings, PromptPayload, Job, JobMeta, TaskMeta, BaseTaskJson, TaskJson } from './types/Job';

// Errors
export { OpsVErrorCode, OpsVError, AssetError, ConfigError, CompilationError, ExecutionError, ValidationError, SchedulingError, ErrorFactory } from './errors/OpsVError';
export type { ErrorContext } from './errors/OpsVError';

// Container
export { Container, ProviderExecutor } from './container/Container';
export { OpsVContext } from './container/OpsVContext';

// Utils
export { logger, initializeLogger, setLogLevel, LogLevel } from './utils/logger';
export { ConfigLoader } from './utils/configLoader';
export type { ModelConfig, ApiConfig, ProjectSettings, DirSettings } from './utils/configLoader';
export { FileUtils } from './utils/FileUtils';
export { downloadFile } from './utils/download';
export { fileToBase64, fileToDataUri, fileToBase64Async } from './utils/fileToBase64';
export { FrameExtractor } from './utils/frameExtractor';

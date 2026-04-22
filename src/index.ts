/**
 * OpenSpec-Video Library Entry Point
 * Re-exports core modules for programmatic usage.
 */

export { AssetManager } from './core/AssetManager';
export { AssetCompiler } from './core/AssetCompiler';
export { RefResolver } from './core/RefResolver';
export { DependencyGraph } from './core/DependencyGraph';
export { FrontmatterParser } from './core/FrontmatterParser';
export { ApprovedRefReader } from './core/ApprovedRefReader';
export { JobGenerator } from './automation/JobGenerator';
export { AnimateGenerator } from './automation/AnimateGenerator';
export { JobValidator } from './automation/JobValidator';
export { ConfigLoader } from './utils/configLoader';
export { logger } from './utils/logger';

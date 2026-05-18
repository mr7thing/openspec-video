// ============================================================================
// OpsV Runtime Context
// Single source of truth for project root, config, and logger per invocation.
// ============================================================================

import path from 'path';
import { ConfigLoader, ApiConfig } from '../utils/configLoader';
import { logger, initializeLogger, LogLevel } from '../utils/logger';
import { resolveProjectRoot } from '../utils/projectResolver';

export class OpsVContext {
  readonly projectRoot: string;
  readonly configLoader: ConfigLoader;
  readonly logDir: string;

  private constructor(cwd: string) {
    this.projectRoot = resolveProjectRoot(cwd);
    this.configLoader = new ConfigLoader();
    this.configLoader.loadConfig(this.projectRoot);
    this.logDir = path.join(this.projectRoot, 'logs');
    initializeLogger({ logDir: this.logDir, level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO });
  }

  static create(cwd: string = process.cwd()): OpsVContext {
    return new OpsVContext(cwd);
  }

  get config(): ApiConfig {
    return this.configLoader['config'];
  }
}

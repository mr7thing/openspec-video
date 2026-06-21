// ============================================================================
// OpsV Config Loader
// Non-singleton. Instantiate once per OpsVContext.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';
import { ErrorFactory } from '../errors/OpsVError';

export function getProjectDir(projectRoot: string, name: 'videospec' | 'queue'): string {
  try {
    const loader = new ConfigLoader();
    loader.loadConfig(projectRoot, { silent: true });
    const settings = loader.getSettings();
    if (name === 'videospec') {
      return path.join(projectRoot, settings?.dirs?.videospec || 'videospec');
    }
    return path.join(projectRoot, settings?.dirs?.queue || 'opsv-queue');
  } catch {
    return path.join(projectRoot, name === 'videospec' ? 'videospec' : 'opsv-queue');
  }
}

export interface TimeoutConfig {
  submit?: number;
  status?: number;
  download?: number;
  health?: number;
}

export interface RetryConfig {
  max_retries?: number;
  delay_cap?: number;
}

export interface InputBinding {
  source: string;
  target?: string;
}

export interface ModelConfig {
  provider: string;
  type?: 'imagen' | 'video' | 'audio' | 'comfy' | 'webapp';
  enable?: boolean;
  model?: string;
  api_url?: string;
  api_status_url?: string;
  required_env?: string[];
  fallback_env?: string[];
  features?: string[];
  defaults?: Record<string, any>;
  max_size?: { width: number; height: number };
  max_batch?: number;
  quality_map?: Record<string, any>;
  supports_first_image?: boolean;
  supports_middle_image?: boolean;
  supports_last_image?: boolean;
  supports_reference_images?: boolean;
  max_reference_images?: number;
  supports_reference_videos?: boolean;
  max_reference_videos?: number;
  supports_reference_audios?: boolean;
  max_reference_audios?: number;
  supports_audio?: boolean;
  supports_video_ref?: boolean;
  concurrency?: number;
  workflowId?: string;
  node_mappings?: Record<string, { nodeId: string; fieldName: string }>;
  inputs?: Record<string, InputBinding>;
  prompt_compile_mode?: 'keep' | 'index' | 'name';
  timeout?: TimeoutConfig;
  max_poll_duration?: number;
  retry?: RetryConfig;
}

export interface PollingSettings {
  intervals?: Array<{ thresholdMinutes: number; intervalSeconds: number }>;
  maxDurationHours?: number;
}

export interface DirSettings {
  videospec?: string;
  queue?: string;
}

export interface ProjectSettings {
  dirs?: DirSettings;
  polling?: PollingSettings;
}

export interface ApiConfig {
  models: Record<string, ModelConfig>;
  settings?: ProjectSettings;
}

export class ConfigLoader {
  private config: ApiConfig;

  constructor() {
    this.config = { models: {} };
  }

  /**
   * Three-tier config lookup:
   *   1. Built-in: cli/.opsv/api_config.yaml (shipped with CLI)
   *   2. User:     ~/.opsv/api_config.yaml
   *   3. Project:  ./.opsv/api_config.yaml
   * Each tier shallow-merges over the previous.
   */
  loadConfig(projectRoot: string, options?: { silent?: boolean }): ApiConfig {
    // Tier 1 — built-in (shipped with the CLI package)
    const builtinPath = path.join(__dirname, '..', '..', '.opsv', 'api_config.yaml');
    let merged: ApiConfig = { models: {} };
    const builtin = this.tryLoadYaml(builtinPath, options);
    if (builtin) merged = builtin;

    // Tier 2 — user-level override
    const userPath = path.join(os.homedir(), '.opsv', 'api_config.yaml');
    const userConfig = this.tryLoadYaml(userPath, options);
    if (userConfig) merged = this.shallowMerge(merged, userConfig);

    // Tier 3 — project-level override (highest priority)
    const projectPath = path.join(projectRoot, '.opsv', 'api_config.yaml');
    const projectConfig = this.tryLoadYaml(projectPath, options);
    if (projectConfig) merged = this.shallowMerge(merged, projectConfig);

    this.config = merged;
    return this.config;
  }

  private tryLoadYaml(filePath: string, options?: { silent?: boolean }): ApiConfig | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as ApiConfig;
    } catch (e: any) {
      if (!options?.silent) {
        logger.warn(`Failed to load ${filePath}: ${e.message}`);
      }
      return null;
    }
  }

  /** Shallow-merge override over base (models keys merged at top level). */
  private shallowMerge(base: ApiConfig, override: ApiConfig): ApiConfig {
    return {
      models: { ...base.models, ...override.models },
      settings: override.settings ?? base.settings,
    };
  }

  getModelConfig(modelName: string): ModelConfig | undefined {
    return this.config.models?.[modelName];
  }

  getSettings(): ProjectSettings | undefined {
    return this.config.settings;
  }

  getConfig(): ApiConfig {
    return this.config;
  }

  getResolvedApiKey(targetModel: string): string {
    const modelConfig = this.getModelConfig(targetModel);
    if (!modelConfig) {
      throw ErrorFactory.compilationFailed(`Model configuration for '${targetModel}' not found.`);
    }

    const required = modelConfig.required_env || [];
    const fallback = modelConfig.fallback_env || [];

    if (required.length === 0 && fallback.length === 0) {
      return '';
    }

    for (const envVar of required) {
      if (process.env[envVar]) return process.env[envVar]!;
    }

    for (const envVar of fallback) {
      if (process.env[envVar]) {
        logger.debug(`Using fallback API key for model ${targetModel}`);
        return process.env[envVar]!;
      }
    }

    throw ErrorFactory.compilationFailed(
      `Missing API Key for model '${targetModel}'. Please set the required environment variable in .env`
    );
  }
}

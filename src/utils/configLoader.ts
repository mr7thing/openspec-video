// ============================================================================
// OpsV v0.8 Config Loader
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';
import { ErrorFactory } from '../errors/OpsVError';

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
}

export interface ApiConfig {
  models: Record<string, ModelConfig>;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: ApiConfig;

  private constructor() {
    this.config = { models: {} };
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  loadConfig(projectRoot: string): ApiConfig {
    const configPath = path.join(projectRoot, '.opsv', 'api_config.yaml');

    if (!fs.existsSync(configPath)) {
      logger.warn(`API config not found at ${configPath}, using empty config`);
      this.config = { models: {} };
      return this.config;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      this.config = yaml.load(raw) as ApiConfig;
      return this.config;
    } catch (e: any) {
      logger.error(`Failed to load api_config.yaml`, { error: e.message });
      this.config = { models: {} };
      return this.config;
    }
  }

  getModelConfig(modelName: string): ModelConfig | undefined {
    return this.config.models?.[modelName];
  }

  getResolvedApiKey(targetModel: string): string {
    const modelConfig = this.getModelConfig(targetModel);
    if (!modelConfig) {
      throw ErrorFactory.compilationFailed(`Model configuration for '${targetModel}' not found.`);
    }

    const required = modelConfig.required_env || [];
    const fallback = modelConfig.fallback_env || [];

    // No API key required (e.g. local ComfyUI)
    if (required.length === 0 && fallback.length === 0) {
      return '';
    }

    for (const envVar of required) {
      if (process.env[envVar]) return process.env[envVar]!;
    }

    for (const envVar of fallback) {
      if (process.env[envVar]) {
        logger.debug(`Using fallback API key from ${envVar} for model ${targetModel}`);
        return process.env[envVar]!;
      }
    }

    const allEnvs = [...required, ...fallback].join(' or ');
    throw ErrorFactory.compilationFailed(
      `Missing API Key for model '${targetModel}'. Please set ${allEnvs} in .env`
    );
  }
}

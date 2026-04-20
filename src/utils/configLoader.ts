import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';
import { ErrorFactory } from '../errors/OpsVError';

export interface ModelConfig {
    provider: string;
    type?: 'image' | 'video';
    enable?: boolean;
    model?: string;
    api_url?: string;
    api_status_url?: string;
    gen_command?: string;
    required_env?: string[];
    fallback_env?: string[];
    features?: string[];
    defaults?: any;
    max_size?: { width: number; height: number };
    max_batch?: number;
    quality_map?: Record<string, any>;
    supports_first_image?: boolean;
    supports_middle_image?: boolean;
    supports_last_image?: boolean;
    supports_reference_images?: boolean;
    max_reference_images?: number;
    supports_audio?: boolean;
    supports_video_ref?: boolean;
}

export interface ApiConfig {
    models: Record<string, ModelConfig>;
}

export class ConfigLoader {
    private static instances = new Map<string, ConfigLoader>();
    private config: ApiConfig;
    private projectRoot: string;

    private constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.config = { models: {} };
    }

    public static getInstance(projectRoot?: string): ConfigLoader {
        const root = projectRoot || process.cwd();
        if (!ConfigLoader.instances.has(root)) {
            ConfigLoader.instances.set(root, new ConfigLoader(root));
        }
        return ConfigLoader.instances.get(root)!;
    }

    public async loadConfig(projectRoot?: string): Promise<ApiConfig> {
        const root = projectRoot || this.projectRoot;
        const configPath = path.join(root, '.env', 'api_config.yaml');
        
        const configExists = await fs.access(configPath).then(() => true).catch(() => false);
        if (!configExists) {
            logger.warn(`API config not found at ${configPath}, using empty config`);
            this.config = { models: {} };
            return this.config;
        }

        try {
            const raw = await fs.readFile(configPath, 'utf8');
            this.config = yaml.load(raw) as ApiConfig;
            return this.config;
        } catch (e: any) {
            logger.error(`Failed to load api_config.yaml`, { error: e.message });
            this.config = { models: {} };
            return this.config;
        }
    }

    public getModelConfig(modelName: string): ModelConfig | undefined {
        return this.config.models?.[modelName];
    }

    public getResolvedApiKey(targetModel: string): string {
        const modelConfig = this.getModelConfig(targetModel);
        if (!modelConfig) {
            throw ErrorFactory.compilationFailed(`Model configuration for '${targetModel}' not found.`);
        }

        const required = modelConfig.required_env || [];
        const fallback = modelConfig.fallback_env || [];

        // Check required envs first
        for (const envVar of required) {
            if (process.env[envVar]) {
                return process.env[envVar] as string;
            }
        }

        // Check fallback envs
        for (const envVar of fallback) {
            if (process.env[envVar]) {
                logger.debug(`Using fallback API key from ${envVar} for model ${targetModel}`);
                return process.env[envVar] as string;
            }
        }

        const allEnvs = [...required, ...fallback].join(' or ');
        throw ErrorFactory.compilationFailed(
            `Missing API Key for model '${targetModel}'. Please set ${allEnvs} in .env/secrets.env`
        );
    }
}

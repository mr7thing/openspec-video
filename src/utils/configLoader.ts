import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';
import { ErrorFactory } from '../errors/OpsVError';

export interface ModelConfig {
    enable?: boolean;
    type?: 'image_generation' | 'video_generation';
    input?: string[];
    output?: string;
    model?: string;
    api_url?: string;
    api_status_url?: string;
    defaults?: any;
    max_reference_images?: number;
    quality_map?: Record<string, any>;
}

export interface ProviderConfig {
    required_env?: string[];
    models?: Record<string, ModelConfig>;
}

export interface ApiConfig {
    providers: Record<string, ProviderConfig>;
}

export class ConfigLoader {
    private static instances = new Map<string, ConfigLoader>();
    private config: ApiConfig;
    private projectRoot: string;

    private constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.config = { providers: {} };
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
            this.config = { providers: {} };
            return this.config;
        }

        try {
            const raw = await fs.readFile(configPath, 'utf8');
            this.config = yaml.load(raw) as ApiConfig;
            if (!this.config.providers) {
                this.config.providers = {};
            }
            return this.config;
        } catch (e: any) {
            logger.error(`Failed to load api_config.yaml`, { error: e.message });
            this.config = { providers: {} };
            return this.config;
        }
    }

    public getProviderConfig(providerName: string): ProviderConfig | undefined {
        return this.config.providers?.[providerName];
    }

    public getModelConfig(providerName: string, modelKey: string): ModelConfig | undefined {
        return this.config.providers?.[providerName]?.models?.[modelKey];
    }

    public findModelsByCapability(providerName: string, type: 'image_generation' | 'video_generation'): { key: string, config: ModelConfig }[] {
        const provider = this.getProviderConfig(providerName);
        if (!provider || !provider.models) return [];
        
        const results: { key: string, config: ModelConfig }[] = [];
        for (const [key, config] of Object.entries(provider.models)) {
            if (config.enable !== false && config.type === type) {
                results.push({ key, config });
            }
        }
        return results;
    }

    public getResolvedApiKey(providerName: string): string {
        const providerConfig = this.getProviderConfig(providerName);
        if (!providerConfig) {
            throw ErrorFactory.compilationFailed(`Provider configuration for '${providerName}' not found.`);
        }

        const required = providerConfig.required_env || [];

        // Check required envs
        for (const envVar of required) {
            if (process.env[envVar]) {
                return process.env[envVar] as string;
            }
        }

        const allEnvs = required.join(' or ');
        throw ErrorFactory.compilationFailed(
            `Missing API Key for provider '${providerName}'. Please set ${allEnvs} in .env/secrets.env`
        );
    }
}

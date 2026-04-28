// ============================================================================
// OpsV v0.8 Task Builder
// Shared compile logic: Job → provider-specific TaskJson
// ============================================================================

import path from 'path';
import fs from 'fs';
import { Job, TaskJson } from '../../types/Job';
import { ModelConfig, ConfigLoader } from '../../utils/configLoader';
import { FileUtils } from '../../utils/FileUtils';
import { ProviderCompiler, CompileContext } from './ProviderCompiler';
import { VolcengineCompiler } from './providers/VolcengineCompiler';
import { SiliconFlowCompiler } from './providers/SiliconFlowCompiler';
import { MinimaxCompiler } from './providers/MinimaxCompiler';
import { RunningHubCompiler } from './providers/RunningHubCompiler';
import { ComfyUICompiler } from './providers/ComfyUICompiler';
import { WebappCompiler } from './providers/WebappCompiler';
import { logger } from '../../utils/logger';

const COMPILERS: Record<string, ProviderCompiler> = {
  volcengine: new VolcengineCompiler(),
  siliconflow: new SiliconFlowCompiler(),
  minimax: new MinimaxCompiler(),
  runninghub: new RunningHubCompiler(),
  comfyui: new ComfyUICompiler(),
  webapp: new WebappCompiler(),
};

function getCompiler(provider: string): ProviderCompiler {
  const compiler = COMPILERS[provider];
  if (!compiler) {
    throw new Error(`Unknown provider: ${provider}. Available: ${Object.keys(COMPILERS).join(', ')}`);
  }
  return compiler;
}

export class TaskBuilder {
  private configLoader: ConfigLoader;

  constructor(projectRoot: string) {
    this.configLoader = ConfigLoader.getInstance();
    this.configLoader.loadConfig(projectRoot);
  }

  compileToDir(
    jobs: Job[],
    modelKey: string,
    outputDir: string,
    dryRun = false
  ): TaskJson[] {
    const modelConfig = this.configLoader.getModelConfig(modelKey);
    if (!modelConfig) {
      throw new Error(`Model '${modelKey}' not found in api_config.yaml`);
    }

    const apiKey = this.configLoader.getResolvedApiKey(modelKey);
    const compiler = getCompiler(modelConfig.provider);

    const results: TaskJson[] = [];

    for (const job of jobs) {
      const ctx: CompileContext = {
        job,
        modelConfig,
        apiKey,
        outputDir,
      };

      const taskJson = compiler.compile(ctx);
      results.push(taskJson);

      if (!dryRun) {
        const filePath = path.join(outputDir, `${job.id}.json`);
        FileUtils.writeJson(filePath, taskJson);
        logger.info(`Compiled: ${job.id} → ${filePath}`);
      }
    }

    return results;
  }

  static getCompiler(provider: string): ProviderCompiler {
    return getCompiler(provider);
  }

  static parseModelKey(modelKey: string): { provider: string; model: string } {
    const dotIdx = modelKey.indexOf('.');
    if (dotIdx <= 0) {
      throw new Error(`Invalid model key '${modelKey}'. Expected format: provider.model`);
    }
    return {
      provider: modelKey.slice(0, dotIdx),
      model: modelKey.slice(dotIdx + 1),
    };
  }
}

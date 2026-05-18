// ============================================================================
// OpsV Task Builder
// Shared compile logic: Job → provider-specific TaskJson
// ============================================================================

import path from 'path';
import fs from 'fs';
import { Job, BaseTaskJson } from '../../types/Job';
import { ModelConfig } from '../../utils/configLoader';
import { FileUtils } from '../../utils/FileUtils';
import { ProviderCompiler, CompileContext } from './ProviderCompiler';
import { VolcengineCompiler } from './providers/VolcengineCompiler';
import { SiliconFlowCompiler } from './providers/SiliconFlowCompiler';
import { MinimaxCompiler } from './providers/MinimaxCompiler';
import { RunningHubCompiler } from './providers/RunningHubCompiler';
import { ComfyUICompiler } from './providers/ComfyUICompiler';
import { WebappCompiler } from './providers/WebappCompiler';
import { logger } from '../../utils/logger';
import { CompilationError, ConfigError, OpsVErrorCode } from '../../errors/OpsVError';
import { Container } from '../../container/Container';
import { OpsVContext } from '../../container/OpsVContext';

const COMPILERS: Record<string, new () => ProviderCompiler> = {
  volcengine: VolcengineCompiler,
  siliconflow: SiliconFlowCompiler,
  minimax: MinimaxCompiler,
  runninghub: RunningHubCompiler,
  comfylocal: ComfyUICompiler,
  webapp: WebappCompiler,
};

export class TaskBuilder {
  private ctx: OpsVContext;

  constructor(ctx: OpsVContext) {
    this.ctx = ctx;
  }

  async compileToDir(
    jobs: Job[],
    modelKey: string,
    outputDir: string,
    dryRun = false,
    workflowPath?: string,
    workflowDir?: string,
    forceApiMapping?: boolean
  ): Promise<BaseTaskJson<unknown>[]> {
    const modelConfig = this.ctx.configLoader.getModelConfig(modelKey);
    if (!modelConfig) {
      throw new ConfigError(OpsVErrorCode.CONFIG_INVALID_MODEL, `Model '${modelKey}' not found in api_config.yaml`);
    }

    const apiKey = this.ctx.configLoader.getResolvedApiKey(modelKey);
    const compiler = this.resolveCompiler(modelConfig.provider);

    const results: BaseTaskJson<unknown>[] = [];

    for (const job of jobs) {
      const ctx: CompileContext = {
        job,
        modelKey,
        modelConfig,
        apiKey,
        outputDir,
        projectRoot: this.ctx.projectRoot,
        workflowPath: workflowPath || job.workflow_path || job.workflow_id || job.workflow,
        forceApiMapping,
        workflowDir,
        referenceImages: job.reference_images,
        referenceVideos: job.reference_videos,
        referenceAudios: job.reference_audios,
        refCount: job.reference_images?.length || 0,
        nodeMapping: forceApiMapping
          ? (modelConfig.node_mappings && Object.keys(modelConfig.node_mappings).length > 0 ? modelConfig.node_mappings : {})
          : (job.node_mapping && Object.keys(job.node_mapping).length > 0 ? job.node_mapping : modelConfig.node_mappings),
      };

      const taskJson = compiler.compile(ctx);
      results.push(taskJson);

      if (!dryRun) {
        const filePath = path.join(outputDir, `${job.id}.json`);
        await FileUtils.writeJson(filePath, taskJson);
        logger.info(`Compiled: ${job.id} → ${filePath}`);
      }
    }

    return results;
  }

  private resolveCompiler(provider: string): ProviderCompiler {
    const ctor = COMPILERS[provider];
    if (!ctor) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_INVALID_REF, `Unknown provider: ${provider}. Available: ${Object.keys(COMPILERS).join(', ')}`);
    }
    return new ctor();
  }

  static parseModelKey(modelKey: string): { provider: string; model: string } {
    const dotIdx = modelKey.indexOf('.');
    if (dotIdx <= 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_INVALID_REF, `Invalid model key '${modelKey}'. Expected format: provider.model`);
    }
    return {
      provider: modelKey.slice(0, dotIdx),
      model: modelKey.slice(dotIdx + 1),
    };
  }
}

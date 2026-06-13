// ============================================================================
// OpsV Task Builder (v0.10.0)
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
import { RHapiCompiler } from './providers/RHapiCompiler';
import { logger } from '../../utils/logger';
import { CompilationError, ConfigError, OpsVErrorCode } from '../../errors/OpsVError';
import { OpsVContext } from '../../container/OpsVContext';
import { bindRefs } from '../RefBinder';
import { FrontmatterParser } from '../FrontmatterParser';
import { ResolvedRef } from '../../types/FrontmatterSchema';
import { RefsByType, PromptCompileMode } from '../../types/Refs';
import { InputTypesLoader } from '../../utils/inputTypesLoader';
import { compilePrompt } from './PromptCompiler';

const COMPILERS: Record<string, new () => ProviderCompiler> = {
  volcengine: VolcengineCompiler,
  siliconflow: SiliconFlowCompiler,
  minimax: MinimaxCompiler,
  runninghub: RunningHubCompiler,
  comfylocal: ComfyUICompiler,
  webapp: WebappCompiler,
  rhapi: RHapiCompiler,
};

export class TaskBuilder {
  private ctx: OpsVContext;
  private inputTypes: InputTypesLoader;

  constructor(ctx: OpsVContext) {
    this.ctx = ctx;
    this.inputTypes = new InputTypesLoader();
    if (this.ctx.projectRoot) {
      this.inputTypes.load(this.ctx.projectRoot, { silent: true });
    }
  }

  async compileToDir(
    jobs: Job[],
    modelKey: string,
    outputDir: string,
    dryRun = false,
    workflowPath?: string,
    workflowDir?: string,
    forceApiMapping?: boolean,
    promptCompileMode?: PromptCompileMode,
  ): Promise<BaseTaskJson<unknown>[]> {
    const modelConfig = this.ctx.configLoader.getModelConfig(modelKey);
    if (!modelConfig) {
      throw new ConfigError(OpsVErrorCode.CONFIG_INVALID_MODEL, `Model '${modelKey}' not found in api_config.yaml`);
    }

    const apiKey = this.ctx.configLoader.getResolvedApiKey(modelKey);
    const compiler = this.resolveCompiler(modelConfig.provider);

    const results: BaseTaskJson<unknown>[] = [];

    for (const jobInput of jobs) {
      let job = jobInput;
      // Resolve refs via RefBinder if job has frontmatter refs
      let resolvedRefs: ResolvedRef[] | undefined;
      let groupedInputs: Record<string, string[]> | undefined;

      if (job._meta?.source && this.ctx.projectRoot) {
        try {
          const sourcePath = job._meta.source;
          if (sourcePath && fs.existsSync(sourcePath)) {
            const content = fs.readFileSync(sourcePath, 'utf-8');
            const { frontmatter } = FrontmatterParser.parseRaw(content);
            const rawRefs = frontmatter.refs as RefsByType | undefined;

            if (rawRefs && Object.keys(rawRefs).length > 0) {
              const binderResult = bindRefs(rawRefs, {
                projectRoot: this.ctx.projectRoot,
                inputTypes: this.inputTypes,
              });
              resolvedRefs = binderResult.resolved;
              groupedInputs = binderResult.groupedInputs;
              for (const err of binderResult.errors) {
                logger.warn(`TaskBuilder refs[${job.id}]: ${err}`);
              }
            }
          }
        } catch (err: any) {
          logger.debug(`TaskBuilder: RefBinder skipped for ${job.id}: ${err.message}`);
        }
      }

      // Effective prompt compile mode: CLI > job > api_config > default
      const effectiveMode: PromptCompileMode =
        promptCompileMode || modelConfig.prompt_compile_mode || 'keep';

      // Apply PromptCompiler if we have resolved refs
      let refsMap: Record<string, string> | undefined;
      if (resolvedRefs && resolvedRefs.length > 0) {
        const originalPrompt = job.prompt || job.payload.prompt || '';
        const compiled = compilePrompt(originalPrompt, resolvedRefs, effectiveMode);
        if (effectiveMode !== 'keep') {
          job = {
            ...job,
            prompt: compiled.prompt,
            payload: { ...job.payload, prompt: compiled.prompt },
          };
        }
        refsMap = compiled.refsMap;
      }

      // Backfill referenceImages/Videos/Audios from groupedInputs if not on job
      const refImages = job.reference_images && job.reference_images.length > 0
        ? job.reference_images
        : groupedInputs?.image || [];
      const refVideos = job.reference_videos && job.reference_videos.length > 0
        ? job.reference_videos
        : groupedInputs?.video || [];
      const refAudios = job.reference_audios && job.reference_audios.length > 0
        ? job.reference_audios
        : groupedInputs?.audio || [];

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
        referenceImages: refImages,
        referenceVideos: refVideos,
        referenceAudios: refAudios,
        refCount: refImages.length,
        nodeMapping: forceApiMapping
          ? (modelConfig.node_mappings && Object.keys(modelConfig.node_mappings).length > 0 ? modelConfig.node_mappings : {})
          : (job.node_mapping && Object.keys(job.node_mapping).length > 0 ? job.node_mapping : modelConfig.node_mappings),
        resolvedRefs,
        groupedInputs,
        promptCompileMode: effectiveMode,
      };

      const taskJson = compiler.compile(ctx);

      // Attach _refs_map to _opsv metadata when in keep mode (so model can resolve @-tokens)
      if (effectiveMode === 'keep' && refsMap && Object.keys(refsMap).length > 0) {
        (taskJson._opsv as unknown as Record<string, unknown>)._refs_map = refsMap;
      }

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

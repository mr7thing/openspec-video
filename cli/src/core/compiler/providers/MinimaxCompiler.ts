// ============================================================================
// OpsV Minimax Provider Compiler
// Covers: minimax image generation
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { resolveDuration } from '../shared/compilerUtils';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';

export class MinimaxCompiler implements ProviderCompiler {
  readonly provider = 'minimax';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    const isImage = modelConfig.type === 'imagen';

    if (isImage) {
      return this.compileImageTask(ctx);
    }

    return this.compileVideoTask(ctx);
  }

  private compileImageTask(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'MinimaxCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'MinimaxCompiler: model is required in api_config.yaml');

    // Build base payload: from payload_example if available, else hardcoded
    let payload: Record<string, any>;
    if (modelConfig.payload_example) {
      payload = structuredClone(modelConfig.payload_example);
      if (payload.prompt === '' || payload.prompt === undefined || payload.prompt === null) {
        payload.prompt = job.prompt || job.payload.prompt;
      }
    } else {
      payload = {
        model: modelConfig.model,
        prompt: job.prompt || job.payload.prompt,
        aspect_ratio: job.payload.global_settings?.aspect_ratio || modelConfig.defaults?.aspect_ratio || '1:1',
      };
    }

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_image = ctx.referenceImages[0];
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'minimax',
        modelKey: ctx.modelKey,
        type: 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }

  private compileVideoTask(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'MinimaxCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'MinimaxCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'MinimaxCompiler: model is required in api_config.yaml');

    // Build base payload: from payload_example if available, else hardcoded
    let payload: Record<string, any>;
    if (modelConfig.payload_example) {
      payload = structuredClone(modelConfig.payload_example);
      if (payload.prompt === '' || payload.prompt === undefined || payload.prompt === null) {
        payload.prompt = job.prompt || job.payload.prompt;
      }
    } else {
      payload = {
        model: modelConfig.model,
        prompt: job.prompt || job.payload.prompt,
      };
    }

    // Resolution: frontmatter > api_config.defaults
    const resolution = (job.payload.global_settings as any)?.resolution || modelConfig.defaults?.resolution;
    if (resolution) {
      payload.resolution = resolution;
    }

    // Duration: frontmatter > api_config.defaults
    const duration = resolveDuration(job, modelConfig);
    if (duration !== undefined) {
      payload.duration = duration;
    }

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.first_frame_image = job.payload.frame_ref.first;
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'minimax',
        modelKey: ctx.modelKey,
        type: 'video',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

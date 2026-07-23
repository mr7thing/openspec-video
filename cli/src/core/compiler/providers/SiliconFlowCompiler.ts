// ============================================================================
// OpsV SiliconFlow Provider Compiler
// Covers: wan (video), qwenimg (image)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { resolveSize } from '../shared/compilerUtils';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';

export class SiliconFlowCompiler implements ProviderCompiler {
  readonly provider = 'siliconflow';

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
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'SiliconFlowCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'SiliconFlowCompiler: model is required in api_config.yaml');

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
        image_size: resolveSize(job.payload.global_settings, modelConfig, 'image_size'),
        batch_size: 1,
      };
    }

    // Merge remaining defaults (cfg_scale, steps, seed, num_inference_steps, cfg, etc.)
    const defaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
      if (['image_size'].includes(key)) continue;
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.image = ctx.referenceImages[0];
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'siliconflow',
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
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'SiliconFlowCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'SiliconFlowCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'SiliconFlowCompiler: model is required in api_config.yaml');

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

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else {
      // Legacy: hardcoded frame ref injection
      if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
        payload.image = job.payload.frame_ref.first;
      }

      if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
        payload.tail_image = job.payload.frame_ref.last;
      }
    }

    // Merge defaults (image_size, seed, etc.)
    const defaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
      if (['model', 'prompt', 'image', 'tail_image'].includes(key)) continue;
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'siliconflow',
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

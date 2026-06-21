// ============================================================================
// OpsV RHapi Provider Compiler
// RunningHub Standard Model API — direct REST, NOT ComfyUI workflow mode
// Covers: imagen (全能图片V2/X/G-2, GPT Image 2) and video (Seedance 2.0, Vidu)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { resolveSize } from '../shared/compilerUtils';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';

const RHAPI_QUERY_ENDPOINT = 'https://www.runninghub.cn/openapi/v2/query';

export class RHapiCompiler implements ProviderCompiler {
  readonly provider = 'rhapi';

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
    if (!modelConfig.api_url) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        'RHapiCompiler: api_url is required in api_config.yaml');
    }

    const payload: Record<string, any> = {
      prompt: job.prompt || job.payload.prompt,
    };

    // Inject aspect ratio from global_settings if model doesn't have explicit size
    const aspectRatio = job.payload.global_settings?.aspect_ratio;
    if (aspectRatio && !modelConfig.defaults?.aspectRatio && !modelConfig.defaults?.size) {
      payload.aspectRatio = aspectRatio;
    }

    // Merge remaining defaults (aspectRatio, resolution, quality, model, etc.)
    const defaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Resolve inputs via InputEvaluator if configured
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = {
        job, modelConfig,
        referenceImages: ctx.referenceImages,
        referenceVideos: ctx.referenceVideos,
        referenceAudios: ctx.referenceAudios,
        groupedInputs: ctx.groupedInputs,
      };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      // Legacy: inject imageUrls from refs
      const maxRefs = modelConfig.max_reference_images || 10;
      payload.imageUrls = ctx.referenceImages.slice(0, maxRefs);
    }

    // Inject registered asset IDs from resolvedRefs (doc-level, provider-agnostic)
    if (ctx.resolvedRefs) {
      const characterRefs = ctx.resolvedRefs
        .filter(r => r.assetId)
        .map(r => ({ id: r.key, asset_id: r.assetId }));
      if (characterRefs.length > 0) {
        payload.characterRefs = characterRefs;
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhapi',
        modelKey: ctx.modelKey,
        type: 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url || RHAPI_QUERY_ENDPOINT,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }

  private compileVideoTask(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        'RHapiCompiler: api_url is required in api_config.yaml');
    }

    const payload: Record<string, any> = {
      prompt: job.prompt || job.payload.prompt,
    };

    // Duration
    const duration = job.payload.duration || modelConfig.defaults?.duration;
    if (duration !== undefined && duration !== null) {
      payload.duration = String(duration);
    }

    // Aspect ratio
    const aspectRatio = job.payload.global_settings?.aspect_ratio;
    if (aspectRatio && !modelConfig.defaults?.ratio) {
      payload.ratio = aspectRatio;
    }

    // Merge remaining defaults (resolution, ratio, generateAudio, realPersonMode, etc.)
    const defaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Resolve inputs via InputEvaluator if configured (handles imageUrls, videoUrls, audioUrls, etc.)
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = {
        job, modelConfig,
        referenceImages: ctx.referenceImages,
        referenceVideos: ctx.referenceVideos,
        referenceAudios: ctx.referenceAudios,
        groupedInputs: ctx.groupedInputs,
      };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else {
      // Legacy: inject references directly
      if (ctx.referenceImages && ctx.referenceImages.length > 0) {
        const maxRefs = modelConfig.max_reference_images || 9;
        payload.imageUrls = ctx.referenceImages.slice(0, maxRefs);
      }
      if (ctx.referenceVideos && ctx.referenceVideos.length > 0) {
        const maxRefs = modelConfig.max_reference_videos || 3;
        payload.videoUrls = ctx.referenceVideos.slice(0, maxRefs);
      }
      if (ctx.referenceAudios && ctx.referenceAudios.length > 0) {
        const maxRefs = modelConfig.max_reference_audios || 3;
        payload.audioUrls = ctx.referenceAudios.slice(0, maxRefs);
      }
    }

    // Inject registered asset IDs from resolvedRefs (doc-level, provider-agnostic)
    if (ctx.resolvedRefs) {
      const characterRefs = ctx.resolvedRefs
        .filter(r => r.assetId)
        .map(r => ({ id: r.key, asset_id: r.assetId }));
      if (characterRefs.length > 0) {
        payload.characterRefs = characterRefs;
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhapi',
        modelKey: ctx.modelKey,
        type: 'video',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url || RHAPI_QUERY_ENDPOINT,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

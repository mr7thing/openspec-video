// ============================================================================
// OpsV Volcengine Provider Compiler
// Covers: seadream (image), seedance2 (video)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { resolveSize, resolveDuration } from '../shared/compilerUtils';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';

export class VolcengineCompiler implements ProviderCompiler {
  readonly provider = 'volcengine';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig, apiKey } = ctx;
    const isImage = modelConfig.type === 'imagen';

    if (isImage) {
      return this.compileImageTask(ctx);
    }

    return this.compileVideoTask(ctx);
  }

  private compileImageTask(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'VolcengineCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'VolcengineCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt || job.payload.prompt,
      size: resolveSize(job.payload.global_settings, modelConfig, 'size'),
    };

    // Support sequential image generation (组图)
    const seqGen = (modelConfig.defaults as any)?.sequential_image_generation;
    if (seqGen) {
      payload.sequential_image_generation = seqGen;
      const maxImages = (modelConfig.defaults as any)?.max_images;
      if (maxImages) {
        payload.sequential_image_generation_options = { max_images: maxImages };
      }
    }

    // Merge remaining defaults (steps, cfg_scale, negative_prompt, output_format, watermark, etc.)
    const defaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(defaults)) {
      if (['size', 'sequential_image_generation', 'max_images'].includes(key)) continue;
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_images = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 1);
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'volcengine',
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
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'VolcengineCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'VolcengineCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'VolcengineCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      content: [
        {
          type: 'text',
          text: job.prompt || job.payload.prompt,
        },
      ],
    };

    // Duration: frontmatter > api_config.defaults
    const duration = resolveDuration(job, modelConfig);
    if (duration !== undefined) {
      payload.duration = duration;
    }

    if (job.payload.camera) {
      payload.camera = job.payload.camera;
    }

    // Merge remaining defaults (ratio, generate_audio, watermark, etc.)
    const videoDefaults = modelConfig.defaults || {};
    for (const [key, value] of Object.entries(videoDefaults)) {
      if (['model', 'content', 'camera', 'duration'].includes(key)) continue;
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: ctx.referenceImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else {
      // Legacy: hardcoded reference injection
      if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
        payload.content.push({ type: 'image_url', image_url: { url: job.payload.frame_ref.first }, role: 'first_frame' });
      }

      if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
        payload.content.push({ type: 'image_url', image_url: { url: job.payload.frame_ref.last }, role: 'last_frame' });
      }

      if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
        const refs = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 1);
        for (const url of refs) {
          payload.content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
        }
      }

      if (ctx.referenceVideos && ctx.referenceVideos.length > 0 && modelConfig.supports_reference_videos) {
        const refs = ctx.referenceVideos.slice(0, modelConfig.max_reference_videos || 3);
        for (const url of refs) {
          payload.content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
        }
      }

      if (ctx.referenceAudios && ctx.referenceAudios.length > 0 && modelConfig.supports_reference_audios) {
        const refs = ctx.referenceAudios.slice(0, modelConfig.max_reference_audios || 1);
        for (const url of refs) {
          payload.content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
        }
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'volcengine',
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

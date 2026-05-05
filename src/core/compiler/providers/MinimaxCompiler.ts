// ============================================================================
// OpsV v0.8 Minimax Provider Compiler
// Covers: minimax image generation
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';

export class MinimaxCompiler implements ProviderCompiler {
  readonly provider = 'minimax';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    const isImage = modelConfig.type === 'imagen';

    if (isImage) {
      return this.compileImageTask(ctx);
    }

    return this.compileVideoTask(ctx);
  }

  private compileImageTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('MinimaxCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('MinimaxCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt_en || job.payload.prompt,
      aspect_ratio: job.payload.global_settings?.aspect_ratio || modelConfig.defaults?.aspect_ratio || '1:1',
    };

    if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_image = ctx.referenceImages[0];
    }

    return {
      ...payload,
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

  private compileVideoTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('MinimaxCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('MinimaxCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('MinimaxCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt_en || job.payload.prompt,
    };

    // Resolution: frontmatter > api_config.defaults
    const resolution = (job.payload.global_settings as any)?.resolution || modelConfig.defaults?.resolution;
    if (resolution) {
      payload.resolution = resolution;
    }

    // Duration: frontmatter > api_config.defaults
    const duration = job.payload.duration || modelConfig.defaults?.duration;
    if (duration !== undefined && duration !== null) {
      const durationStr = String(duration);
      const durationNum = parseInt(durationStr, 10);
      payload.duration = isNaN(durationNum) ? duration : durationNum;
    }

    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.first_frame_image = job.payload.frame_ref.first;
    }

    return {
      ...payload,
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

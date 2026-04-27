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
    const apiUrl = modelConfig.api_url || 'https://api.minimax.chat/v1/image_generation';

    const payload: Record<string, any> = {
      model: modelConfig.model || 'minimax-image-01',
      prompt: job.prompt_en || job.payload.prompt,
      aspect_ratio: job.payload.global_settings?.aspect_ratio || '1:1',
    };

    if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_image = ctx.referenceImages[0];
    }

    return {
      ...payload,
      _opsv: {
        provider: 'minimax',
        modelKey: modelConfig.model || 'minimax-image-01',
        type: 'imagen',
        shotId: job.id,
        api_url: apiUrl,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }

  private compileVideoTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    const apiUrl = modelConfig.api_url || 'https://api.minimax.chat/v1/video_generation';
    const statusUrl = modelConfig.api_status_url || 'https://api.minimax.chat/v1/query/video_generation';

    const payload: Record<string, any> = {
      model: modelConfig.model || 'video-01',
      prompt: job.prompt_en || job.payload.prompt,
    };

    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.first_frame_image = job.payload.frame_ref.first;
    }

    return {
      ...payload,
      _opsv: {
        provider: 'minimax',
        modelKey: modelConfig.model || 'video-01',
        type: 'video',
        shotId: job.id,
        api_url: apiUrl,
        api_status_url: statusUrl,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

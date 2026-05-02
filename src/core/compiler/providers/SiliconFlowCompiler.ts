// ============================================================================
// OpsV v0.8 SiliconFlow Provider Compiler
// Covers: wan (video), qwenimg (image)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';
import { ModelConfig } from '../../../utils/configLoader';

export class SiliconFlowCompiler implements ProviderCompiler {
  readonly provider = 'siliconflow';

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
    if (!modelConfig.api_url) throw new Error('SiliconFlowCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('SiliconFlowCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt_en || job.payload.prompt,
      image_size: this.resolveSize(job.payload.global_settings, modelConfig),
      batch_size: 1,
    };

    if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.image = ctx.referenceImages[0];
    }

    return {
      ...payload,
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

  private compileVideoTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('SiliconFlowCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('SiliconFlowCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('SiliconFlowCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt_en || job.payload.prompt,
    };

    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.image = job.payload.frame_ref.first;
    }

    if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
      payload.tail_image = job.payload.frame_ref.last;
    }

    return {
      ...payload,
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

  private resolveSize(globalSettings: any, modelConfig: ModelConfig): string {
    const quality = globalSettings?.quality || 'standard';
    if (modelConfig.quality_map && modelConfig.quality_map[quality]) {
      return modelConfig.quality_map[quality];
    }

    const aspect = globalSettings?.aspect_ratio || '1:1';
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1920x1080',
      '9:16': '1080x1920',
    };
    return sizeMap[aspect] || '1024x1024';
  }
}

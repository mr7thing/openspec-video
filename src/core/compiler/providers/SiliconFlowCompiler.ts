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
    const apiUrl = modelConfig.api_url || 'https://api.siliconflow.cn/v1/images/generations';

    const payload: Record<string, any> = {
      model: modelConfig.model || 'Qwen/Qwen2.5-VL-72B-Instruct',
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
        provider: 'siliconflow',
        modelKey: modelConfig.model || 'qwenimg',
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
    const apiUrl = modelConfig.api_url || 'https://api.siliconflow.cn/v1/video/submit';
    const statusUrl = modelConfig.api_status_url || 'https://api.siliconflow.cn/v1/video/status';

    const payload: Record<string, any> = {
      model: modelConfig.model || 'wan',
      prompt: job.prompt_en || job.payload.prompt,
    };

    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.image_url = job.payload.frame_ref.first;
    }

    if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
      payload.tail_image_url = job.payload.frame_ref.last;
    }

    return {
      ...payload,
      _opsv: {
        provider: 'siliconflow',
        modelKey: modelConfig.model || 'wan',
        type: 'video',
        shotId: job.id,
        api_url: apiUrl,
        api_status_url: statusUrl,
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

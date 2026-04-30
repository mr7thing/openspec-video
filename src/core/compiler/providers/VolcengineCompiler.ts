// ============================================================================
// OpsV v0.8 Volcengine Provider Compiler
// Covers: seadream (image), seedance2 (video)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';
import { ModelConfig } from '../../../utils/configLoader';

export class VolcengineCompiler implements ProviderCompiler {
  readonly provider = 'volcengine';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig, apiKey } = ctx;
    const isImage = modelConfig.type === 'imagen';

    if (isImage) {
      return this.compileImageTask(ctx);
    }

    return this.compileVideoTask(ctx);
  }

  private compileImageTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('VolcengineCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('VolcengineCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      prompt: job.prompt_en || job.payload.prompt,
      size: this.resolveSize(job.payload.global_settings, modelConfig),
      n: 1,
    };

    if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_images = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 1);
    }

    return {
      ...payload,
      _opsv: {
        provider: 'volcengine',
        modelKey: modelConfig.model,
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
    if (!modelConfig.api_url) throw new Error('VolcengineCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('VolcengineCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('VolcengineCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      content: [
        {
          type: 'video',
          text: job.prompt_en || job.payload.prompt,
        },
      ],
    };

    if (job.payload.duration) {
      payload.duration = job.payload.duration;
    }

    if (job.payload.camera) {
      payload.camera = job.payload.camera;
    }

    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.content.push({ type: 'image_url', image_url: { url: job.payload.frame_ref.first } });
    }

    if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
      payload.content.push({ type: 'image_url', image_url: { url: job.payload.frame_ref.last } });
    }

    return {
      ...payload,
      _opsv: {
        provider: 'volcengine',
        modelKey: modelConfig.model,
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
      '4:3': '1024x768',
      '3:4': '768x1024',
    };
    return sizeMap[aspect] || '1024x1024';
  }
}

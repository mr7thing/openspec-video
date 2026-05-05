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

    if (ctx.referenceImages && ctx.referenceImages.length > 0 && modelConfig.supports_reference_images) {
      payload.reference_images = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 1);
    }

    return {
      ...payload,
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

  private compileVideoTask(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('VolcengineCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('VolcengineCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('VolcengineCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      model: modelConfig.model,
      content: [
        {
          type: 'text',
          text: job.prompt_en || job.payload.prompt,
        },
      ],
    };

    // Duration: frontmatter > api_config.defaults
    const duration = job.payload.duration || modelConfig.defaults?.duration;
    if (duration !== undefined && duration !== null) {
      const durationStr = String(duration);
      const durationNum = parseInt(durationStr, 10);
      payload.duration = isNaN(durationNum) ? duration : durationNum;
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

    return {
      ...payload,
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

  private resolveSize(globalSettings: any, modelConfig: ModelConfig): string {
    // Priority: defaults.size > quality_map > aspect_ratio sizeMap > fallback
    if (modelConfig.defaults?.size) {
      return modelConfig.defaults.size;
    }

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

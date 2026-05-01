// ============================================================================
// OpsV v0.8 Webapp Provider Compiler
// Browser automation: gemini, wan, jimeng, etc.
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';

export class WebappCompiler implements ProviderCompiler {
  readonly provider = 'webapp';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('WebappCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('WebappCompiler: api_status_url is required in api_config.yaml');
    const defaults = modelConfig.defaults || {};

    const payload: Record<string, any> = {
      task_id: job.id,
      target_url: defaults.target_url || '',
      prompt: job.prompt_en || job.payload.prompt,
      typing_speed: defaults.typing_speed || 'human',
      watermark_removal: defaults.watermark_removal ?? true,
      upload_method: defaults.upload_method || 'drag-drop',
    };

    // Reference images — pass as local paths (extension reads via native host)
    if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      payload.reference_files = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 1);
    }

    // First/last frame reference
    if (job.payload.frame_ref?.first && modelConfig.supports_first_image) {
      payload.frame_ref = {
        first: job.payload.frame_ref.first,
        last: job.payload.frame_ref?.last || null,
      };
    }

    return {
      ...payload,
      _opsv: {
        provider: modelConfig.provider || 'webapp',
        modelKey: ctx.modelKey,
        type: 'webapp' as const,
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

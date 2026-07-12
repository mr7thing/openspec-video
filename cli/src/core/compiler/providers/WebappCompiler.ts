// ============================================================================
// OpsV Webapp Provider Compiler
// Browser automation via Chrome Extension bridge (Gemini)
// Supports dynamic inputs binding via api_config.yaml > model > inputs
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';

export class WebappCompiler implements ProviderCompiler {
  readonly provider = 'webapp';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'WebappCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'WebappCompiler: api_status_url is required in api_config.yaml');
    const defaults = modelConfig.defaults || {};

    const payload: Record<string, any> = {
      task_id: job.id,
      target_url: defaults.target_url || '',
      prompt: job.prompt || job.payload.prompt,
      typing_speed: defaults.typing_speed || 'human',
      watermark_removal: defaults.watermark_removal ?? true,
      upload_method: defaults.upload_method || 'drag-drop',
    };

    // Resolve inputs via InputEvaluator if configured, else legacy behavior
    const inputs = modelConfig.inputs;
    if (inputs && Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = {
        job,
        modelConfig,
        referenceImages: ctx.referenceImages,
        referenceVideos: ctx.referenceVideos,
        referenceAudios: ctx.referenceAudios,
        groupedInputs: ctx.groupedInputs,
      };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else {
      // Legacy: hardcoded reference injection
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
    }

    return {
      payload,
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

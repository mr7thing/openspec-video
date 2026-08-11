// ============================================================================
// OpsV RH_CLI Provider Compiler
// RunningHub via RH_CLI subprocess (`rh`) — generic endpoint runner.
//   mode=model: payload keys → --param k=v (media files routed by provider)
//   mode=app:   payload keys → node_mappings → --node / --file
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, applyToPayload, InputEvalContext } from '../shared/InputEvaluator';
import { JobType } from '../../../types/Job';

export class RhCliCompiler implements ProviderCompiler {
  readonly provider = 'rhcli';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;
    const rh = modelConfig.rh || {};
    const mode = rh.mode || 'model';

    if (mode === 'model' && !rh.endpoint_id) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        `RhCliCompiler: rh.endpoint_id is required for model '${ctx.modelKey}' (mode=model)`);
    }
    if (mode === 'app' && (!rh.app_id || /^REPLACE_WITH_/i.test(rh.app_id))) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        `RhCliCompiler: a real rh.app_id is required for model '${ctx.modelKey}' (mode=app); ` +
        'the bundled AI app entry is a template and must be copied into project config first');
    }

    // Base payload: payload_example template (or empty)
    const payload: Record<string, any> = structuredClone(modelConfig.payload_example ?? {});

    // Prompt injection: only when no inputs binding claims the prompt source
    const inputs = modelConfig.inputs || {};
    const promptClaimed = Object.values(inputs).some(b => b.source === 'prompt');
    if (!promptClaimed) {
      const promptKey = 'prompt' in payload ? 'prompt' : ('text' in payload ? 'text' : 'prompt');
      if (payload[promptKey] === '' || payload[promptKey] === undefined || payload[promptKey] === null) {
        payload[promptKey] = job.prompt || job.payload.prompt;
      }
    }

    // Merge order (lowest → highest): rh.params < defaults < compiled/injected
    // values. Both are fill-if-undefined merges, so defaults run first to win.
    for (const [key, value] of Object.entries(modelConfig.defaults || {})) {
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }
    for (const [key, value] of Object.entries(rh.params || {})) {
      if (value !== undefined && value !== null && payload[key] === undefined) {
        payload[key] = value;
      }
    }

    // Duration passthrough (video jobs)
    if (payload.duration === undefined && job.payload.duration !== undefined) {
      payload.duration = job.payload.duration;
    }

    // Aspect ratio from global_settings when the model doesn't pin one
    const aspectRatio = job.payload.global_settings?.aspect_ratio;
    if (aspectRatio && payload.aspectRatio === undefined && !modelConfig.defaults?.aspectRatio) {
      payload.aspectRatio = aspectRatio;
    }

    // Resolve inputs via InputEvaluator (prompt/refs[image]/default.* → target keys)
    if (Object.keys(inputs).length > 0) {
      const evalCtx: InputEvalContext = {
        job, modelConfig,
        referenceImages: ctx.referenceImages,
        referenceVideos: ctx.referenceVideos,
        referenceAudios: ctx.referenceAudios,
        groupedInputs: ctx.groupedInputs,
      };
      const values = evaluateInputs(inputs, evalCtx);
      applyToPayload(values, inputs, payload);
    } else if (mode === 'model') {
      // Legacy fallback: inject references under conventional keys
      if (ctx.referenceImages?.length) {
        payload.imageUrls = ctx.referenceImages.slice(0, modelConfig.max_reference_images || 10);
      }
      if (ctx.referenceVideos?.length) {
        payload.videoUrl = ctx.referenceVideos[0];
      }
      if (ctx.referenceAudios?.length) {
        payload.audio = ctx.referenceAudios[0];
      }
    }

    const type: JobType = modelConfig.type || (mode === 'app' ? 'comfy' : 'video');

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhcli',
        modelKey: ctx.modelKey,
        type,
        shotId: job.id,
        // Informational descriptor — rhcli has no HTTP URL; provider reads
        // rh.endpoint_id / rh.app_id from the model config at execute time.
        api_url: `rhcli://${mode}/${mode === 'app' ? rh.app_id : rh.endpoint_id}`,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

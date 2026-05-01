// ============================================================================
// OpsV v0.8 RunningHub Provider Compiler
// Covers: RunningHub ComfyUI cloud execution
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';

export class RunningHubCompiler implements ProviderCompiler {
  readonly provider = 'runninghub';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    if (!modelConfig.api_url) throw new Error('RunningHubCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('RunningHubCompiler: api_status_url is required in api_config.yaml');
    if (!modelConfig.model) throw new Error('RunningHubCompiler: model is required in api_config.yaml');

    const payload: Record<string, any> = {
      workflow_template: modelConfig.model,
      parameters: {
        'input-prompt': job.prompt_en || job.payload.prompt,
      },
    };

    if (job.payload.frame_ref?.first) {
      payload.parameters['input-image1'] = job.payload.frame_ref.first;
    }

    if (job.payload.frame_ref?.last && modelConfig.supports_last_image) {
      payload.parameters['input-image2'] = job.payload.frame_ref.last;
    }

    if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      for (let i = 0; i < ctx.referenceImages.length; i++) {
        payload.parameters[`reference-image-${i + 1}`] = ctx.referenceImages[i];
      }
    }

    return {
      ...payload,
      _opsv: {
        provider: modelConfig.provider || 'runninghub',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

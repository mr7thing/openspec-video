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
    const apiUrl = modelConfig.api_url || 'https://www.runninghub.cn/task/openapi/comfyui/post';
    const statusUrl = modelConfig.api_status_url || 'https://www.runninghub.cn/task/openapi/comfyui/status';

    const payload: Record<string, any> = {
      workflow_template: modelConfig.model || 'default',
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
        provider: 'runninghub',
        modelKey: modelConfig.model || 'default',
        type: modelConfig.type === 'video' ? 'video_generation' : 'image_generation',
        shotId: job.id,
        api_url: apiUrl,
        api_status_url: statusUrl,
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// OpsV v0.8 ComfyUI Local Provider Compiler
// Covers: Local ComfyUI workflow execution
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';

export class ComfyUICompiler implements ProviderCompiler {
  readonly provider = 'comfyui';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;
    const templateName = modelConfig.model || 'default.json';

    let workflow: Record<string, any> = {};
    if (modelConfig.defaults?.templateDir) {
      const templatePath = path.join(modelConfig.defaults.templateDir, templateName);
      if (fs.existsSync(templatePath)) {
        workflow = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      }
    }

    const parameters: Record<string, any> = {
      'input-prompt': job.prompt_en || job.payload.prompt,
    };

    if (job.payload.frame_ref?.first) {
      parameters['input-image1'] = job.payload.frame_ref.first;
    }

    if (job.payload.frame_ref?.last) {
      parameters['input-image2'] = job.payload.frame_ref.last;
    }

    if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      for (let i = 0; i < ctx.referenceImages.length; i++) {
        parameters[`reference-image-${i + 1}`] = ctx.referenceImages[i];
      }
    }

    this.injectParameters(workflow, parameters);

    return {
      ...workflow,
      _opsv: {
        provider: 'comfyui',
        modelKey: templateName.replace(/\.json$/, ''),
        type: modelConfig.type === 'video' ? 'video_generation' : 'image_generation',
        shotId: job.id,
        api_url: modelConfig.api_url || 'http://127.0.0.1:8188',
        references: ctx.referenceImages,
        compiledAt: new Date().toISOString(),
      },
    };
  }

  private injectParameters(workflow: Record<string, any>, params: Record<string, any>): void {
    const paramKeys = Object.keys(params);

    for (const nodeId in workflow) {
      const node = workflow[nodeId];
      if (!node) continue;

      const title = node._meta?.title || node.title || '';

      if (paramKeys.includes(title)) {
        const injectValue = params[title];

        if (node.inputs) {
          if ('text' in node.inputs) {
            node.inputs['text'] = injectValue;
          } else if ('text_1' in node.inputs) {
            node.inputs['text_1'] = injectValue;
          } else if ('image' in node.inputs) {
            node.inputs['image'] = injectValue;
          } else if ('video' in node.inputs) {
            node.inputs['video'] = injectValue;
          } else {
            const firstKey = Object.keys(node.inputs)[0];
            if (firstKey) node.inputs[firstKey] = injectValue;
          }
        }
      }
    }
  }
}

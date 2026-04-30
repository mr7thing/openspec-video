// ============================================================================
// OpsV v0.8.4 ComfyUI Compiler
// Workflow auto-matching by ref(N) pattern + _opsv_workflow validation
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';

export class ComfyUICompiler implements ProviderCompiler {
  readonly provider = 'comfyui';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig, workflowPath, workflowDir, refCount } = ctx;

    // Validate required config
    if (!modelConfig.api_url) throw new Error('ComfyUICompiler: api_url is required in api_config.yaml');

    // 1. Resolve workflow file
    let workflowFile: string;
    if (workflowPath) {
      // --workflow specified: absolute path or filename in workflowDir
      if (path.isAbsolute(workflowPath)) {
        workflowFile = workflowPath;
      } else {
        const dir = workflowDir || modelConfig.defaults?.templateDir;
        if (!dir) {
          throw new Error(`Cannot resolve --workflow "${workflowPath}": no workflow directory specified`);
        }
        workflowFile = path.join(dir, workflowPath);
      }
    } else {
      // Auto-match by ref(N) pattern
      const dir = workflowDir || modelConfig.defaults?.templateDir;
      if (!dir) {
        throw new Error('No workflow directory specified. Use --workflow-dir or set defaults.templateDir in api_config.yaml');
      }
      workflowFile = this.resolveWorkflow(dir, refCount || 0, job.id);
    }

    if (!fs.existsSync(workflowFile)) {
      throw new Error(`Workflow file not found: ${workflowFile}`);
    }

    // 2. Load workflow
    const workflow: Record<string, any> = JSON.parse(fs.readFileSync(workflowFile, 'utf-8'));

    // 3. Validate _opsv_workflow metadata
    const meta = workflow._opsv_workflow;
    if (!meta || !Array.isArray(meta.image_inputs) || meta.image_inputs.length === 0) {
      throw new Error(
        `Workflow ${path.basename(workflowFile)} missing _opsv_workflow.image_inputs. ` +
        'Each workflow JSON must declare: { "_opsv_workflow": { "image_inputs": [...], "text_inputs": [...] } }'
      );
    }

    // 4. Build parameter map
    const parameters: Record<string, any> = {};

    // Text inputs: map by _opsv_workflow.text_inputs order
    const textInputs: string[] = Array.isArray(meta.text_inputs) ? meta.text_inputs : [];
    if (textInputs.length > 0) {
      parameters[textInputs[0]] = job.prompt_en || job.payload.prompt;
    } else {
      parameters['input-prompt'] = job.prompt_en || job.payload.prompt;
    }

    // Frame refs (legacy, for backward compat)
    if (job.payload.frame_ref?.first) {
      parameters['input-image1'] = job.payload.frame_ref.first;
    }
    if (job.payload.frame_ref?.last) {
      parameters['input-image2'] = job.payload.frame_ref.last;
    }

    // Reference images: inject by _opsv_workflow.image_inputs order
    const refImages = ctx.referenceImages || job.reference_images || [];
    const imageInputs = meta.image_inputs as string[];
    for (let i = 0; i < imageInputs.length; i++) {
      if (i < refImages.length) {
        parameters[imageInputs[i]] = refImages[i];
      }
      // Remaining slots stay empty (workflow template defaults)
    }

    // Extra params from payload
    if (job.payload.extra) {
      for (const [key, value] of Object.entries(job.payload.extra)) {
        if (key !== 'media_refs' && value !== undefined && value !== null) {
          parameters[key] = value;
        }
      }
    }

    // 5. Inject into workflow nodes
    this.injectParameters(workflow, parameters);

    return {
      ...workflow,
      _opsv: {
        provider: 'comfyui',
        modelKey: modelConfig.model || path.basename(workflowFile, '.json'),
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        references: refImages.length > 0 ? refImages : undefined,
        workflowFile: path.basename(workflowFile),
        compiledAt: new Date().toISOString(),
      },
    };
  }

  private resolveWorkflow(dir: string, refCount: number, assetId: string): string {
    if (!fs.existsSync(dir)) {
      throw new Error(`Workflow directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const refPattern = /ref(\d+)/;

    const candidates: Array<{ file: string; n: number }> = [];
    for (const f of files) {
      const m = f.match(refPattern);
      if (m) candidates.push({ file: f, n: parseInt(m[1]) });
    }

    if (candidates.length === 0) {
      throw new Error(
        `No workflow files with ref(N) pattern found in ${dir}. ` +
        'Files must be named like ref0.json, ref1.json, ref2.json...'
      );
    }

    candidates.sort((a, b) => a.n - b.n);

    // Exact match
    const exact = candidates.find(c => c.n === refCount);
    if (exact) return path.join(dir, exact.file);

    // Best under (discard excess refs)
    const under = candidates.filter(c => c.n < refCount);
    if (under.length > 0) {
      logger.warn(`Asset "${assetId}" has ${refCount} ref images, using workflow with ${under[under.length - 1].n} slots (excess refs discarded)`);
      return path.join(dir, under[under.length - 1].file);
    }

    // Best over (leave empty slots)
    const over = candidates.filter(c => c.n > refCount);
    if (over.length > 0) {
      logger.warn(`Asset "${assetId}" has ${refCount} ref images, using workflow with ${over[0].n} slots (empty slots will use defaults)`);
      return path.join(dir, over[0].file);
    }

    throw new Error(`No matching workflow for refCount=${refCount} in ${dir}`);
  }

  private injectParameters(workflow: Record<string, any>, params: Record<string, any>): void {
    const paramKeys = Object.keys(params);

    for (const nodeId in workflow) {
      const node = workflow[nodeId];
      if (!node || nodeId === '_opsv_workflow') continue;

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

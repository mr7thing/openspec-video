// ============================================================================
// OpsV ComfyUI Compiler
// Resolve workflow JSON from config `workflow` path, inject params via node_mappings
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { CompilationError, ConfigError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, applyToNodeMapping, InputEvalContext } from '../shared/InputEvaluator';

interface ComfyUIWorkflowNode {
  inputs?: Record<string, any>;
  [key: string]: any;
}

interface ComfyUIWorkflow {
  [nodeId: string]: ComfyUIWorkflowNode;
}

export class ComfyUICompiler implements ProviderCompiler {
  readonly provider = 'comfyui';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig, workflowPath, projectRoot } = ctx;

    // Validate required config
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'ComfyUICompiler: api_url is required in api_config.yaml');

    // Helper: resolve file path relative to projectRoot
    const resolvePath = (filePath: string): string => {
      if (path.isAbsolute(filePath)) return filePath;
      if (projectRoot) return path.join(projectRoot, filePath);
      return filePath;
    };

    // 1. Resolve workflow file
    let workflowFile: string;
    if (workflowPath) {
      // --workflow specified: absolute or relative to projectRoot
      workflowFile = resolvePath(workflowPath);
    } else if (modelConfig.workflow) {
      // Use workflow path from api_config
      workflowFile = resolvePath(modelConfig.workflow);
    } else {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND,
        'No workflow file specified. Use --workflow or set workflow in api_config.yaml'
      );
    }

    if (!fs.existsSync(workflowFile)) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND, `Workflow file not found: ${workflowFile}`);
    }

    // 2. Load workflow
    let workflow: ComfyUIWorkflow;
    try {
      workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf-8'));
    } catch (parseErr: any) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_PARSE_FAILED, `Failed to parse workflow JSON ${workflowFile}: ${parseErr.message}`);
    }

    // 3. Optional _opsv_workflow metadata (legacy, ignored in unified mode)
    // const meta = workflow._opsv_workflow;

    // 4. Build parameter map — unified mode only
    if (!ctx.nodeMapping || Object.keys(ctx.nodeMapping).length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_NODE_MAPPING_MISSING,
        'ComfyUICompiler: node_mapping is required. ' +
        'Use "opsv comfy-node-mapping <workflow.json>" to generate it, ' +
        'then add it to frontmatter or api_config.yaml.'
      );
    }

    const parameters: Record<string, any> = {};
    let refImages = ctx.referenceImages || job.reference_images || [];

    // Cap reference images if max_reference_images is configured
    if (modelConfig.max_reference_images !== undefined && refImages.length > modelConfig.max_reference_images) {
      logger.warn(`ComfyUICompiler: ${refImages.length} ref images provided, using first ${modelConfig.max_reference_images} (max_reference_images limit)`);
      refImages = refImages.slice(0, modelConfig.max_reference_images);
    }

    // Resolve inputs via InputEvaluator (uses api_config inputs if defined)
    const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: refImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
    const inputs = modelConfig.inputs;

    if (inputs && Object.keys(inputs).length > 0) {
      // New path: evaluate configured inputs, then apply to node mapping
      const values = evaluateInputs(inputs, evalCtx);
      Object.assign(parameters, values);
    } else {
      // Legacy path: resolve nodeMapping keys by naming convention
      for (const key of Object.keys(ctx.nodeMapping)) {
        // Inline fallback for keys not resolved by InputEvaluator
        if (!(key in parameters)) {
          const value = resolveLegacyValue(key, evalCtx);
          if (value !== undefined && value !== null) {
            parameters[key] = value;
          }
        }
      }
    }

    // Extra params from payload (only if mapped in nodeMapping and not already set)
    if (job.payload.extra) {
      for (const [key, value] of Object.entries(job.payload.extra)) {
        if (key !== 'media_refs' && value !== undefined && value !== null) {
          if (ctx.nodeMapping[key] && !(key in parameters)) {
            parameters[key] = value;
          }
        }
      }
    }

    // 5. Inject into workflow nodes
    this.injectByNodeMapping(workflow, parameters, ctx.nodeMapping);

    return {
      payload: workflow,
      _opsv: {
        provider: modelConfig.provider || 'comfyui',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        references: refImages.length > 0 ? refImages : undefined,
        workflowFile: path.basename(workflowFile),
        compiledAt: new Date().toISOString(),
      },
    };
  }

  // Unified injection: use explicit nodeMapping (frontmatter or api_config)
  private injectByNodeMapping(
    workflow: Record<string, any>,
    params: Record<string, any>,
    nodeMapping: Record<string, { nodeId: string; fieldName: string }>
  ): void {
    applyToNodeMapping(params, nodeMapping, workflow);
  }
}

// Legacy value resolution (fallback when no inputs config)
function resolveLegacyValue(key: string, ctx: InputEvalContext): unknown {
  const { job, modelConfig } = ctx;
  if (key === 'prompt') return job.prompt || job.payload.prompt;
  if (key === 'negative_prompt') return job.payload.extra?.negative_prompt || modelConfig.defaults?.negative_prompt;
  if (/^image\d+$/.test(key)) {
    const idx = parseInt(key.replace('image', ''), 10) - 1;
    const imgs = ctx.referenceImages || [];
    if (!isNaN(idx) && idx >= 0 && idx < imgs.length) return imgs[idx];
    return undefined;
  }
  if (key === 'first_frame') return job.payload.frame_ref?.first;
  if (key === 'last_frame') return job.payload.frame_ref?.last;
  if (job.payload.extra && key in job.payload.extra && key !== 'media_refs') return job.payload.extra[key];
  if (modelConfig.defaults && key in modelConfig.defaults) return (modelConfig.defaults as any)[key];
  return undefined;
}

// ============================================================================
// OpsV ComfyUI Compiler
// Workflow auto-matching by ref(N) pattern + _opsv_workflow validation
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { CompilationError, ConfigError, InfrastructureError, OpsVErrorCode } from '../../../errors/OpsVError';
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
    const { job, modelConfig, workflowPath, workflowDir, refCount, projectRoot } = ctx;

    // Validate required config
    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'ComfyUICompiler: api_url is required in api_config.yaml');

    // Helper: resolve workflow directory relative to projectRoot if needed
    const resolveWorkflowDir = (dir: string): string => {
      if (path.isAbsolute(dir)) return dir;
      if (projectRoot) return path.join(projectRoot, dir);
      return dir;
    };

    // 1. Resolve workflow file
    let workflowFile: string;
    if (workflowPath) {
      // --workflow specified: absolute path or filename in workflowDir
      if (path.isAbsolute(workflowPath)) {
        workflowFile = workflowPath;
      } else {
        const dir = workflowDir || modelConfig.workflowdir;
        if (!dir) {
          throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND, `Cannot resolve --workflow "${workflowPath}": no workflow directory specified`);
        }
        workflowFile = path.join(resolveWorkflowDir(dir), workflowPath);
      }
    } else {
      // Auto-match by ref(N) pattern
      const dir = workflowDir || modelConfig.workflowdir;
      if (!dir) {
        throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND, 'No workflow directory specified. Use --workflow-dir or set workflowdir in api_config.yaml');
      }
      workflowFile = this.resolveWorkflow(resolveWorkflowDir(dir), refCount || 0, job.id);
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

  private resolveWorkflow(dir: string, refCount: number, assetId: string): string {
    if (!fs.existsSync(dir)) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND, `Workflow directory not found: ${dir}`);
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const refPattern = /ref(\d+)/;

    const candidates: Array<{ file: string; n: number }> = [];
    for (const f of files) {
      const m = f.match(refPattern);
      if (m) candidates.push({ file: f, n: parseInt(m[1]) });
    }

    if (candidates.length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND,
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

    // Best over (leave empty slots) — pick the one with n closest to refCount
    const over = candidates.filter(c => c.n > refCount);
    if (over.length > 0) {
      over.sort((a, b) => a.n - b.n);
      logger.warn(`Asset "${assetId}" has ${refCount} ref images, using workflow with ${over[0].n} slots (empty slots will use defaults)`);
      return path.join(dir, over[0].file);
    }

    throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND, `No matching workflow for refCount=${refCount} in ${dir}`);
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

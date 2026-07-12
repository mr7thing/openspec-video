// ============================================================================
// OpsV RunningHub Provider Compiler
// Unified parameter mapping: reads nodeMapping from frontmatter or api_config
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { ConfigError, CompilationError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, buildNodeInfoList, InputEvalContext } from '../shared/InputEvaluator';

export class RunningHubCompiler implements ProviderCompiler {
  readonly provider = 'rhworkflow-v1';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;

    if (!modelConfig.api_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'RunningHubCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND, 'RunningHubCompiler: api_status_url is required in api_config.yaml');

    // workflowId 来源：frontmatter.workflow_id > api_config.workflowId
    const workflowId = ctx.workflowPath || modelConfig.workflowId;
    if (!workflowId) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND,
        'RunningHubCompiler: workflowId is required. ' +
        'Set it in frontmatter (workflow: "...") or in api_config.yaml (workflowId: "...").'
      );
    }

    // nodeMapping 来源：frontmatter.node_mapping > api_config.node_mappings
    const mappings = ctx.nodeMapping || modelConfig.node_mappings || {};

    if (Object.keys(mappings).length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_NODE_MAPPING_MISSING,
        'RunningHubCompiler: node_mapping is required. ' +
        'Set it in frontmatter (node_mapping: { ... }) or in api_config.yaml (node_mappings: { ... }). ' +
        'Use "opsv comfy-node-mapping <workflow.json>" to generate it.'
      );
    }

    const nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: any }> = [];

    // Reference images (supports up to max_reference_images)
    const refImages = ctx.referenceImages || job.reference_images || [];
    const maxRefImages = modelConfig.max_reference_images || 9;
    const cappedRefImages = refImages.slice(0, maxRefImages);

    if (cappedRefImages.length < refImages.length) {
      logger.warn(`RunningHubCompiler: ${refImages.length} ref images provided, using first ${maxRefImages} (max_reference_images limit)`);
    }

    // ------------------------------------------------------------------------
    // Resolve inputs via InputEvaluator (uses api_config inputs if defined)
    // ------------------------------------------------------------------------
    const evalCtx: InputEvalContext = { job, modelConfig, referenceImages: cappedRefImages, referenceVideos: ctx.referenceVideos, referenceAudios: ctx.referenceAudios, groupedInputs: ctx.groupedInputs };
    const inputs = modelConfig.inputs;

    if (inputs && Object.keys(inputs).length > 0) {
      const values = evaluateInputs(inputs, evalCtx);
      const mapped = buildNodeInfoList(values, mappings);
      nodeInfoList.push(...mapped);
    } else {
      // Legacy path: resolve nodeMapping keys by naming convention
      for (const [key, mapping] of Object.entries(mappings)) {
        const value = resolveLegacyValue(key, evalCtx);
        if (value !== undefined && value !== null) {
          nodeInfoList.push({
            nodeId: mapping.nodeId,
            fieldName: mapping.fieldName,
            fieldValue: value,
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // Build RunningHub task payload
    // ------------------------------------------------------------------------
    let payload: Record<string, any>;
    if (modelConfig.payload_example) {
      payload = structuredClone(modelConfig.payload_example);
      // Override dynamic fields
      payload.workflowId = workflowId;
      payload.nodeInfoList = nodeInfoList;
    } else {
      payload = {
        workflowId,
        nodeInfoList,
      };

      const defaults = modelConfig.defaults || {};

      if (defaults.addMetadata !== undefined) {
        payload.addMetadata = defaults.addMetadata;
      }
      if (defaults.retainSeconds !== undefined && defaults.retainSeconds !== null) {
        payload.retainSeconds = defaults.retainSeconds;
      }
      if (defaults.instanceType !== undefined && defaults.instanceType !== null) {
        payload.instanceType = defaults.instanceType;
      }
      if (defaults.usePersonalQueue !== undefined) {
        payload.usePersonalQueue = defaults.usePersonalQueue;
      }
      if (defaults.accessPassword !== undefined && defaults.accessPassword !== null) {
        payload.accessPassword = defaults.accessPassword;
      }
      if (defaults.webhookUrl !== undefined && defaults.webhookUrl !== null) {
        payload.webhookUrl = defaults.webhookUrl;
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhworkflow-v1',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url,
        workflowId,
        references: cappedRefImages.length > 0 ? cappedRefImages : undefined,
        compiledAt: new Date().toISOString(),
      },
    };
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
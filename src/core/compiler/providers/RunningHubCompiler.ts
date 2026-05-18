// ============================================================================
// OpsV RunningHub Provider Compiler
// Unified parameter mapping: reads nodeMapping from frontmatter or api_config
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { ConfigError, CompilationError, OpsVErrorCode } from '../../../errors/OpsVError';

export class RunningHubCompiler implements ProviderCompiler {
  readonly provider = 'runninghub';

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
    // Map parameters via nodeMapping (unified logic for all comfy providers)
    // Iterate node_mapping keys and resolve value by OpsV naming convention.
    // ------------------------------------------------------------------------
    for (const [key, mapping] of Object.entries(mappings)) {
      let value: any = undefined;

      if (key === 'prompt') {
        value = job.prompt || job.payload.prompt;
      } else if (key === 'negative_prompt') {
        value = job.payload.extra?.negative_prompt || modelConfig.defaults?.negative_prompt;
      } else if (/^image\d+$/.test(key)) {
        const idx = parseInt(key.replace('image', ''), 10) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < cappedRefImages.length) {
          value = cappedRefImages[idx];
        }
      } else if (key === 'first_frame') {
        value = job.payload.frame_ref?.first;
      } else if (key === 'last_frame') {
        value = job.payload.frame_ref?.last;
      } else if (job.payload.extra && key in job.payload.extra && key !== 'media_refs') {
        value = job.payload.extra[key];
      } else if (modelConfig.defaults && key in modelConfig.defaults) {
        value = modelConfig.defaults[key];
      }

      if (value !== undefined && value !== null) {
        nodeInfoList.push({
          nodeId: mapping.nodeId,
          fieldName: mapping.fieldName,
          fieldValue: value,
        });
      }
    }

    // ------------------------------------------------------------------------
    // Build RunningHub task payload
    // ------------------------------------------------------------------------
    const payload: Record<string, any> = {
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

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'runninghub',
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

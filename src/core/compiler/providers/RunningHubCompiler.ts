// ============================================================================
// OpsV v0.9 RunningHub Provider Compiler
// Unified parameter mapping: reads nodeMapping from frontmatter or api_config
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { TaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';

export class RunningHubCompiler implements ProviderCompiler {
  readonly provider = 'runninghub';

  compile(ctx: CompileContext): TaskJson {
    const { job, modelConfig } = ctx;

    if (!modelConfig.api_url) throw new Error('RunningHubCompiler: api_url is required in api_config.yaml');
    if (!modelConfig.api_status_url) throw new Error('RunningHubCompiler: api_status_url is required in api_config.yaml');

    // workflowId 来源：frontmatter.workflow > api_config.workflowId
    const workflowId = ctx.workflowPath || modelConfig.workflowId;
    if (!workflowId) {
      throw new Error(
        'RunningHubCompiler: workflowId is required. ' +
        'Set it in frontmatter (workflow: "...") or in api_config.yaml (workflowId: "...").'
      );
    }

    // nodeMapping 来源：frontmatter.node_mapping > api_config.node_mappings
    const mappings = ctx.nodeMapping || modelConfig.node_mappings || {};

    if (Object.keys(mappings).length === 0) {
      throw new Error(
        'RunningHubCompiler: node_mapping is required. ' +
        'Set it in frontmatter (node_mapping: { ... }) or in api_config.yaml (node_mappings: { ... }). ' +
        'Use "opsv comfy-node-mapping <workflow.json>" to generate it.'
      );
    }

    const nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: any }> = [];

    // ------------------------------------------------------------------------
    // Map parameters via nodeMapping (unified logic for all comfy providers)
    // ------------------------------------------------------------------------

    // Prompt
    if (mappings.prompt) {
      const promptText = job.prompt_en || job.payload.prompt;
      if (promptText) {
        nodeInfoList.push({
          nodeId: mappings.prompt.nodeId,
          fieldName: mappings.prompt.fieldName,
          fieldValue: promptText,
        });
      }
    }

    // Negative prompt (from defaults or extra)
    if (mappings.negative_prompt) {
      const neg = job.payload.extra?.negative_prompt || modelConfig.defaults?.negative_prompt;
      if (neg) {
        nodeInfoList.push({
          nodeId: mappings.negative_prompt.nodeId,
          fieldName: mappings.negative_prompt.fieldName,
          fieldValue: neg,
        });
      }
    }

    // Reference images (supports up to max_reference_images)
    const refImages = ctx.referenceImages || job.reference_images || [];
    const maxRefImages = modelConfig.max_reference_images || 9;
    const cappedRefImages = refImages.slice(0, maxRefImages);

    for (let i = 0; i < cappedRefImages.length; i++) {
      const key = `image${i + 1}`;
      if (mappings[key]) {
        nodeInfoList.push({
          nodeId: mappings[key].nodeId,
          fieldName: mappings[key].fieldName,
          fieldValue: cappedRefImages[i],
        });
      }
    }

    if (cappedRefImages.length < refImages.length) {
      logger.warn(`RunningHubCompiler: ${refImages.length} ref images provided, using first ${maxRefImages} (max_reference_images limit)`);
    }

    // First / last frame
    if (mappings.first_frame && job.payload.frame_ref?.first) {
      nodeInfoList.push({
        nodeId: mappings.first_frame.nodeId,
        fieldName: mappings.first_frame.fieldName,
        fieldValue: job.payload.frame_ref.first,
      });
    }
    if (mappings.last_frame && job.payload.frame_ref?.last) {
      nodeInfoList.push({
        nodeId: mappings.last_frame.nodeId,
        fieldName: mappings.last_frame.fieldName,
        fieldValue: job.payload.frame_ref.last,
      });
    }

    // Extra params (skip media_refs and already-mapped keys)
    if (job.payload.extra) {
      for (const [key, value] of Object.entries(job.payload.extra)) {
        if (key === 'media_refs') continue;
        if (value === undefined || value === null) continue;
        if (mappings[key]) {
          nodeInfoList.push({
            nodeId: mappings[key].nodeId,
            fieldName: mappings[key].fieldName,
            fieldValue: value,
          });
        }
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
    if (defaults.retainSeconds) {
      payload.retainSeconds = defaults.retainSeconds;
    }
    if (defaults.instanceType) {
      payload.instanceType = defaults.instanceType;
    }
    if (defaults.usePersonalQueue !== undefined) {
      payload.usePersonalQueue = defaults.usePersonalQueue;
    }
    if (defaults.accessPassword) {
      payload.accessPassword = defaults.accessPassword;
    }
    if (defaults.webhookUrl) {
      payload.webhookUrl = defaults.webhookUrl;
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
        workflowId,
        references: cappedRefImages.length > 0 ? cappedRefImages : undefined,
        compiledAt: new Date().toISOString(),
      },
    };
  }
}

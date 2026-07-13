// ============================================================================
// OpsV RhWorkflow Provider Compiler
// RunningHub Workflow Run API — comfy 模式
// POST https://api.runninghub.cn/run/workflow/{apiId}  + nodeInfoList or inputs
// 兼容旧模式 (runninghub.*) 和新模式 (rhworkflow.*)
//
// 支持两种 payload 格式:
//   - nodeInfoList: [{ nodeId: "46", fieldName: "xxx", fieldValue: "yyy" }]
//   - inputs:       [{ nodeId: 46,  fieldName: "xxx", value: "yyy" }]
//
// 通过 api_config.yaml 的 node_list_format 配置选择格式:
//   node_list_format: nodeInfoList  (默认，旧工作流兼容)
//   node_list_format: inputs        (LTXDirector 等新工作流)
// ============================================================================

import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { ConfigError, CompilationError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, buildNodeInfoList, InputEvalContext } from '../shared/InputEvaluator';

export type NodeListFormat = 'nodeInfoList' | 'inputs';

interface NodeInfoItem {
  nodeId: string | number;
  fieldName: string;
  fieldValue?: any;
  value?: any;
}

export class RhWorkflowCompiler implements ProviderCompiler {
  readonly provider = 'rhworkflow-v2';

  compile(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;

    if (!modelConfig.api_url) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        'RhWorkflowCompiler: api_url is required in api_config.yaml');
    }
    if (!modelConfig.api_status_url) {
      throw new ConfigError(OpsVErrorCode.CONFIG_KEY_NOT_FOUND,
        'RhWorkflowCompiler: api_status_url is required in api_config.yaml');
    }

    // nodeMapping 来源：frontmatter.node_mapping > api_config.node_mappings
    const mappings = ctx.nodeMapping || modelConfig.node_mappings || {};

    if (Object.keys(mappings).length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_NODE_MAPPING_MISSING,
        'RhWorkflowCompiler: node_mapping is required. ' +
        'Use "opsv comfy-node-mapping <workflow.json>" to generate it, ' +
        'then add it to frontmatter or api_config.yaml.'
      );
    }

    // Determine output format: nodeInfoList (legacy) or inputs (new LTXDirector)
    const format: NodeListFormat = (modelConfig as any).node_list_format || 'nodeInfoList';

    const rawItems: Array<{ nodeId: string; fieldName: string; fieldValue: any }> = [];

    // Reference images (supports up to max_reference_images)
    const refImages = ctx.referenceImages || job.reference_images || [];
    const maxRefImages = modelConfig.max_reference_images || 9;
    const cappedRefImages = refImages.slice(0, maxRefImages);

    if (cappedRefImages.length < refImages.length) {
      logger.warn(`RhWorkflowCompiler: ${refImages.length} ref images provided, using first ${maxRefImages} (max_reference_images limit)`);
    }

    // Resolve inputs via InputEvaluator (uses api_config inputs if defined)
    const evalCtx: InputEvalContext = {
      job, modelConfig,
      referenceImages: cappedRefImages,
      referenceVideos: ctx.referenceVideos,
      referenceAudios: ctx.referenceAudios,
      groupedInputs: ctx.groupedInputs,
    };
    const inputs = modelConfig.inputs;

    if (inputs && Object.keys(inputs).length > 0) {
      const values = evaluateInputs(inputs, evalCtx);
      const mapped = buildNodeInfoList(values, mappings);
      rawItems.push(...mapped);
    } else {
      // Legacy path: resolve nodeMapping keys by naming convention
      for (const [key, mapping] of Object.entries(mappings)) {
        const value = resolveLegacyValue(key, evalCtx);
        if (value !== undefined && value !== null) {
          rawItems.push({
            nodeId: mapping.nodeId,
            fieldName: mapping.fieldName,
            fieldValue: value,
          });
        }
      }
    }

    // Convert to target format
    const nodeList: NodeInfoItem[] = format === 'inputs'
      ? rawItems.map(item => ({
          nodeId: parseInt(item.nodeId, 10) || item.nodeId,  // numeric nodeId for inputs format
          fieldName: item.fieldName,
          value: item.fieldValue,
        }))
      : rawItems;  // keep original nodeInfoList format

    // Build payload — 注意：不包含 workflowId（API ID 在 URL 中）
    let payload: Record<string, any>;
    if (modelConfig.payload_example) {
      payload = structuredClone(modelConfig.payload_example);
      // Set the correct key based on format
      if (format === 'inputs') {
        payload.inputs = nodeList;
      } else {
        payload.nodeInfoList = nodeList;
      }
    } else {
      payload = format === 'inputs'
        ? { inputs: nodeList }
        : { nodeInfoList: nodeList };

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
      if (defaults.webhookUrl !== undefined) {
        payload.webhookUrl = defaults.webhookUrl;
      }
      // 传递上传模式给执行器
      if (defaults.upload_method !== undefined) {
        payload.upload_method = defaults.upload_method;
      }
    }

    // Store format info in payload for executor
    payload._node_list_format = format;

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhworkflow-v2',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url,
        api_status_url: modelConfig.api_status_url,
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

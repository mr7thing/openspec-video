// ============================================================================
// OpsV RhWorkflow Provider Compiler
// RunningHub Workflow Run API — comfy 模式
// POST https://api.runninghub.cn/run/workflow/{apiId}
//
// 支持两种模式:
//   - nodeInfoList (默认): 使用节点参数覆盖
//   - workflow: 直接传修改后的工作流 JSON
//
// 通过 api_config.yaml 的 workflow_mode 配置选择模式:
//   workflow_mode: nodeInfoList  (默认)
//   workflow_mode: workflow      (LTXDirector 等复杂工作流推荐)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ProviderCompiler, CompileContext } from '../ProviderCompiler';
import { BaseTaskJson } from '../../../types/Job';
import { logger } from '../../../utils/logger';
import { ConfigError, CompilationError, OpsVErrorCode } from '../../../errors/OpsVError';
import { evaluateInputs, buildNodeInfoList, InputEvalContext } from '../shared/InputEvaluator';

export type WorkflowMode = 'nodeInfoList' | 'workflow';

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

    // Determine workflow mode
    const workflowMode: WorkflowMode = (modelConfig as any).workflow_mode || 'nodeInfoList';

    if (workflowMode === 'workflow') {
      return this.compileWorkflowMode(ctx);
    }

    return this.compileNodeInfoListMode(ctx);
  }

  /**
   * Workflow mode: 读取工作流 JSON，直接修改后发送
   * 适合 LTXDirector 等复杂工作流
   */
  private compileWorkflowMode(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;

    // 读取工作流 JSON 文件
    const workflowPath = modelConfig.workflow;
    if (!workflowPath) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND,
        'RhWorkflowCompiler: workflow path is required for workflow mode. ' +
        'Set it in api_config.yaml (workflow: "...").');
    }

    // 解析工作流文件路径（相对项目根目录）
    const projectRoot = ctx.projectRoot || process.cwd();
    const fullPath = path.isAbsolute(workflowPath)
      ? workflowPath
      : path.resolve(projectRoot, workflowPath);

    if (!fs.existsSync(fullPath)) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_NOT_FOUND,
        `RhWorkflowCompiler: workflow file not found: ${fullPath}`);
    }

    let workflowJson: Record<string, any>;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      workflowJson = JSON.parse(content);
    } catch (err: any) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_WORKFLOW_PARSE_FAILED,
        `RhWorkflowCompiler: failed to parse workflow JSON: ${err.message}`);
    }

    // Reference images
    const refImages = ctx.referenceImages || job.reference_images || [];
    const maxRefImages = modelConfig.max_reference_images || 9;
    const cappedRefImages = refImages.slice(0, maxRefImages);

    // 构建 payload
    const payload: Record<string, any> = {
      workflow: JSON.stringify(workflowJson),
      addMetadata: modelConfig.defaults?.addMetadata ?? false,
      instanceType: modelConfig.defaults?.instanceType ?? 'default',
      usePersonalQueue: modelConfig.defaults?.usePersonalQueue ?? false,
    };

    // 传递其他默认参数
    const defaults = modelConfig.defaults || {};
    if (defaults.retainSeconds !== undefined) payload.retainSeconds = defaults.retainSeconds;
    if (defaults.accessPassword !== undefined) payload.accessPassword = defaults.accessPassword;
    if (defaults.webhookUrl !== undefined) payload.webhookUrl = defaults.webhookUrl;
    if (defaults.upload_method !== undefined) payload.upload_method = defaults.upload_method;

    // 标记使用工作流模式，执行器需要处理文件上传
    payload._workflow_mode = 'workflow';
    payload._workflow_json = workflowJson;

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhworkflow-v2',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url!,
        api_status_url: modelConfig.api_status_url!,
        references: cappedRefImages.length > 0 ? cappedRefImages : undefined,
        compiledAt: new Date().toISOString(),
      },
    };
  }

  /**
   * NodeInfoList mode: 传统的节点参数覆盖方式
   */
  private compileNodeInfoListMode(ctx: CompileContext): BaseTaskJson<Record<string, unknown>> {
    const { job, modelConfig } = ctx;

    // nodeMapping 来源：frontmatter.node_mapping > api_config.node_mappings
    const mappings = ctx.nodeMapping || modelConfig.node_mappings || {};

    if (Object.keys(mappings).length === 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_NODE_MAPPING_MISSING,
        'RhWorkflowCompiler: node_mapping is required. ' +
        'Use "opsv comfy-node-mapping <workflow.json>" to generate it, ' +
        'then add it to frontmatter or api_config.yaml.'
      );
    }

    const nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: any }> = [];

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

    // Build payload
    let payload: Record<string, any>;
    if (modelConfig.payload_example) {
      payload = structuredClone(modelConfig.payload_example);
      payload.nodeInfoList = nodeInfoList;
    } else {
      payload = {
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
      if (defaults.webhookUrl !== undefined) {
        payload.webhookUrl = defaults.webhookUrl;
      }
      if (defaults.upload_method !== undefined) {
        payload.upload_method = defaults.upload_method;
      }
    }

    return {
      payload,
      _opsv: {
        provider: modelConfig.provider || 'rhworkflow-v2',
        modelKey: ctx.modelKey,
        type: modelConfig.type === 'video' ? 'video' : 'imagen',
        shotId: job.id,
        api_url: modelConfig.api_url!,
        api_status_url: modelConfig.api_status_url!,
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

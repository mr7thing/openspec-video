import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';


// ============================================================================
// opsv comfy — ComfyUI 工作流直接入队
// 生成的 .json 就是原始 ComfyUI workflow，可直接在 ComfyUI WebUI 中导入
// ============================================================================

export function registerComfyCommand(program: Command, VERSION: string) {
  const comfyCmd = program
    .command('comfy')
    .description('Compile ComfyUI workflow JSON into queue tasks');

  comfyCmd
    .command('compile <workflowJson>')
    .description('将 ComfyUI 工作流 JSON 编译为可直接执行的队列任务')
    .option('--provider <name>', '目标 Provider (comfyui_local | runninghub)', 'comfyui_local')
    .option('--shot-id <id>', '关联的 Shot/任务 ID', 'comfy_task')
    .option('--circle <name>', '目标 Circle', 'zerocircle_1')
    .option('--param <kv>', '注入工作流参数 (格式: key=value)', collectParams, {})
    .action(async (workflowJson: string, options) => {
      const projectRoot = process.cwd();
      const absWorkflowPath = path.resolve(projectRoot, workflowJson);

      const exists = await fs.access(absWorkflowPath).then(() => true).catch(() => false);
      if (!exists) {
        logger.error(`❌ 工作流文件不存在: ${absWorkflowPath}`);
        process.exit(1);
      }

      const provider = options.provider.toLowerCase();
      if (provider !== 'comfyui_local' && provider !== 'runninghub') {
        logger.error(`❌ 不支持的 Provider: ${provider}。仅支持 comfyui_local 或 runninghub`);
        process.exit(1);
      }

      // 读取并解析 workflow
      let workflow = JSON.parse(await fs.readFile(absWorkflowPath, 'utf-8'));

      // 注入参数（Node Title 匹配）
      if (Object.keys(options.param).length > 0) {
        injectParameters(workflow, options.param);
      }

      // 构建任务 JSON（原始 workflow + _opsv 元数据）
      const taskJson = {
        ...workflow,
        _opsv: {
          provider,
          type: 'image_generation',  // ComfyUI 默认可处理图像
          shotId: options.shotId,
          api_url: provider === 'runninghub'
            ? 'https://www.runninghub.cn/task/openapi'
            : 'http://127.0.0.1:8188',
          compiledAt: new Date().toISOString(),
          workflowSource: path.basename(absWorkflowPath)
        }
      };

      // 确定 batch 目录：compile 总是创建新 batch（queue_N+1）
      const queueDir = path.join(projectRoot, 'opsv-queue');
      const providerDir = path.join(queueDir, options.circle, provider);
      await fs.mkdir(providerDir, { recursive: true });

      const latestBatch = await getLatestBatchNum(providerDir);
      const batchNum = latestBatch + 1;
      const batchDir = path.join(providerDir, `queue_${batchNum}`);
      await fs.mkdir(batchDir, { recursive: true });

      const jsonFile = `${options.shotId}.json`;
      const jsonPath = path.join(batchDir, jsonFile);
      await fs.writeFile(jsonPath, JSON.stringify(taskJson, null, 2), 'utf-8');

      // 生成 queue.json 只读索引
      const queueJson = {
        version: '0.6.4',
        circle: options.circle,
        provider,
        compiledFrom: path.basename(absWorkflowPath),
        compiledAt: new Date().toISOString(),
        tasks: [{ id: options.shotId, type: 'image_generation', jsonFile }]
      };
      await fs.writeFile(path.join(batchDir, 'queue.json'), JSON.stringify(queueJson, null, 2), 'utf-8');

      // compile.log
      const compileLog = {
        t: new Date().toISOString(),
        type: 'compile',
        provider,
        circle: options.circle,
        batch: `queue_${batchNum}`,
        workflow: path.basename(absWorkflowPath),
        shotId: options.shotId
      };
      await fs.appendFile(path.join(batchDir, 'compile.log'), JSON.stringify(compileLog) + '\n', 'utf-8');

      logger.info(`\n🎨 OpsV Comfy v${VERSION}`);
      logger.info(`   工作流: ${workflowJson}`);
      logger.info(`   Provider: ${provider}`);
      logger.info(`   Shot ID: ${options.shotId}`);
      logger.info(`   输出: ${jsonPath}`);
      logger.info(`\n✅ ComfyUI 任务已就绪，执行: opsv queue run --${provider}.default --file ${jsonFile} --circle ${options.circle}`);
    });
}

function collectParams(value: string, previous: Record<string, string | number>): Record<string, string | number> {
  const sepIdx = value.indexOf('=');
  if (sepIdx === -1) {
    logger.warn(`⚠️ 忽略无效参数格式: ${value} (应为 key=value)`);
    return previous;
  }
  const key = value.slice(0, sepIdx);
  let val: string | number = value.slice(sepIdx + 1);
  if (/^\d+$/.test(val)) val = parseInt(val, 10);
  else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
  previous[key] = val;
  return previous;
}

/**
 * 搜索 ComfyUI nodes，如果 _meta.title 匹配参数 key，注入 value。
 */
function injectParameters(workflow: any, params: Record<string, any>) {
  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    if (!node) continue;
    const title = node._meta?.title || node.title || '';
    if (title in params) {
      const injectValue = params[title];
      if (node.inputs) {
        if ('text' in node.inputs) node.inputs.text = injectValue;
        else if ('text_1' in node.inputs) node.inputs.text_1 = injectValue;
        else if ('image' in node.inputs) node.inputs.image = injectValue;
        else if ('video' in node.inputs) node.inputs.video = injectValue;
      }
    }
  }
}

async function getLatestBatchNum(providerDir: string): Promise<number> {
  const entries = await fs.readdir(providerDir).catch(() => [] as string[]);
  const batchFolders = entries.filter(e => /^queue_\d+$/.test(e));
  if (batchFolders.length === 0) return 0;
  const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''), 10)).filter(n => !isNaN(n));
  return Math.max(...nums);
}

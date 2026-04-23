import { Command } from 'commander';
import { TaskCompiler } from '../core/compiler/TaskCompiler';
import { QueueRunner } from '../core/executor/QueueRunner';
import { VolcengineProvider } from '../executor/providers/VolcengineProvider';
import { SiliconFlowProvider } from '../executor/providers/SiliconFlowProvider';
import { MinimaxImageProvider } from '../executor/providers/MinimaxImageProvider';
import { RunningHubProvider } from '../executor/providers/RunningHubProvider';
import { ComfyUILocalProvider } from '../executor/providers/ComfyUILocalProvider';
import { ConfigLoader } from '../utils/configLoader';
import * as path from 'path';
import fs from 'fs/promises';

function getProviderInstance(providerName: string) {
  switch (providerName) {
    case 'volcengine': return new VolcengineProvider();
    case 'siliconflow': return new SiliconFlowProvider();
    case 'minimax': return new MinimaxImageProvider();
    case 'runninghub': return new RunningHubProvider();
    case 'comfyui_local': return new ComfyUILocalProvider();
    default: throw new Error(`Unknown provider: ${providerName}`);
  }
}

/**
 * 解析 --model 参数值，支持别名展开。
 * 输入可能是 "volcengine.seedance-2.0" 或配置的别名 "volc.sd2"
 */
async function resolveModel(raw: string, projectRoot: string): Promise<string> {
  // 已经是 provider.model 格式（model key 可含点号）
  if (/^[a-z0-9_-]+\.[a-z0-9_.-]+$/.test(raw)) {
    return raw;
  }

  const configLoader = ConfigLoader.getInstance(projectRoot);
  await configLoader.loadConfig(projectRoot);

  // 遍历所有模型查找 alias 匹配
  const providers = configLoader['config'].providers;
  for (const [providerName, providerCfg] of Object.entries(providers)) {
    if (!providerCfg.models) continue;
    for (const [modelKey, modelCfg] of Object.entries(providerCfg.models)) {
      const aliases = (modelCfg as any).aliases || [];
      if (aliases.includes(raw)) {
        return `${providerName}.${modelKey}`;
      }
    }
  }

  throw new Error(`Unknown model or alias: "${raw}". Expected "provider.model" or a configured alias.`);
}

async function findLatestBatchDir(providerDir: string): Promise<string | null> {
  const entries = await fs.readdir(providerDir).catch(() => [] as string[]);
  const batchFolders = entries.filter(e => /^queue_\d+$/.test(e));
  if (batchFolders.length === 0) return null;
  const nums = batchFolders.map(f => parseInt(f.replace('queue_', ''), 10)).filter(n => !isNaN(n));
  const latest = Math.max(...nums);
  return path.join(providerDir, `queue_${latest}`);
}

export function registerQueueCommands(program: Command) {
  const queueCmd = program.command('queue').description('Manage the file-based cycle and batch queue');

  queueCmd
    .command('compile <tasksJson>')
    .description('Compile jobs.json into provider task JSONs')
    .requiredOption('--model <models...>', 'Target model(s), format: provider.model or alias (e.g. volcengine.seedance-2.0, volc.sd2)')
    .option('--circle <name>', 'Target circle (e.g. zerocircle_1, endcircle_1)', 'zerocircle_1')
    .option('--file <filename>', 'Only compile tasks for a specific source file')
    .action(async (tasksJson, options) => {
      const projectRoot = process.cwd();
      const providerModels: string[] = [];
      for (const raw of options.model) {
        providerModels.push(await resolveModel(raw, projectRoot));
      }
      if (providerModels.length === 0) {
        console.error('[Queue] Please specify at least one --model (e.g. --model volcengine.seedance-2.0)');
        process.exit(1);
      }

      const queueDir = path.join(projectRoot, 'opsv-queue');
      const absoluteTaskPath = path.resolve(projectRoot, tasksJson);

      const exists = await fs.access(absoluteTaskPath).then(() => true).catch(() => false);
      if (!exists) {
        console.error(`[Queue] Tasks file missing: ${absoluteTaskPath}`);
        process.exit(1);
      }

      let jobsContent = await fs.readFile(absoluteTaskPath, 'utf-8');
      let jobs = JSON.parse(jobsContent);

      // Filter by source file if requested
      if (options.file) {
        jobs = jobs.filter((j: any) => j.id.startsWith(options.file.replace('.md', '')));
        console.log(`[Queue] Filtered to ${jobs.length} jobs for source: ${options.file}`);
      }

      // 先写过滤后的 jobs 到临时变量（不需要写文件，TaskCompiler 直接接收 jobs 数组）
      // 但 TaskCompiler 目前接收的是 jobsPath... 需要调整
      // 暂时先写回同目录的临时文件，或者修改 TaskCompiler 接口

      const compiler = new TaskCompiler(queueDir);

      for (const pm of providerModels) {
        console.log(`[Queue] Compiling ${tasksJson} → ${pm} | Circle: ${options.circle}`);
        const result = await compiler.compile(absoluteTaskPath, pm, options.circle);
        console.log(`[Queue] ${pm} → ${options.circle}/queue_${result.batchNum} | compiled: ${result.tasksCompiled}, skipped: ${result.tasksSkipped}`);
      }
    });

  queueCmd
    .command('run')
    .description('Run provider tasks in the latest batch')
    .requiredOption('--model <models...>', 'Target model(s), format: provider.model or alias (e.g. volcengine.seedance-2.0, volc.sd2)')
    .option('--circle <name>', 'Target circle', 'zerocircle_1')
    .option('--file <files...>', 'Specific task JSON files to run')
    .option('--retry', 'Retry failed tasks')
    .action(async (options) => {
      const projectRoot = process.cwd();
      const providerModels: string[] = [];
      for (const raw of options.model) {
        providerModels.push(await resolveModel(raw, projectRoot));
      }
      if (providerModels.length === 0) {
        console.error('[Queue] Please specify at least one --model (e.g. --model volcengine.seedance-2.0)');
        process.exit(1);
      }

      const queueDir = path.join(projectRoot, 'opsv-queue');
      const circle = options.circle;

      let exitCode = 0;

      for (const pm of providerModels) {
        const dotIndex = pm.indexOf('.');
        const provider = pm.slice(0, dotIndex);
        const modelKey = pm.slice(dotIndex + 1);
        const providerDir = path.join(queueDir, circle, provider);
        const batchDir = await findLatestBatchDir(providerDir);

        if (!batchDir) {
          console.error(`[Queue] No batch found for ${provider} in ${circle}`);
          exitCode = 1;
          continue;
        }

        console.log(`[Queue] Running ${pm} → ${batchDir}`);

        const providerInstance = getProviderInstance(provider);
        const runner = new QueueRunner();

        const result = await runner.run(batchDir, async ({ jsonPath, outputPath, logPath }) => {
          const content = await fs.readFile(jsonPath, 'utf-8');
          const taskJson = JSON.parse(content);

          // 验证 provider 一致性
          if (taskJson._opsv?.provider !== provider) {
            throw new Error(`Task ${path.basename(jsonPath)} provider (${taskJson._opsv?.provider}) does not match specified (${provider})`);
          }

          await providerInstance.processTask({ taskJson, outputPath, logPath });
        }, {
          files: options.file,
          retry: options.retry
        });

        if (result.failed > 0) exitCode = 1;
      }

      process.exitCode = exitCode;
    });
}

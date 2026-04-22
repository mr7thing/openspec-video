import { Command } from 'commander';
import { ComfyUITaskCompiler } from '../core/compiler/ComfyUITaskCompiler';
import { StandardAPICompiler } from '../core/compiler/StandardAPICompiler';
import { QueueWatcher } from '../executor/QueueWatcher';
import { ComfyUILocalProvider } from '../executor/providers/ComfyUILocalProvider';
import { RunningHubProvider } from '../executor/providers/RunningHubProvider';
import { VolcengineProvider } from '../executor/providers/VolcengineProvider';
import { SiliconFlowProvider } from '../executor/providers/SiliconFlowProvider';
import { MinimaxImageProvider } from '../executor/providers/MinimaxImageProvider';
import { Job } from '../types/PromptSchema';
import { ConfigLoader } from '../utils/configLoader';
import * as path from 'path';
import fs from 'fs/promises';

export function registerQueueCommands(program: Command) {
    const queueCmd = program.command('queue').description('Manage the file-based cycle and batch queue');

    queueCmd
        .command('compile <tasksJson>')
        .description('Compile a business tasks.json into isolated atomic payloads in the pending batch')
        .option('--provider <name>', 'Explicitly designate the target API provider(s)', (val, memo: string[]) => { memo.push(val); return memo; }, [])
        .option('--cycle <name>', 'Designate the target Cycle (e.g. ZeroCircle_1, FirstCircle)', 'ZeroCircle_1')
        .option('--file <filename>', 'Only compile tasks belonging to a specific source file')
        .action(async (tasksJson, options) => {
            const projectRoot = process.cwd();
            const configLoader = ConfigLoader.getInstance();
            await configLoader.loadConfig(projectRoot);

            const providers: string[] = options.provider.length > 0 ? options.provider : ['volcengine'];
            const cycle = options.cycle;
            const targetFile = options.file;

            console.log(`[Queue] Compiling ${tasksJson} for providers: ${providers.join(', ')} | Cycle: ${cycle}`);
            const queueDir = path.join(projectRoot, 'opsv-queue');
            const absoluteTaskPath = path.resolve(projectRoot, tasksJson);
            
            const taskPathExists = await fs.access(absoluteTaskPath).then(() => true).catch(() => false);
            if (!taskPathExists) {
                 console.error(`[Queue] Tasks file missing: ${absoluteTaskPath}`);
                 process.exit(1);
            }
            
            let jobs: Job[] = JSON.parse(await fs.readFile(absoluteTaskPath, 'utf-8'));
            
            // Filter by file if requested
            if (targetFile) {
                jobs = jobs.filter(j => j.id.startsWith(targetFile.replace('.md', '')));
                console.log(`[Queue] Filtered to ${jobs.length} jobs for source file: ${targetFile}`);
            }

            for (const provider of providers) {
                const compiler = new StandardAPICompiler(queueDir);
                for (const job of jobs) {
                    const jobType = job.type || 'image_generation';
                    const models = configLoader.findModelsByCapability(provider, jobType as any);
                    
                    if (models.length > 0) {
                        await compiler.compileAndEnqueue({ provider, modelKey: models[0].key, job }, cycle);
                    } else {
                        console.warn(`[Queue] ⚠️ Skipping job ${job.id} for provider ${provider}: No model matches '${jobType}'`);
                    }
                }
            }
            console.log(`[Queue] Compilation successful in ${queueDir}/${cycle}`);
        });

    queueCmd
        .command('run [providers...]')
        .description('Start the batch watcher for specific providers')
        .option('--cycle <name>', 'Designate the target Cycle to watch', 'ZeroCircle_1')
        .action(async (providers: string[], options) => {
            if (!providers || providers.length === 0) {
                console.error(`[Queue] Please specify at least one provider (e.g. volcengine siliconflow)`);
                process.exit(1);
            }
            
            const projectRoot = process.cwd();
            const queueDir = path.join(projectRoot, 'opsv-queue');
            const cycle = options.cycle;
            
            const watchers: QueueWatcher[] = [];

            for (const rawProvider of providers) {
                const provider = rawProvider.toLowerCase();
                console.log(`[Queue] Starting watcher for [${provider}] in [${cycle}]`);
                
                if (provider === 'volcengine' || provider === 'seadream' || provider === 'seedance') {
                    const volcEngineApi = new VolcengineProvider();
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await volcEngineApi.processTask(task), 5000, cycle));
                } else if (provider === 'siliconflow') {
                    const siliconFlowApi = new SiliconFlowProvider() as any;
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await siliconFlowApi.processTask(task), 5000, cycle));
                } else if (provider === 'minimax') {
                    const minimaxApi = new MinimaxImageProvider();
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await minimaxApi.processTask(task), 5000, cycle));
                } else {
                    console.error(`[Queue] Unhandled provider: ${provider}`);
                }
            }
            
            await Promise.all(watchers.map(watcher => watcher.start()));
        });
}

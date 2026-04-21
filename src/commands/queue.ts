import { Command } from 'commander';
import { ComfyUITaskCompiler } from '../core/compiler/ComfyUITaskCompiler';
import { StandardAPICompiler } from '../core/compiler/StandardAPICompiler';
import { QueueWatcher } from '../executor/QueueWatcher';
import { ComfyUILocalProvider } from '../executor/providers/ComfyUILocalProvider';
import { RunningHubProvider } from '../executor/providers/RunningHubProvider';
import { SeaDreamProvider } from '../executor/providers/SeaDreamProvider';
import { SiliconFlowProvider } from '../executor/providers/SiliconFlowProvider';
import { MinimaxImageProvider } from '../executor/providers/MinimaxImageProvider';
import { Job } from '../types/PromptSchema';
import { ConfigLoader } from '../utils/configLoader';
import * as path from 'path';
import fs from 'fs/promises';

export function registerQueueCommands(program: Command) {
    const queueCmd = program.command('queue').description('Manage the file-based spooler queue');

    queueCmd
        .command('compile <tasksJson>')
        .description('Compile a business tasks.json into isolated atomic payloads in the pending queue')
        .option('--provider <name>', 'Explicitly designate the target API provider(s)', (val, memo: string[]) => { memo.push(val); return memo; }, [])
        .action(async (tasksJson, options) => {
            const projectRoot = process.cwd();
            const configLoader = ConfigLoader.getInstance();
            await configLoader.loadConfig(projectRoot);

            const providers: string[] = options.provider.length > 0 ? options.provider : ['seadream'];

            // ---- API Key 连通性检查 ----
            for (const provider of providers) {
                if (provider === 'comfyui_local' || provider === 'runninghub') continue;
                try {
                    configLoader.getResolvedApiKey(provider);
                } catch (err: any) {
                    console.warn(`[Queue] ⚠️ Provider "${provider}": ${err.message}`);
                }
            }
            // ---- 检查结束 ----

            console.log(`[Queue] Compiling ${tasksJson} for providers: ${providers.join(', ')}...`);
            const queueDir = path.join(projectRoot, '.opsv-queue');
            const absoluteTaskPath = path.resolve(projectRoot, tasksJson);
            
            const taskPathExists = await fs.access(absoluteTaskPath).then(() => true).catch(() => false);
            if (!taskPathExists) {
                 console.error(`[Queue] Tasks file missing: ${absoluteTaskPath}`);
                 process.exit(1);
            }
            
            const jobs: Job[] = JSON.parse(await fs.readFile(absoluteTaskPath, 'utf-8'));

            for (const provider of providers) {
                if (provider === 'comfyui_local' || provider === 'runninghub') {
                    const compiler = new ComfyUITaskCompiler(queueDir, path.join(projectRoot, 'addons/comic-drama/workflows'));
                    for (const job of jobs) {
                        const parameters: Record<string, any> = {
                            'input-prompt': job.prompt_en || job.payload.prompt
                        };
                        if (job.reference_images && job.reference_images.length > 0) {
                            parameters['input-image1'] = job.reference_images[0];
                        }
                        
                        await compiler.compileAndEnqueue({
                            shotId: job.id,
                            templateName: 'comic-drama-default.json',
                            provider: provider,
                            parameters
                        });
                    }
                } else {
                    const compiler = new StandardAPICompiler(queueDir);
                    for (const job of jobs) {
                        const jobType: 'image_generation' | 'video_generation' = job.type || 'image_generation' as any;
                        const models = configLoader.findModelsByCapability(provider, jobType);
                        
                        if (models.length > 0) {
                            await compiler.compileAndEnqueue({ provider, job });
                        } else {
                            console.warn(`[Queue] Skipping job ${job.id} for provider ${provider}: No capable model exists for type '${jobType}'.`);
                        }
                    }
                }
            }
            console.log(`[Queue] All tasks compiled into atomic Spooler artifacts perfectly.`);
        });

    queueCmd
        .command('run [providers...]')
        .description('Start the queue watcher to process pending files')
        .action(async (providers: string[]) => {
            if (!providers || providers.length === 0) {
                console.error(`[Queue] Please specify at least one provider (e.g. opsv queue run siliconflow seedance)`);
                process.exit(1);
            }
            
            const projectRoot = process.cwd();
            const queueDir = path.join(projectRoot, '.opsv-queue');
            
            const watchers: QueueWatcher[] = [];

            for (const rawProvider of providers) {
                const provider = rawProvider.toLowerCase();
                console.log(`[Queue] Starting provider runner for: ${provider}`);
                
                if (provider === 'comfyui_local') {
                    const localApi = new ComfyUILocalProvider();
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await localApi.processTask(task)));
                } else if (provider === 'runninghub') {
                    const apiKey = process.env.RUNNINGHUB_API_KEY || "Bearer YOUR_KEY_MOCK"; 
                    const runningHubApi = new RunningHubProvider(apiKey);
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await runningHubApi.processTask(task)));
                } else if (provider === 'seadream' || provider === 'seedance' || provider === 'volcengine') {
                    const seedanceProviderName = 'seedance'; // Canonical name
                    const seedanceApi = new SeaDreamProvider(seedanceProviderName);
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await seedanceApi.processTask(task)));
                } else if (provider === 'siliconflow') {
                    const siliconFlowApi = new SiliconFlowProvider() as any;
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await siliconFlowApi.processTask(task)));
                } else if (provider === 'minimax') {
                    const minimaxApi = new MinimaxImageProvider();
                    watchers.push(new QueueWatcher(queueDir, provider, async (task) => await minimaxApi.processTask(task)));
                } else {
                    console.error(`[Queue] Unhandled provider wrapper yet: ${provider}`);
                }
            }
            
            await Promise.all(watchers.map(watcher => watcher.start()));
        });
}

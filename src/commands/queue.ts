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
import fs from 'fs-extra';

export function registerQueueCommands(program: Command) {
    const queueCmd = program.command('queue').description('Manage the file-based spooler queue');

    queueCmd
        .command('compile <tasksJson>')
        .description('Compile a business tasks.json into isolated atomic payloads in the pending queue')
        .option('--provider <name>', 'Explicitly designate the target API provider')
        .action(async (tasksJson, options) => {
            const projectRoot = process.cwd();
            const configLoader = ConfigLoader.getInstance();
            configLoader.loadConfig(projectRoot);

            const provider = options.provider || 'seadream'; // Fallback to a default or require it
            if (!provider) {
                console.error("[Queue] You must specify a --provider or configure a default.");
                process.exit(1);
            }

            console.log(`[Queue] Compiling ${tasksJson} for provider: ${provider}...`);
            const queueDir = path.join(projectRoot, '.opsv-queue');
            const absoluteTaskPath = path.resolve(projectRoot, tasksJson);
            
            if (!fs.existsSync(absoluteTaskPath)) {
                 console.error(`[Queue] Tasks file missing: ${absoluteTaskPath}`);
                 process.exit(1);
            }
            
            const jobs: Job[] = JSON.parse(await fs.readFile(absoluteTaskPath, 'utf-8'));

            if (provider === 'comfyui_local' || provider === 'runninghub') {
                const compiler = new ComfyUITaskCompiler(queueDir, path.join(projectRoot, 'addons/comic-drama/workflows'));
                for (const job of jobs) {
                    // Adapt standard generic Job to ComfyUI TaskIntent layout
                    // Note: This relies on frontmatter injecting 'input-prompt' etc into job.payload
                    const parameters: Record<string, any> = {
                        'input-prompt': job.prompt_en || job.payload.prompt
                    };
                    if (job.reference_images && job.reference_images.length > 0) {
                        parameters['input-image1'] = job.reference_images[0];
                    }
                    
                    await compiler.compileAndEnqueue({
                        shotId: job.id,
                        templateName: 'comic-drama-default.json', // 约定一个通用模板，或从 Job metadata 取出
                        provider: provider,
                        parameters
                    });
                }
            } else {
                const compiler = new StandardAPICompiler(queueDir);
                for (const job of jobs) {
                    await compiler.compileAndEnqueue({ provider, job });
                }
            }
            console.log(`[Queue] All tasks compiled into atomic Spooler artifacts perfectly.`);
        });

    queueCmd
        .command('run <provider>')
        .description('Start the queue watcher to process pending files')
        .action(async (rawProvider) => {
            const provider = rawProvider.toLowerCase();
            console.log(`[Queue] Starting provider runner for: ${provider}`);
            const projectRoot = process.cwd();
            const queueDir = path.join(projectRoot, '.opsv-queue');

            if (provider === 'comfyui_local') {
                const localApi = new ComfyUILocalProvider();
                const watcher = new QueueWatcher(queueDir, provider, async (task) => await localApi.processTask(task));
                await watcher.start();
            } else if (provider === 'runninghub') {
                const apiKey = process.env.RUNNINGHUB_API_KEY || "Bearer YOUR_KEY_MOCK"; 
                const runningHubApi = new RunningHubProvider(apiKey);
                const watcher = new QueueWatcher(queueDir, provider, async (task) => await runningHubApi.processTask(task));
                await watcher.start();
            } else if (provider === 'seadream') {
                const seadreamApi = new SeaDreamProvider();
                const watcher = new QueueWatcher(queueDir, provider, async (task) => await seadreamApi.processTask(task));
                await watcher.start();
            } else if (provider === 'siliconflow') {
                const siliconFlowApi = new SiliconFlowProvider() as any;
                const watcher = new QueueWatcher(queueDir, provider, async (task) => await siliconFlowApi.processTask(task));
                await watcher.start();
            } else if (provider === 'minimax') {
                const minimaxApi = new MinimaxImageProvider();
                const watcher = new QueueWatcher(queueDir, provider, async (task) => await minimaxApi.processTask(task));
                await watcher.start();
            } else {
                console.error(`[Queue] Unhandled provider wrapper yet: ${provider}`);
            }
        });
}

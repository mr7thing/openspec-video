import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { VideoModelDispatcher } from '../executor/VideoModelDispatcher';
import { ConfigLoader } from '../utils/configLoader';
import { showEnvCheck } from './utils';

export function registerGenVideoCommand(program: Command, VERSION: string) {
    program
        .command('gen-video')
        .description('Generate videos from compiled animation queue (opsv animate → gen-video)')
        .option('-m, --model <model>', 'Target video model name (or "all" for all enabled models)', 'all')
        .option('-s, --skip-failed', 'Continue on individual job failure', false)
        .option('--dry-run', 'Validate video jobs without executing', false)
        .action(async (options) => {
            try {
                const projectRoot = process.cwd();
                const videoJobsPath = path.join(projectRoot, 'queue', 'video_jobs.json');

                if (!fs.existsSync(videoJobsPath)) {
                    console.error('❌ No video_jobs.json found. Run "opsv animate" first.');
                    return;
                }

                const rawJobs = fs.readJsonSync(videoJobsPath);
                const videoJobs = rawJobs.filter((j: any) => j.type === 'video_generation');

                if (videoJobs.length === 0) {
                    console.log('ℹ️ No video generation jobs found in queue.');
                    return;
                }

                console.log(`\n🎬 OpsV Video Generator ${VERSION}`);
                console.log(`   Target Model: ${options.model}`);
                console.log(`   Jobs Count: ${videoJobs.length}`);
                console.log(`   Mode: Sequential (respecting @FRAME dependencies)\n`);

                if (options.dryRun) {
                    console.log('🔍 Dry run mode - validating video jobs...');
                    let valid = 0;
                    let invalid = 0;
                    for (const job of videoJobs) {
                        if (!job.prompt_en || !job.output_path) {
                            console.error(`   ❌ Job ${job.id}: missing prompt_en or output_path`);
                            invalid++;
                        } else {
                            valid++;
                        }
                    }
                    console.log(`   Valid: ${valid}, Invalid: ${invalid}`);
                    return;
                }

                // 去除冗长的各写死的环境变量检查：统一委托 dispatcher 或下放
                // 如果需要预检，可提取 ConfigLoader.getResolvedApiKey 的调用

                const configLoader = ConfigLoader.getInstance();
                const apiConfig = configLoader.loadConfig(projectRoot);

                let modelsToRun: string[] = [];
                if (options.model === 'all') {
                    modelsToRun = Object.entries(apiConfig.models || {})
                        .filter(([name, cfg]) => cfg.type === 'video' && cfg.enable)
                        .map(([name]) => name);

                    if (modelsToRun.length === 0) {
                        console.error('❌ Error: No video models are currently enabled in api_config.yaml.');
                        return;
                    }
                } else {
                    modelsToRun = [options.model];
                }

                const dispatcher = new VideoModelDispatcher(projectRoot);

                const startTime = Date.now();
                
                for (const targetModel of modelsToRun) {
                    console.log(`\n▶ Starting video generation pipeline for model: [${targetModel}]...\n`);
                    await dispatcher.dispatchAll(videoJobs, targetModel);
                    console.log(`✅ Video pipeline completed for ${targetModel}!`);
                }

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`\n✅ All Video pipelines completed!`);
                console.log(`   Duration: ${duration}s`);
                console.log(`   Jobs per model: ${videoJobs.length}`);
                console.log(`\n📁 Generated videos saved to: artifacts/videos/`);

            } catch (err: any) {
                console.error('\n❌ Video generation failed:', err.message);
                if (options.skipFailed) {
                    console.log('   --skip-failed is set, but video pipeline requires sequential execution.');
                    console.log('   The @FRAME dependency chain was broken. Fix the failing job and retry.');
                }
                process.exit(1);
            }
        });
}

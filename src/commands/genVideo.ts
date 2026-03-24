import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { VideoModelDispatcher } from '../executor/VideoModelDispatcher';
import { showEnvCheck } from './utils';

export function registerGenVideoCommand(program: Command, VERSION: string) {
    program
        .command('gen-video')
        .description('Generate videos from compiled animation queue (opsv animate → gen-video)')
        .option('-m, --model <model>', 'Target video model name', 'seedance-1.5-pro')
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

                // 检查 API Key（根据模型决定需要哪个 key）
                const needsVolce = options.model.includes('seedance');
                const needsSilicon = options.model.includes('wan') || options.model.includes('siliconflow');

                if (needsVolce && !process.env.VOLCENGINE_API_KEY && !process.env.SEEDANCE_API_KEY) {
                    showEnvCheck(projectRoot);
                    console.error('❌ Error: VOLCENGINE_API_KEY or SEEDANCE_API_KEY not set for Seedance model');
                    return;
                }
                if (needsSilicon && !process.env.SILICONFLOW_API_KEY) {
                    showEnvCheck(projectRoot);
                    console.error('❌ Error: SILICONFLOW_API_KEY not set for SiliconFlow model');
                    return;
                }

                const dispatcher = new VideoModelDispatcher(projectRoot);

                console.log('▶ Starting video generation pipeline...\n');

                const startTime = Date.now();
                await dispatcher.dispatchAll(videoJobs, options.model);

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`\n✅ Video pipeline completed!`);
                console.log(`   Duration: ${duration}s`);
                console.log(`   Jobs: ${videoJobs.length}`);
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

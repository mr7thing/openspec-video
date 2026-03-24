import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobValidator } from '../types/PromptSchema';
import { ImageModelDispatcher } from '../executor/ImageModelDispatcher';
import { showEnvCheck, getEnvPaths } from './utils';

export function registerGenImageCommand(program: Command, VERSION: string) {
    const genImageAction = async (options: any) => {
        try {
            const projectRoot = process.cwd();
            const { secretsEnvPath } = getEnvPaths(projectRoot);
            const jobsPath = path.join(projectRoot, 'queue', 'jobs.json');

            if (!fs.existsSync(jobsPath)) {
                console.error('❌ No jobs.json found. Run "opsv generate" first.');
                return;
            }

            // 过滤图像生成任务
            const rawJobs = fs.readJsonSync(jobsPath);
            const imageJobs = rawJobs.filter((j: any) => j.type === 'image_generation');

            if (imageJobs.length === 0) {
                console.log('ℹ️ No image generation jobs found in queue.');
                return;
            }

            console.log(`\n🎨 OpsV Image Generator ${VERSION}`);
            console.log(`   Target Model: ${options.model}`);
            console.log(`   Jobs Count: ${imageJobs.length}`);
            console.log(`   Concurrency: ${options.concurrency}\n`);

            if (options.dryRun) {
                console.log('🔍 Dry run mode - validating jobs...');
                const { valid, invalid } = JobValidator.validateMany(imageJobs);
                console.log(`   Valid: ${valid.length}, Invalid: ${invalid.length}`);
                
                if (invalid.length > 0) {
                    invalid.forEach((inv: { index: number; errors: string[] }) => {
                        console.error(`   ❌ Job ${inv.index}: ${inv.errors.join(', ')}`);
                    });
                }
                return;
            }

            // 检查 API Key
            if (!process.env.SEADREAM_API_KEY && !process.env.VOLCENGINE_API_KEY) {
                showEnvCheck(projectRoot);
                console.error('❌ Error: SEADREAM_API_KEY or VOLCENGINE_API_KEY not set');
                console.error(`   Checked path: ${secretsEnvPath}`);
                console.error('   Please ensure your .env/secrets.env file exists and contains the correct keys.');
                return;
            }

            const dispatcher = new ImageModelDispatcher(projectRoot);

            console.log('▶ Starting image generation pipeline...\n');

            const startTime = Date.now();
            const { results, errors } = await dispatcher.dispatchAll(
                imageJobs,
                options.model,
                {
                    concurrency: parseInt(options.concurrency),
                    skipFailed: options.skipFailed,
                    onProgress: (completed: number, total: number) => {
                        const percent = Math.round((completed / total) * 100);
                        process.stdout.write(`\r   Progress: ${completed}/${total} (${percent}%)`);
                    }
                }
            );

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write('\n\n');

            console.log('✅ Pipeline completed!');
            console.log(`   Duration: ${duration}s`);
            console.log(`   Success: ${results.length}`);
            
            if (errors.length > 0) {
                console.log(`   Failed: ${errors.length}`);
                errors.forEach((e: { jobId: string; error: string }) => {
                    console.error(`   ❌ ${e.jobId}: ${e.error}`);
                });
            }

            console.log(`\n📁 Generated images saved to: artifacts/drafts_N/`);

        } catch (err: any) {
            console.error('\n❌ Image generation failed:', err.message);
            process.exit(1);
        }
    };

    program
        .command('gen-image')
        .description('Generate images from compiled job queue (opsv generate → gen-image)')
        .option('-m, --model <model>', 'Target model name', 'seadream-5.0-lite')
        .option('-c, --concurrency <num>', 'Number of concurrent jobs', '1')
        .option('-s, --skip-failed', 'Continue on individual job failure', false)
        .option('--dry-run', 'Validate jobs without executing', false)
        .action(genImageAction);

    // 向后兼容别名
    program
        .command('execute-image', { hidden: true })
        .description('(Deprecated) Alias for gen-image')
        .option('-m, --model <model>', 'Target model name', 'seadream-5.0-lite')
        .option('-c, --concurrency <num>', 'Number of concurrent jobs', '1')
        .option('-s, --skip-failed', 'Continue on individual job failure', false)
        .option('--dry-run', 'Validate jobs without executing', false)
        .action(genImageAction);
}

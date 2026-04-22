import { Command } from 'commander';
import { AnimateGenerator } from '../automation/AnimateGenerator';

export function registerAnimateCommand(program: Command, VERSION: string) {
    program
        .command('animate')
        .description('Generate video animation jobs from Shotlist.md')
        .option('--cycle <name>', '目标 Circle (默认 auto: 自动推断依赖图末端环)', 'auto')
        .action(async (options) => {
            try {
                const projectRoot = process.cwd();
                const generator = new AnimateGenerator(projectRoot);

                console.log('Compiling video jobs from Shotlist.md...');
                const jobs = await generator.generateAnimationJobs(options.cycle);

                if (jobs.length > 0) {
                    console.log(`✅ ${jobs.length} video job(s) compiled.`);
                    console.log('   Next step: opsv queue compile opsv-queue/video_jobs/video_jobs.json --provider <name>');
                } else {
                    console.log('ℹ️ No pending video jobs found.');
                }
            } catch (err) {
                console.error('Animation job generation failed:', err);
            }
        });
}

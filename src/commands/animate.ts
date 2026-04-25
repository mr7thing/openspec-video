import { Command } from 'commander';
import { AnimateGenerator } from '../automation/AnimateGenerator';
import { logger } from '../utils/logger';
import { inferDefaultCircle, checkUpstreamApproved } from '../utils/circleStatus';

export function registerAnimateCommand(program: Command, VERSION: string) {
    program
        .command('animate')
        .description('Generate video animation jobs from Shotlist.md')
        .option('--circle <name>', '目标 Circle (默认 auto: 自动推断当前开放的 Circle)', 'auto')
        .option('--skip-circle-check', '跳过上游 Circle approved 状态检查', false)
        .action(async (options) => {
            try {
                const projectRoot = process.cwd();

                // 自动推断 Circle
                let circle = options.circle;
                if (circle === 'auto' || !circle) {
                    circle = await inferDefaultCircle(projectRoot);
                    if (!circle) {
                        logger.error('❌ 所有 Circle 已完成，没有开放的 Circle 需要生成');
                        logger.error('   如需重新生成，请显式指定 --circle');
                        process.exit(1);
                    }
                    logger.info(`🔮 自动推断 Circle: ${circle}`);
                }

                // 检查上游 Circle 状态
                if (!options.skipCircleCheck) {
                    const upstream = await checkUpstreamApproved(projectRoot, circle);
                    if (!upstream.ok) {
                        logger.error(`❌ ${upstream.message}`);
                        logger.error('   请先执行 opsv review 完成上游 approve');
                        logger.error('   或加 --skip-circle-check 强制跳过（不推荐）');
                        process.exit(1);
                    }
                }

                const generator = new AnimateGenerator(projectRoot);

                logger.info('Compiling video jobs from Shotlist.md...');
                const jobs = await generator.generateAnimationJobs(circle);

                if (jobs.length > 0) {
                    logger.info(`✅ ${jobs.length} video job(s) compiled.`);
                    logger.info(`   输出: opsv-queue/<circle>/video_jobs.json`);
                    logger.info('   Next step: opsv queue compile <path-to-video-jobs-json> --model <alias>');
                } else {
                    logger.info('ℹ️ No pending video jobs found.');
                }
            } catch (err) {
                logger.error('Animation job generation failed:', err);
                process.exit(1);
            }
        });
}

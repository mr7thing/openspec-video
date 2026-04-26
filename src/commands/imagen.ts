import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobGenerator } from '../automation/JobGenerator';
import { logger } from '../utils/logger';
import { inferDefaultCircle, checkUpstreamApproved } from '../utils/circleStatus';

// ============================================================================
// opsv imagen — 图像编译管线入口
// v0.6: 媒介属性隔离 (生成 job.type === 'image_generation')
// ============================================================================

export function registerImagenCommand(program: Command, VERSION: string) {
    program
        .command('imagen [targets...]')
        .description('编译 Markdown 文档为图像生成意图任务 (jobs.json)')
        .option('-p, --preview', '预览模式（仅生成第一个分镜）', false)
        .option('--shots <list>', '指定分镜 ID（逗号分隔: 1,5,12）', (val) => val.split(','))
        .option('--skip-approved', '跳过已 Approve 的文档，不纳入生成队列（默认开启）', true)
        .option('--skip-depend-layer', '跳过依赖层次，生成扁平的大任务列表', false)
        .option('--circle <name>', '指定生成环 (Circle)。默认自动推断为当前开放的 Circle')
        .option('--skip-circle-check', '跳过上游 Circle approved 状态检查', false)
        .action(async (targets, options) => {
            try {
                const projectRoot = process.cwd();

                // 自动推断 Circle
                let circle = options.circle;
                if (!circle) {
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

                logger.info(`\n🔧 OpsV Imagen v${VERSION}`);
                logger.info(`   Circle: ${circle}`);
                logger.info(`   目标: ${targets && targets.length > 0 ? targets.join(', ') : '全部规范目录'}`);
                if (options.preview) logger.info('   👀 预览模式');
                if (options.shots) logger.info(`   🎯 指定分镜: ${options.shots.join(', ')}`);
                if (options.skipApproved) logger.info('   ✅ 已启用: 跳过 Approved 文档');
                if (options.skipDependLayer) logger.info('   🔗 跳过依赖层次（扁平模式）');

                const generator = new JobGenerator(projectRoot);
                const jobs = await generator.generateJobs(targets, {
                    preview: options.preview,
                    shots: options.shots,
                    skipApproved: options.skipApproved,
                    skipDependsLayer: options.skipDependLayer,
                    circleName: circle, // 传入 circleName 用于圈层隔离检查
                });

                logger.info('\n📂 图像任务列表已生成。');
                logger.info(`   输出: opsv-queue/<circle>/imagen_jobs.json`);
                logger.info('   下一步：执行编译入队');
                logger.info(`   $ opsv queue compile <path-to-jobs-json> --model <alias>`);
            } catch (err) {
                logger.error(`编译失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

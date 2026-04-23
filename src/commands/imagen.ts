import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobGenerator } from '../automation/JobGenerator';
import { logger } from '../utils/logger';

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
        .option('--skip-approved', '跳过已 Approve 的文档，不纳入生成队列（默认开启）', false)
        .option('--skip-depend-layer', '跳过依赖层次，生成扁平的大任务列表', false)
        .option('--circle <name>', '指定生成环 (Circle)', 'zerocircle_1')
        .action(async (targets, options) => {
            try {
                const projectRoot = process.cwd();

                logger.info(`\n🔧 OpsV Imagen v${VERSION}`);
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
                });

                logger.info('\n📂 图像任务列表已生成。');
                logger.info('   下一步：执行编译入队');
                logger.info('   $ opsv queue compile opsv-queue/zerocircle_1/imagen_jobs.json --provider <目标API>');
            } catch (err) {
                logger.error(`编译失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

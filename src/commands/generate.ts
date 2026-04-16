import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobGenerator } from '../automation/JobGenerator';
import { isDaemonRunning, startDaemon, registerProject } from '../utils/daemonUtils';
import { logger } from '../utils/logger';

// ============================================================================
// opsv generate — 图像编译管线入口
// v0.5: 集成依赖图 + 编译期校验（已内置到 JobGenerator）
// ============================================================================

export function registerGenerateCommand(program: Command, VERSION: string) {
    program
        .command('generate [targets...]')
        .description('编译 Markdown 文档为图像生成任务 (jobs.json)')
        .option('-p, --preview', '预览模式（仅生成第一个分镜）', false)
        .option('--shots <list>', '指定分镜 ID（逗号分隔: 1,5,12）', (val) => val.split(','))
        .option('--skip-approved', '跳过已 Approve 的文档，不纳入生成队列', false)
        .action(async (targets, options) => {
            try {
                const projectRoot = process.cwd();

                logger.info(`\n🔧 OpsV Generate v${VERSION}`);
                logger.info(`   目标: ${targets && targets.length > 0 ? targets.join(', ') : '全部规范目录'}`);
                if (options.preview) logger.info('   👀 预览模式');
                if (options.shots) logger.info(`   🎯 指定分镜: ${options.shots.join(', ')}`);
                if (options.skipApproved) logger.info('   ✅ 已启用: 跳过 Approved 文档');

                const generator = new JobGenerator(projectRoot);
                const jobs = await generator.generateJobs(targets, {
                    preview: options.preview,
                    shots: options.shots,
                    skipApproved: options.skipApproved,
                });

                if (!isDaemonRunning()) {
                    logger.info('自动启动 OpsV Server...');
                    startDaemon();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                registerProject(projectRoot);
            } catch (err) {
                logger.error(`编译失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

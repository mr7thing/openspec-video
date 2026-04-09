import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { JobValidator, ModelConstraints } from '../automation/JobValidator';
import { ImageModelDispatcher } from '../executor/ImageModelDispatcher';
import { ConfigLoader } from '../utils/configLoader';
import { getEnvPaths } from './utils';
import { logger } from '../utils/logger';

// ============================================================================
// opsv gen-image — 图像生成执行器
// v0.5 变更:
//   1. 执行期模型特定校验
//   2. 输出到模型子目录
//   3. 回写带批次号的 json
// ============================================================================

export function registerGenImageCommand(program: Command, VERSION: string) {
    const genImageAction = async (options: any) => {
        try {
            const projectRoot = process.cwd();
            const { secretsEnvPath } = getEnvPaths(projectRoot);
            const jobsPath = path.join(projectRoot, 'queue', 'jobs.json');

            if (!fs.existsSync(jobsPath)) {
                logger.error('❌ 未找到 jobs.json，请先执行 "opsv generate"');
                return;
            }

            // 过滤图像生成任务
            const rawJobs = fs.readJsonSync(jobsPath);
            const imageJobs = rawJobs.filter((j: any) => j.type === 'image_generation');

            if (imageJobs.length === 0) {
                logger.info('ℹ️ 队列中无图像生成任务');
                return;
            }

            logger.info(`\n🎨 OpsV Image Generator ${VERSION}`);
            logger.info(`   目标模型: ${options.model}`);
            logger.info(`   任务数量: ${imageJobs.length}`);
            logger.info(`   并发数: ${options.concurrency}\n`);

            // ---- 加载配置 ----
            const configLoader = ConfigLoader.getInstance();
            const apiConfig = configLoader.loadConfig(projectRoot);

            let modelsToRun: string[] = [];
            if (options.model === 'all') {
                modelsToRun = Object.entries(apiConfig.models || {})
                    .filter(([, cfg]) => cfg.type === 'image' && cfg.enable)
                    .map(([name]) => name);

                if (modelsToRun.length === 0) {
                    logger.error('❌ api_config.yaml 中没有启用的图像模型');
                    return;
                }
            } else {
                modelsToRun = options.model.split(',').map((m: string) => m.trim());
            }

            // ---- Dry run: 校验模式 ----
            if (options.dryRun) {
                logger.info('🔍 Dry run 模式 — 仅做校验');
                const validator = new JobValidator();

                // 编译期通用校验
                const { errors: genericErrors } = validator.validateAndSanitize(imageJobs);
                if (genericErrors.length > 0) {
                    logger.warn('  编译期问题:');
                    genericErrors.forEach(e => logger.warn(`  ❌ ${e.jobId}.${e.field}: ${e.message}`));
                }

                // 对每个目标模型做特定校验
                for (const model of modelsToRun) {
                    const modelConfig = apiConfig.models?.[model] || {};
                    const constraints = JobValidator.extractConstraints(modelConfig);
                    const { errors } = validator.validateForModel(imageJobs, model, constraints);

                    if (errors.length > 0) {
                        logger.warn(`  模型 [${model}] 校验失败:`);
                        errors.forEach(e => {
                            logger.warn(`  ❌ ${e.jobId}.${e.field}: ${e.message}`);
                            if (e.suggestion) logger.info(`     💡 ${e.suggestion}`);
                        });
                    } else {
                        logger.info(`  ✅ 模型 [${model}] 校验通过 (${imageJobs.length} 个任务)`);
                    }
                }
                return;
            }

            // ---- 执行生成 ----
            const dispatcher = new ImageModelDispatcher(projectRoot);
            const validator = new JobValidator();

            for (const targetModel of modelsToRun) {
                // 执行期模型特定校验
                const modelConfig = apiConfig.models?.[targetModel] || {};
                const constraints = JobValidator.extractConstraints(modelConfig);
                const { valid, errors } = validator.validateForModel(imageJobs, targetModel, constraints);

                if (!valid) {
                    logger.warn(`\n⚠️ 模型 [${targetModel}] 校验发现问题:`);
                    errors.forEach(e => {
                        logger.warn(`  ❌ ${e.jobId}.${e.field}: ${e.message}`);
                        if (e.suggestion) logger.info(`     💡 ${e.suggestion}`);
                    });
                    if (!options.skipFailed) {
                        logger.error(`校验失败，跳过 ${targetModel}（使用 --skip-failed 强制执行）`);
                        continue;
                    }
                }

                logger.info(`\n▶ 使用模型 [${targetModel}] 生成...\n`);

                const startTime = Date.now();
                const { results, errors: execErrors } = await dispatcher.dispatchAll(
                    imageJobs,
                    targetModel,
                    {
                        concurrency: parseInt(options.concurrency),
                        skipFailed: options.skipFailed,
                        onProgress: (completed: number, total: number) => {
                            const percent = Math.round((completed / total) * 100);
                            process.stdout.write(`\r   进度: ${completed}/${total} (${percent}%)`);
                        }
                    }
                );

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                process.stdout.write('\n\n');

                logger.info(`✅ [${targetModel}] 完成！耗时 ${duration}s，成功 ${results.length}`);
                if (execErrors.length > 0) {
                    logger.warn(`   失败: ${execErrors.length}`);
                    execErrors.forEach((e: { jobId: string; error: string }) => {
                        logger.error(`   ❌ ${e.jobId}: ${e.error}`);
                    });
                }
            }

            logger.info(`\n📁 生成图像已保存到 artifacts/drafts_N/`);

        } catch (err: any) {
            logger.error(`\n❌ 图像生成失败: ${err.message}`);
            process.exit(1);
        }
    };

    program
        .command('gen-image')
        .description('执行图像生成任务（opsv generate → gen-image）')
        .option('-m, --model <model>', '目标模型（逗号分隔多个，或 "all"）', 'all')
        .option('-c, --concurrency <num>', '并发数', '1')
        .option('-s, --skip-failed', '跳过失败任务继续执行', false)
        .option('--dry-run', '仅校验不执行', false)
        .action(genImageAction);
}

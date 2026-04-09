import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { ReviewServer } from '../review-ui/server';
import { logger } from '../utils/logger';

// ============================================================================
// opsv review — 启动 Review 页面服务
// v0.5: 从 CLI 文本升级为可交互的页面服务
// ============================================================================

export function registerReviewCommand(program: Command) {
    program
        .command('review')
        .description('启动 Review 页面服务，可视化审阅候选图并 Approve')
        .option('-p, --port <port>', '服务端口', '3456')
        .option('-b, --batch <num>', '指定批次号（默认最新批次）')
        .action(async (options) => {
            const projectRoot = process.cwd();

            // 解析批次目录
            const batchDir = resolveBatchDir(projectRoot, options.batch);
            if (!batchDir) {
                logger.error('❌ 未找到任何批次目录。请先执行 "opsv generate" + "opsv gen-image"');
                return;
            }

            const port = parseInt(options.port);
            const server = new ReviewServer(projectRoot, batchDir);
            await server.start(port);

            logger.info(`\n🔍 Review 服务已启动`);
            logger.info(`   地址: http://localhost:${port}`);
            logger.info(`   批次: ${path.relative(projectRoot, batchDir)}`);
            logger.info(`   按 Ctrl+C 关闭\n`);
        });
}

function resolveBatchDir(projectRoot: string, batchNum?: string): string | null {
    const artifactsDir = path.join(projectRoot, 'artifacts');
    if (!fs.existsSync(artifactsDir)) return null;

    if (batchNum) {
        const dir = path.join(artifactsDir, `drafts_${batchNum}`);
        return fs.existsSync(dir) ? dir : null;
    }

    // 查找最新批次
    const batches = fs.readdirSync(artifactsDir)
        .filter(f => f.startsWith('drafts_'))
        .sort((a, b) => {
            const numA = parseInt(a.replace('drafts_', ''), 10);
            const numB = parseInt(b.replace('drafts_', ''), 10);
            return numB - numA;
        });

    return batches.length > 0
        ? path.join(artifactsDir, batches[0])
        : null;
}

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
        .option('-p, --port <port>', '服务端口', process.env.OPSV_REVIEW_PORT || '3456')
        .option('-b, --batch <batch>', '指定批次号: all, 1:4, 或 1,3,5 (默认最新批次)', 'latest')
        .action(async (options) => {
            const projectRoot = process.cwd();

            // 解析批次目录列表
            const batchDirs = resolveBatchDirs(projectRoot, options.batch);
            if (batchDirs.length === 0) {
                logger.error('❌ 未找到匹配的批次目录。请先执行 "opsv generate" + "opsv gen-image"');
                return;
            }

            const port = parseInt(options.port);
            const server = new ReviewServer(projectRoot, batchDirs);
            await server.start(port);

            logger.info(`\n🔍 Review 服务已启动`);
            logger.info(`   地址: http://localhost:${port}`);
            logger.info(`   加载批次: ${batchDirs.map(d => path.basename(d)).join(', ')}`);
            logger.info(`   按 Ctrl+C 关闭\n`);
        });
}

function resolveBatchDirs(projectRoot: string, batchInput: string): string[] {
    const artifactsDir = path.join(projectRoot, 'artifacts');
    if (!fs.existsSync(artifactsDir)) return [];

    const allBatches = fs.readdirSync(artifactsDir)
        .filter(f => f.startsWith('drafts_'))
        .sort((a, b) => {
            const aNum = parseDraftNum(a);
            const bNum = parseDraftNum(b);
            return bNum - aNum; // newest first
        });

/**
 * 解析 draft 目录名称中的序号
 * 支持:
 *   drafts_5       → 5
 *   drafts_L1_1    → layer=1, seq=1
 *   drafts_L2_3    → layer=2, seq=3
 * 排序策略: 先按 layer 升序, 再按 seq 升序 (在 review 场景下保持历史顺序)
 */
function parseDraftNum(name: string): number {
    // 分层格式: drafts_L{n}_{m}
    const layerMatch = name.match(/^drafts_L(\d+)_(\d+)$/);
    if (layerMatch) {
        const layer = parseInt(layerMatch[1], 10);
        const seq = parseInt(layerMatch[2], 10);
        // 编码为一个大数: layer * 10000 + seq
        return layer * 10000 + seq;
    }
    // 扁平格式: drafts_{n}
    return parseInt(name.replace('drafts_', ''), 10) || 0;
}

    if (allBatches.length === 0) return [];

    // 1. 最新
    if (batchInput === 'latest' || !batchInput) {
        return [path.join(artifactsDir, allBatches[0])];
    }

    // 2. 全部
    if (batchInput === 'all') {
        return allBatches.map(b => path.join(artifactsDir, b));
    }

    // 3. 区间 (例如 1:4) — 使用 parseDraftNum 兼容新旧命名格式
    if (batchInput.includes(':')) {
        const [start, end] = batchInput.split(':').map(n => parseInt(n, 10));
        return allBatches
            .filter(b => {
                const n = parseDraftNum(b);
                return n >= start && n <= end;
            })
            .map(b => path.join(artifactsDir, b));
    }

    // 4. 列表 (例如 1,3,5)
    const nums = batchInput.split(/[ ,，]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (nums.length > 0) {
        return allBatches
            .filter(b => nums.includes(parseDraftNum(b)))
            .map(b => path.join(artifactsDir, b));
    }

    return [path.join(artifactsDir, allBatches[0])];
}

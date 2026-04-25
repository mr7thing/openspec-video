import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { DependencyGraph } from '../core/DependencyGraph';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { logger } from '../utils/logger';

// ============================================================================
// opsv circle — Circle（环）依赖层次管理
// v0.7: 合并 status + manifest，新增 create 命令
// 目录命名: {graphName}_zerocircle_{n} 格式
// ============================================================================

const CIRCLE_NAMES = ['ZeroCircle', 'FirstCircle', 'SecondCircle', 'ThirdCircle', 'FourthCircle', 'FifthCircle'];

export function registerCircleCommand(program: Command, VERSION: string) {
    const circleCmd = program
        .command('circle')
        .description('管理 Circle（环）依赖层次，显示各层状态和任务清单');

    // ----------------------------------------------------------------
    // opsv circle status
    // 实时检查各 Circle 状态（approved 数量）
    // 同时写入 .opsv/{graphName}_manifest.json
    // ----------------------------------------------------------------
    circleCmd
        .command('status')
        .description('查看当前项目各 Circle 的完成状态，并生成 manifest')
        .option('--dir <path>', '指定目录（默认 videospec）', 'videospec')
        .action(async (options) => {
            const projectRoot = process.cwd();
            const graphName = options.dir || 'videospec';
            logger.info(`\n🔮 OpsV Circle v${VERSION}`);

            try {
                const graph = await DependencyGraph.buildFromProject(projectRoot);
                const activeGraph = await DependencyGraph.getActiveGraph(projectRoot);
                const approvedRefReader = new ApprovedRefReader(projectRoot);
                const { batches, cycles } = graph.topologicalSort();

                if (batches.length === 0) {
                    logger.info('ℹ️ 未找到任何资产文档');
                    return;
                }

                const opsvQueueDir = path.join(projectRoot, 'opsv-queue');

                logger.info(`\n📊 依赖分析完成，共 ${batches.length} 个 Circle (活跃图: ${activeGraph}):\n`);

                let openCircleName: string | null = null;

                for (let i = 0; i < batches.length; i++) {
                    const circleIdx = i;
                    const circleName = CIRCLE_NAMES[circleIdx] || `Circle_${circleIdx}`;
                    const assets = batches[i];

                    // v0.7: 检查目录格式为 {graphName}_zerocircle_{n}
                    const circleDirPattern = new RegExp(`^${graphName}_${CIRCLE_NAMES[circleIdx].toLowerCase()}_\\d+$`, 'i');
                    let hasQueueDir = false;
                    let iterationCount = 0;

                    try {
                        const entries = await fs.readdir(opsvQueueDir);
                        for (const entry of entries) {
                            // 匹配 {graphName}_zerocircle_{n} 或 {graphName}_firstcircle_{n} 等
                            const pattern = new RegExp(`^${graphName}_\\w+_\\d+$`, 'i');
                            if (pattern.test(entry)) {
                                hasQueueDir = true;
                                iterationCount++;
                            }
                        }
                    } catch { /* opsv-queue may not exist yet */ }

                    // 检查该 Circle 的 approved 状态
                    let approvedCount = 0;
                    for (const assetId of assets) {
                        if (await approvedRefReader.hasAnyApproved(assetId)) {
                            approvedCount++;
                        }
                    }

                    const isComplete = approvedCount === assets.length;
                    const statusIcon = isComplete ? '✅' : (approvedCount > 0 ? '⏳' : '⭕');

                    if (!isComplete && !openCircleName) {
                        openCircleName = circleName;
                    }

                    logger.info(`  ${statusIcon} ${circleName}: ${assets.length} 个资产 (${approvedCount} 已批准)`);
                    if (hasQueueDir) {
                        logger.info(`     └─ 已有 ${iterationCount} 次迭代记录在 opsv-queue`);
                    }

                    // 显示前 5 个资产
                    const displayAssets = assets.slice(0, 5);
                    const suffix = assets.length > 5 ? ` ...等 ${assets.length - 5} 个` : '';
                    logger.info(`     └─ ${displayAssets.join(', ')}${suffix}`);
                }

                // 生成 manifest 并写入 .opsv/{graphName}_manifest.json
                const manifest = {
                    version: VERSION,
                    generatedAt: new Date().toISOString(),
                    activeGraph,
                    totalCircles: batches.length,
                    cycles: cycles.length > 0 ? cycles : undefined,
                    circles: batches.map((batch, idx) => {
                        const name = CIRCLE_NAMES[idx] || `Circle_${idx}`;
                        return {
                            index: idx,
                            name,
                            assets: batch,
                            status: 'pending' as string
                        };
                    })
                };

                const opsvDir = path.join(projectRoot, '.opsv');
                await fs.mkdir(opsvDir, { recursive: true });
                const manifestPath = path.join(opsvDir, `${graphName}_manifest.json`);
                await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

                logger.info(`\n✅ Manifest 已写入: ${manifestPath}`);

                // 输出执行次序建议
                logger.info('\n📋 推荐执行次序:');
                if (openCircleName) {
                    logger.info(`   1. 当前应优先完成: ${openCircleName}`);
                    logger.info(`   2. 执行 opsv imagen → opsv queue compile → opsv queue run`);
                    logger.info(`   3. 执行 opsv review 完成 approve`);
                    logger.info(`   4. 再执行 opsv circle status 确认可晋升下一 Circle`);
                } else {
                    logger.info('   ✅ 所有 Circle 已完成');
                }

                logger.info('\n💡 提示: Circle 隔离保证下游任务使用 approved 参考图，确保生成一致性');

            } catch (err) {
                logger.error(`Circle 分析失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });

    // ----------------------------------------------------------------
    // opsv circle create
    // 生成图文件 → 激活为当前图（旧图改名为 .back）
    // ----------------------------------------------------------------
    circleCmd
        .command('create')
        .description('创建并激活新的 Circle 依赖图')
        .option('--dir <path>', '指定目录（默认 videospec）', 'videospec')
        .option('--skip-middle-circle', '简化模式，所有非 shotlist → zerocircle，shotlist → endcircle', false)
        .action(async (options) => {
            const projectRoot = process.cwd();
            const graphName = options.dir || 'videospec';
            const skipMiddleCircle = options.skipMiddleCircle || false;

            logger.info(`\n🔮 OpsV Circle Create v${VERSION}`);
            logger.info(`   图名称: ${graphName}`);
            logger.info(`   简化模式: ${skipMiddleCircle ? '是 (skip-middle-circle)' : '否'}`);

            try {
                // 构建依赖图
                const graph = await DependencyGraph.buildFromProject(projectRoot);
                const { batches, cycles } = graph.topologicalSort();

                if (batches.length === 0) {
                    logger.warn('⚠️ 未找到任何资产文档，图可能为空');
                }

                // 保存新图
                await graph.saveGraph(projectRoot, graphName);
                logger.info(`\n✅ 图文件已生成: .opsv/${graphName}_graph.json`);

                // 激活新图（旧图改名为 .back）
                await DependencyGraph.activateGraph(projectRoot, graphName);
                logger.info(`✅ 已激活图: ${graphName}`);

                // 显示图结构摘要
                logger.info('\n📊 图结构:');
                for (let i = 0; i < batches.length; i++) {
                    const name = CIRCLE_NAMES[i] || `Circle_${i}`;
                    const assets = batches[i];
                    logger.info(`   ${name}: ${assets.length} 个资产`);
                    if (i < 3) { // 只显示前几个
                        const displayAssets = assets.slice(0, 3);
                        const suffix = assets.length > 3 ? ` ...等 ${assets.length - 3} 个` : '';
                        logger.info(`      └─ ${displayAssets.join(', ')}${suffix}`);
                    }
                }

                if (cycles.length > 0) {
                    logger.warn(`\n⚠️ 检测到循环依赖: ${cycles.join(', ')}`);
                }

                logger.info('\n💡 下一步:');
                logger.info(`   1. 执行 opsv circle status 查看图状态`);
                logger.info(`   2. 执行 opsv imagen 生成任务`);
                logger.info(`   3. 执行 opsv queue compile && opsv queue run`);
                logger.info(`   4. 执行 opsv review 完成 approve`);

            } catch (err) {
                logger.error(`Circle create 失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

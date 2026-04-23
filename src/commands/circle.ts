import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { DependencyGraph } from '../core/DependencyGraph';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { logger } from '../utils/logger';

// ============================================================================
// opsv circle — Circle（环）依赖层次管理
// 分析依赖图，按 Circle 分层，显示各环状态和任务清单
// ============================================================================

const CIRCLE_NAMES = ['ZeroCircle', 'FirstCircle', 'SecondCircle', 'ThirdCircle', 'FourthCircle', 'FifthCircle'];

export function registerCircleCommand(program: Command, VERSION: string) {
    const circleCmd = program
        .command('circle')
        .description('管理 Circle（环）依赖层次，显示各层生成状态');

    circleCmd
        .command('status')
        .description('查看当前项目各 Circle 的完成状态')
        .action(async () => {
            const projectRoot = process.cwd();
            logger.info(`\n🔮 OpsV Circle v${VERSION}`);

            try {
                const graph = await DependencyGraph.buildFromProject(projectRoot);
                const approvedRefReader = new ApprovedRefReader(projectRoot);
                const { batches } = graph.topologicalSort();
                
                if (batches.length === 0) {
                    logger.info('ℹ️ 未找到任何资产文档');
                    return;
                }

                const opsvQueueDir = path.join(projectRoot, 'opsv-queue');
                
                logger.info(`\n📊 依赖分析完成，共 ${batches.length} 个 Circle:\n`);
                
                let openCircleName: string | null = null;
                
                for (let i = 0; i < batches.length; i++) {
                    const circleIdx = i;
                    const circleName = CIRCLE_NAMES[circleIdx] || `Circle_${circleIdx}`;
                    const assets = batches[i];
                    
                    // 检查该 Circle 是否已有 opsv-queue 目录
                    const circleDirPattern = new RegExp(`^${circleName.toLowerCase()}_\\d+$`, 'i');
                    let hasQueueDir = false;
                    let iterationCount = 0;
                    
                    try {
                        const entries = await fs.readdir(opsvQueueDir);
                        for (const entry of entries) {
                            if (circleDirPattern.test(entry)) {
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
                
                // 输出执行次序建议
                logger.info('\n📋 推荐执行次序:');
                if (openCircleName) {
                    logger.info(`   1. 当前应优先完成: ${openCircleName}`);
                    logger.info(`   2. 执行 opsv imagen → opsv queue compile → opsv queue run`);
                    logger.info(`   3. 执行 opsv review 完成 approve`);
                    logger.info(`   4. 再执行 opsv circle status 确认可晋升下一 Circle`);
                } else {
                    logger.info('   ✅ 所有 Circle 已完成');
                    logger.info('   可执行 opsv circle manifest 固化快照');
                }
                
                logger.info('\n💡 提示: Circle 隔离保证下游任务使用 approved 参考图，确保生成一致性');
                
            } catch (err) {
                logger.error(`Circle 分析失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });

    circleCmd
        .command('manifest')
        .description('生成 circle_manifest.json 到 opsv-queue/')
        .action(async () => {
            const projectRoot = process.cwd();
            logger.info(`\n🔮 OpsV Circle Manifest v${VERSION}`);

            try {
                const graph = await DependencyGraph.buildFromProject(projectRoot);
                const { batches, cycles } = graph.topologicalSort();
                
                const manifest = {
                    version: VERSION,
                    generatedAt: new Date().toISOString(),
                    totalCircles: batches.length,
                    cycles: cycles.length > 0 ? cycles : undefined,
                    circles: batches.map((batch, idx) => {
                        const words = ['ZeroCircle', 'FirstCircle', 'SecondCircle', 'ThirdCircle', 'FourthCircle', 'FifthCircle'];
                        return {
                            index: idx,
                            name: words[idx] || `Circle_${idx}`,
                            assets: batch,
                            status: 'pending' as string
                        };
                    })
                };
                
                const manifestDir = path.join(projectRoot, 'opsv-queue');
                await fs.mkdir(manifestDir, { recursive: true });
                const manifestPath = path.join(manifestDir, 'circle_manifest.json');
                await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
                
                logger.info(`\n✅ Circle manifest 已生成: ${manifestPath}`);
                logger.info(`   共 ${batches.length} 个 Circle`);
                if (cycles.length > 0) {
                    logger.warn(`   ⚠️ 检测到循环依赖: ${cycles.join(', ')}`);
                }
                
            } catch (err) {
                logger.error(`Manifest 生成失败: ${(err as Error).message}`);
                process.exit(1);
            }
        });
}

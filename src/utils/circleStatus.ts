import { DependencyGraph } from '../core/DependencyGraph';
import { ApprovedRefReader } from '../core/ApprovedRefReader';
import { logger } from './logger';

export interface CircleInfo {
  name: string;
  index: number;
  assets: string[];
  approvedCount: number;
  pendingSyncCount: number;
  totalCount: number;
  isComplete: boolean;
}

export interface CircleStatusResult {
  circles: CircleInfo[];
  openCircle: CircleInfo | null;
  allComplete: boolean;
}

const CIRCLE_NAMES = ['ZeroCircle', 'FirstCircle', 'SecondCircle', 'ThirdCircle', 'FourthCircle', 'FifthCircle'];

/**
 * 获取项目所有 Circle 的状态信息
 */
export async function getCircleStatus(projectRoot: string): Promise<CircleStatusResult> {
  const graph = await DependencyGraph.buildFromProject(projectRoot);
  const approvedRefReader = new ApprovedRefReader(projectRoot);
  const { batches } = graph.topologicalSort();

  const circles: CircleInfo[] = [];

  for (let i = 0; i < batches.length; i++) {
    const assets = batches[i];
    let approvedCount = 0;
    let pendingSyncCount = 0;
    for (const assetId of assets) {
      if (await approvedRefReader.isReadyForDownstream(assetId)) {
        approvedCount++;
      } else if (await approvedRefReader.hasAnyApproved(assetId)) {
        pendingSyncCount++;
      }
    }

    circles.push({
      name: CIRCLE_NAMES[i] || `Circle_${i}`,
      index: i,
      assets,
      approvedCount,
      pendingSyncCount,
      totalCount: assets.length,
      isComplete: approvedCount === assets.length
    });
  }

  // 找到第一个未完成的 Circle（开放的 Circle）
  const openCircle = circles.find(c => !c.isComplete) || null;
  const allComplete = circles.length > 0 && circles.every(c => c.isComplete);

  return { circles, openCircle, allComplete };
}

/**
 * 打印 Circle 状态摘要到日志
 */
export async function printCircleSummary(projectRoot: string): Promise<void> {
  const { circles, openCircle, allComplete } = await getCircleStatus(projectRoot);

  if (circles.length === 0) {
    logger.info('ℹ️ 未找到任何资产文档');
    return;
  }

  logger.info('\n📊 Circle 状态摘要:');

  for (const circle of circles) {
    const icon = circle.isComplete ? '✅' : (circle.approvedCount > 0 || circle.pendingSyncCount > 0 ? '⏳' : '⭕');
    const syncNote = circle.pendingSyncCount > 0 ? ` (⚠️ ${circle.pendingSyncCount} pending_sync)` : '';
    logger.info(`  ${icon} ${circle.name}: ${circle.totalCount} 个资产 (${circle.approvedCount} 已批准)${syncNote}`);
  }

  if (allComplete) {
    logger.info('\n🎉 所有 Circle 已完成');
  } else if (openCircle) {
    logger.info(`\n🔓 当前开放 Circle: ${openCircle.name} (${openCircle.approvedCount}/${openCircle.totalCount})`);
    logger.info('   建议执行 opsv imagen 生成该 Circle 的任务');
  }
}

/**
 * 检查指定 Circle 的上游是否全部 approved
 * @param targetCircleName 如 "firstcircle_1"
 * @returns { ok: boolean, message: string }
 */
export async function checkUpstreamApproved(
  projectRoot: string,
  targetCircleName: string
): Promise<{ ok: boolean; message: string }> {
  const { circles } = await getCircleStatus(projectRoot);

  // 解析 targetCircle 的索引
  const lowerName = targetCircleName.toLowerCase();
  let targetIdx = -1;

  for (let i = 0; i < CIRCLE_NAMES.length; i++) {
    if (lowerName.startsWith(CIRCLE_NAMES[i].toLowerCase())) {
      targetIdx = i;
      break;
    }
  }

  // 如果无法解析或 ZeroCircle，无需检查上游
  if (targetIdx <= 0) {
    return { ok: true, message: 'ZeroCircle 无上游依赖' };
  }

  // 检查所有上游 Circle
  const upstreamCircles = circles.filter(c => c.index < targetIdx);
  const incompleteUpstream = upstreamCircles.filter(c => !c.isComplete);

  if (incompleteUpstream.length > 0) {
    const names = incompleteUpstream.map(c => `${c.name}(${c.approvedCount}/${c.totalCount})`).join(', ');
    return {
      ok: false,
      message: `上游 Circle 未全部 approved: ${names}。缺少 approved 参考图将导致生成结果不一致。`
    };
  }

  return { ok: true, message: '上游 Circle 已全部 approved' };
}

/**
 * 根据当前状态推断默认的 Circle 名称
 * 返回第一个未全部 approved 的 Circle 名称（小写+_1）
 */
export async function inferDefaultCircle(projectRoot: string): Promise<string | null> {
  const { openCircle } = await getCircleStatus(projectRoot);
  if (!openCircle) return null;
  return `${openCircle.name.toLowerCase()}_1`;
}

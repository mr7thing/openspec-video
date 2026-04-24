import fs from 'fs/promises';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader } from './ApprovedRefReader';
import { logger } from '../utils/logger';

// ============================================================================
// 依赖图引擎 — 严格模式
// 依赖未就绪的任务自动分解，只生成当前可执行的
// ============================================================================

export interface ParsedDocument {
    id: string;
    filePath: string;
    frontmatter: {
        refs?: string[];
        status?: string;
    };
}

export interface DependencyAnalysis {
    /** 按拓扑排序的批次 */
    batches: string[][];
    /** 循环依赖检测结果 */
    cycles: string[];
}

export class DependencyGraph {
    private graph: Map<string, Set<string>> = new Map();

    /**
     * 从文档的 frontmatter 构建依赖图
     * reference 字段 = 变体依赖（必须先生成）
     * refs 字段 = 引用依赖（需要参考图）
     */
    build(documents: ParsedDocument[]): void {
        this.graph.clear();

        for (const doc of documents) {
            const deps = new Set<string>();

            // 统一解析 @id:variant 引用语法
            if (doc.frontmatter.refs) {
                for (const ref of doc.frontmatter.refs) {
                    // 1. 去掉 @ 前缀
                    let cleanId = ref.startsWith('@') ? ref.slice(1) : ref;
                    // 2. 去掉 :variant 后缀（依赖必须锁定到文档级）
                    const colonIdx = cleanId.indexOf(':');
                    if (colonIdx > 0) {
                        cleanId = cleanId.slice(0, colonIdx);
                    }

                    // 排除自引用
                    if (cleanId !== doc.id) deps.add(cleanId);
                }
            }

            this.graph.set(doc.id, deps);
        }
    }

    /**
     * 拓扑排序 — 返回分批生成顺序
     * 每批内的资产互相无依赖，可并行生成
     */
    topologicalSort(): DependencyAnalysis {
        const batches: string[][] = [];
        const resolved = new Set<string>();
        const remaining = new Map(this.graph);
        const cycles: string[] = [];

        while (remaining.size > 0) {
            const batch: string[] = [];

            for (const [node, deps] of remaining) {
                // 过滤掉不在图中的外部依赖（已存在的资产）
                const unresolvedDeps = [...deps].filter(
                    d => remaining.has(d) && !resolved.has(d)
                );
                if (unresolvedDeps.length === 0) {
                    batch.push(node);
                }
            }

            if (batch.length === 0) {
                // 环形依赖
                cycles.push(...remaining.keys());
                break;
            }

            for (const node of batch) {
                remaining.delete(node);
                resolved.add(node);
            }
            batches.push(batch);
        }

        return { batches, cycles };
    }

    /**
     * 为指定的任务列表构建层次索引
     * @param jobs 任务列表（只需 id 字段）
     * @returns layers: Array of job ID 数组（按层排列），idToLayer: id → 层号（1-based）
     */
    buildLayerIndex(jobs: { id: string }[]): { layers: string[][]; idToLayer: Map<string, number> } {
        const jobIds = new Set(jobs.map(j => j.id));
        const { batches } = this.topologicalSort();
        const layers: string[][] = [];
        const idToLayer = new Map<string, number>();

        for (const [layerIdx, batch] of batches.entries()) {
            const layerNum = layerIdx + 1;
            const filtered = batch.filter(id => jobIds.has(id));
            if (filtered.length > 0) {
                layers.push(filtered);
                for (const id of filtered) {
                    idToLayer.set(id, layerNum);
                }
            }
        }

        return { layers, idToLayer };
    }

    /**
     * 核心方法: 根据 Approved References 就绪状态分解任务
     * 严格模式: 只返回依赖已全部就绪（有 approved 图）的任务
     */
    async filterExecutable<T extends { id: string }>(
        allJobs: T[],
        approvedRefReader: ApprovedRefReader
    ): Promise<{
        executable: T[];
        blocked: T[];
        reasons: Map<string, string>;
    }> {
        const approved = new Set<string>();
        const executable: T[] = [];
        const blocked: T[] = [];
        const reasons = new Map<string, string>();

        // 1. 收集所有已就绪（有 approved 图且非 pending_sync）的资产 ID
        for (const id of this.graph.keys()) {
            const isReady = await approvedRefReader.isReadyForDownstream(id);
            if (isReady) {
                approved.add(id);
            }
        }

        // 2. 检查每个 job 的依赖是否全部 approved
        for (const job of allJobs) {
            const deps = this.graph.get(job.id);
            if (!deps || deps.size === 0) {
                executable.push(job);
                continue;
            }

            const unresolved = [...deps].filter(d => !approved.has(d));
            if (unresolved.length === 0) {
                executable.push(job);
            } else {
                blocked.push(job);
                reasons.set(job.id,
                    `等待依赖: ${unresolved.join(', ')} (请先生成并 approve)`
                );
            }
        }

        return { executable, blocked, reasons };
    }

    /**
     * 获取指定节点的直接依赖
     */
    getDependencies(nodeId: string): string[] {
        const deps = this.graph.get(nodeId);
        return deps ? [...deps] : [];
    }

    /**
     * 输出人类可读的依赖分析
     * 异步方法：内部需要 await 检查 approved 状态
     */
    async prettyPrint(approvedRefReader?: ApprovedRefReader): Promise<string> {
        const { batches, cycles } = this.topologicalSort();
        const lines: string[] = ['\ud83d\udcca 依赖图分析:\n'];

        for (const [id, deps] of this.graph) {
            const depStr = deps.size === 0
                ? '(无依赖)'
                : `(依赖 ${[...deps].join(', ')})`;
            // 正确使用 await，避免 Promise 对象常量为 truthy 的错误
            const hasApproved = approvedRefReader
                ? await approvedRefReader.hasAnyApproved(id)
                : false;
            const statusIcon = hasApproved ? '\u2705' : '\u26a0\ufe0f';
            lines.push(`  ${statusIcon} ${id} ${depStr}`);
        }

        if (batches.length > 0) {
            lines.push('\n推荐生成顺序:');
            batches.forEach((batch, i) => {
                const suffix = i === 0 ? ' (无依赖，可立即生成)' : '';
                lines.push(`  第${i + 1}批: ${batch.join(', ')}${suffix}`);
            });
        }

        if (cycles.length > 0) {
            lines.push(`\n\u26a0\ufe0f 循环依赖: ${cycles.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * 持久化到 .opsv/ 目录
     */
    async save(projectRoot: string): Promise<void> {
        const opsvDir = path.join(projectRoot, '.opsv');
        await fs.mkdir(opsvDir, { recursive: true });

        const serialized: Record<string, string[]> = {};
        for (const [node, deps] of this.graph) {
            serialized[node] = [...deps];
        }

        await fs.writeFile(
            path.join(opsvDir, 'dependency-graph.json'),
            JSON.stringify(serialized, null, 2)
        );
    }

    /**
     * 从文档目录扫描并重建依赖图
     * 确保每次 generate 前都是最新版本
     */
    static async buildFromProject(projectRoot: string): Promise<DependencyGraph> {
        const graph = new DependencyGraph();
        const documents: ParsedDocument[] = [];

        // 支持两种目录结构:
        // 1. {projectRoot}/videospec/elements/  (标准结构)
        // 2. {projectRoot}/elements/            (扁平结构，brother 测试用)
        const dirs = ['elements', 'scenes', 'shots'];

        for (const dir of dirs) {
            // 先尝试标准结构，再尝试扁平结构
            const standardPath = path.join(projectRoot, 'videospec', dir);
            const flatPath = path.join(projectRoot, dir);
            const standardExists = await fs.access(standardPath).then(() => true).catch(() => false);
            const dirPath = standardExists ? standardPath : flatPath;
            const dirExists = await fs.access(dirPath).then(() => true).catch(() => false);
            if (!dirExists) continue;

            const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const { frontmatter } = FrontmatterParser.parseRaw(content);
                    const id = file.replace(/^@/, '').replace(/\.md$/, '');

                    documents.push({ id, filePath, frontmatter });
                } catch (e) {
                    logger.warn(`依赖图构建跳过 ${file}: ${(e as Error).message}`);
                }
            }
        }

        graph.build(documents);
        await graph.save(projectRoot);
        return graph;
    }
}

import fs from 'fs';
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
        reference?: string;
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

            // reference 字段: 变体依赖（如 younger_brother 依赖 elder_brother）
            if (doc.frontmatter.reference) {
                deps.add(doc.frontmatter.reference);
            }

            // refs 字段: 引用依赖（本文档引用的所有资产）
            if (doc.frontmatter.refs) {
                for (const ref of doc.frontmatter.refs) {
                    // 排除自引用
                    if (ref !== doc.id) deps.add(ref);
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
     * 核心方法: 根据 Approved References 就绪状态分解任务
     * 严格模式: 只返回依赖已全部就绪（有 approved 图）的任务
     */
    filterExecutable<T extends { id: string }>(
        allJobs: T[],
        approvedRefReader: ApprovedRefReader
    ): {
        executable: T[];
        blocked: T[];
        reasons: Map<string, string>;
    } {
        const approved = new Set<string>();
        const executable: T[] = [];
        const blocked: T[] = [];
        const reasons = new Map<string, string>();

        // 1. 收集所有已有 approved 图的资产 ID
        for (const id of this.graph.keys()) {
            if (approvedRefReader.hasAnyApproved(id)) {
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
     */
    prettyPrint(approvedRefReader?: ApprovedRefReader): string {
        const { batches, cycles } = this.topologicalSort();
        const lines: string[] = ['📊 依赖图分析:\n'];

        for (const [id, deps] of this.graph) {
            const depStr = deps.size === 0
                ? '(无依赖)'
                : `(依赖 ${[...deps].join(', ')})`;
            const statusIcon = approvedRefReader?.hasAnyApproved(id)
                ? '✅' : '⚠️';
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
            lines.push(`\n⚠️ 循环依赖: ${cycles.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * 持久化到 .opsv/ 目录
     */
    save(projectRoot: string): void {
        const opsvDir = path.join(projectRoot, '.opsv');
        if (!fs.existsSync(opsvDir)) fs.mkdirSync(opsvDir, { recursive: true });

        const serialized: Record<string, string[]> = {};
        for (const [node, deps] of this.graph) {
            serialized[node] = [...deps];
        }

        fs.writeFileSync(
            path.join(opsvDir, 'dependency-graph.json'),
            JSON.stringify(serialized, null, 2)
        );
    }

    /**
     * 从文档目录扫描并重建依赖图
     * 确保每次 generate 前都是最新版本
     */
    static buildFromProject(projectRoot: string): DependencyGraph {
        const graph = new DependencyGraph();
        const documents: ParsedDocument[] = [];
        const dirs = ['elements', 'scenes'];

        for (const dir of dirs) {
            const dirPath = path.join(projectRoot, 'videospec', dir);
            if (!fs.existsSync(dirPath)) continue;

            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const { frontmatter } = FrontmatterParser.parseRaw(content);
                    const id = file.replace(/^@/, '').replace(/\.md$/, '');

                    documents.push({ id, filePath, frontmatter });
                } catch (e) {
                    logger.warn(`依赖图构建跳过 ${file}: ${(e as Error).message}`);
                }
            }
        }

        graph.build(documents);
        graph.save(projectRoot);
        return graph;
    }
}

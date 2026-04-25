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

// 多图管理：图文件结构
export interface GraphFileStructure {
    circles: Record<string, string[]>;
    activeGraph: string;
}

// ensureCircleDirectories 返回类型
export interface CircleDirectoryInfo {
    dir: string;        // 如 "videospec_zerocircle_1"
    isNew: boolean;     // 是否新建
    iteration: number;   // 序号
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
     * 获取当前图中的所有节点 ID
     */
    getNodes(): string[] {
        return [...this.graph.keys()];
    }

    /**
     * 获取指定 circle index 的所有资产 ID
     * @param circleIndex 0-based circle index
     */
    getCircleAssets(circleIndex: number): string[] {
        const { batches } = this.topologicalSort();
        return batches[circleIndex] || [];
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

    // ========================================================================
    // 多图管理
    // ========================================================================

    private static readonly CIRCLE_NAMES = [
        'zerocircle', 'firstcircle', 'secondcircle',
        'thirdcircle', 'fourthcircle', 'fifthcircle'
    ];

    private getCircleWord(circleIndex: number): string {
        return DependencyGraph.CIRCLE_NAMES[circleIndex] || `circle_${circleIndex}`;
    }

    /**
     * 保存图文件到 .opsv/{graphName}_graph.json
     */
    async saveGraph(projectRoot: string, graphName: string = 'videospec'): Promise<void> {
        const opsvDir = path.join(projectRoot, '.opsv');
        await fs.mkdir(opsvDir, { recursive: true });

        const { batches } = this.topologicalSort();

        // 构建 circles 结构
        const circles: Record<string, string[]> = {};
        for (let i = 0; i < batches.length; i++) {
            circles[String(i)] = batches[i];
        }

        const graphData: GraphFileStructure = {
            circles,
            activeGraph: graphName
        };

        await fs.writeFile(
            path.join(opsvDir, `${graphName}_graph.json`),
            JSON.stringify(graphData, null, 2)
        );

        // 更新 activeGraph
        await this.setActiveGraph(projectRoot, graphName);
    }

    /**
     * 加载图文件 from .opsv/{graphName}_graph.json
     */
    static async loadGraph(projectRoot: string, graphName?: string): Promise<DependencyGraph> {
        const opsvDir = path.join(projectRoot, '.opsv');
        const name = graphName || await DependencyGraph.getActiveGraph(projectRoot) || 'videospec';
        const graphPath = path.join(opsvDir, `${name}_graph.json`);

        try {
            const content = await fs.readFile(graphPath, 'utf-8');
            const graphData: GraphFileStructure = JSON.parse(content);

            const graph = new DependencyGraph();

            // 从 circles 结构重建图
            // 相同 circle 内的资产互不依赖
            // 不同 circle 之间，按 circle 顺序建立依赖
            for (let i = 0; i < Object.keys(graphData.circles).length; i++) {
                const circleKey = String(i);
                const assets = graphData.circles[circleKey];
                if (!assets) continue;

                for (const assetId of assets) {
                    // 依赖所有前面 circle 的资产
                    const deps = new Set<string>();
                    for (let j = 0; j < i; j++) {
                        const prevCircleKey = String(j);
                        const prevAssets = graphData.circles[prevCircleKey];
                        if (prevAssets) {
                            for (const prevAsset of prevAssets) {
                                deps.add(prevAsset);
                            }
                        }
                    }
                    graph.graph.set(assetId, deps);
                }
            }

            return graph;
        } catch {
            // 如果文件不存在，返回空图
            return new DependencyGraph();
        }
    }

    /**
     * 激活指定名称的图
     * 其他图文件改名为 .back
     */
    static async activateGraph(projectRoot: string, graphName: string): Promise<void> {
        const opsvDir = path.join(projectRoot, '.opsv');
        await fs.mkdir(opsvDir, { recursive: true });

        // 读取 graphs.json 获取所有图的列表
        const graphsConfigPath = path.join(opsvDir, 'graphs.json');
        let graphsConfig: { active: string; graphs: string[] } = { active: graphName, graphs: [graphName] };

        try {
            const existing = await fs.readFile(graphsConfigPath, 'utf-8');
            graphsConfig = JSON.parse(existing);
        } catch { /* ignore */ }

        // 如果新图不在列表中，添加进去
        if (!graphsConfig.graphs.includes(graphName)) {
            graphsConfig.graphs.push(graphName);
        }

        // 将旧图改名为 .back
        if (graphsConfig.active && graphsConfig.active !== graphName) {
            const oldGraphPath = path.join(opsvDir, `${graphsConfig.active}_graph.json`);
            const backupPath = path.join(opsvDir, `${graphsConfig.active}_graph.json.back`);
            try {
                await fs.rename(oldGraphPath, backupPath);
            } catch { /* ignore - file might not exist */ }
        }

        // 激活新图
        graphsConfig.active = graphName;
        await fs.writeFile(graphsConfigPath, JSON.stringify(graphsConfig, null, 2));
    }

    /**
     * 获取当前激活的图名称
     */
    static async getActiveGraph(projectRoot: string): Promise<string> {
        const opsvDir = path.join(projectRoot, '.opsv');
        const graphsConfigPath = path.join(opsvDir, 'graphs.json');

        try {
            const content = await fs.readFile(graphsConfigPath, 'utf-8');
            const config = JSON.parse(content);
            return config.active || 'videospec';
        } catch {
            return 'videospec';
        }
    }

    /**
     * 设置当前激活的图
     */
    private async setActiveGraph(projectRoot: string, graphName: string): Promise<void> {
        const opsvDir = path.join(projectRoot, '.opsv');
        await fs.mkdir(opsvDir, { recursive: true });

        const graphsConfigPath = path.join(opsvDir, 'graphs.json');
        let graphsConfig: { active: string; graphs: string[] } = { active: graphName, graphs: [graphName] };

        try {
            const existing = await fs.readFile(graphsConfigPath, 'utf-8');
            graphsConfig = JSON.parse(existing);
            if (!graphsConfig.graphs.includes(graphName)) {
                graphsConfig.graphs.push(graphName);
            }
        } catch { /* ignore */ }

        graphsConfig.active = graphName;
        await fs.writeFile(graphsConfigPath, JSON.stringify(graphsConfig, null, 2), 'utf-8');
    }

    // ========================================================================
    // 统一目录创建
    // ========================================================================

    /**
     * 确保指定圈层的目录存在
     * 目录创建触发条件 = 文件列表变化（谁在哪个环），不是内容/状态变化
     *
     * @param projectRoot 项目根目录
     * @param circleIndex 圈层索引 (0-based)
     * @param graphName 图名称 (默认 videospec)
     * @returns { dir, isNew, iteration } 目录信息
     */
    async ensureCircleDirectories(
        projectRoot: string,
        circleIndex: number,
        graphName: string = 'videospec'
    ): Promise<CircleDirectoryInfo> {
        const { batches } = this.topologicalSort();
        if (circleIndex < 0 || circleIndex >= batches.length) {
            throw new Error(`Invalid circle index: ${circleIndex}`);
        }

        const assets = batches[circleIndex];
        const circleWord = this.getCircleWord(circleIndex);

        // 找到或创建该圈的下一个可用序号
        let iteration = 1;
        let isNew = false;
        const opsvQueueDir = path.join(projectRoot, 'opsv-queue');

        while (true) {
            const dirPath = path.join(opsvQueueDir, `${graphName}_${circleWord}_${iteration}`);
            const exists = await fs.access(dirPath).then(() => true).catch(() => false);

            if (!exists) {
                // 检查文件列表是否变化
                const prevIteration = iteration - 1;
                if (prevIteration > 0) {
                    const prevDir = path.join(opsvQueueDir, `${graphName}_${circleWord}_${prevIteration}`);
                    const prevExists = await fs.access(prevDir).then(() => true).catch(() => false);
                    if (prevExists) {
                        isNew = await this.diffFileList(prevDir, assets);
                        if (!isNew) {
                            // 文件列表没变，复用上一轮
                            return { dir: prevDir, isNew: false, iteration: prevIteration };
                        }
                    }
                }

                // 创建新目录
                await fs.mkdir(dirPath, { recursive: true });
                return { dir: dirPath, isNew: true, iteration };
            }
            iteration++;
        }
    }

    /**
     * 对比文件列表是否变化
     */
    private async diffFileList(circleDir: string, newAssets: string[]): Promise<boolean> {
        const jobsPath = path.join(circleDir, 'imagen_jobs.json');
        try {
            const content = await fs.readFile(jobsPath, 'utf-8');
            const oldJobs = JSON.parse(content);
            const oldAssetIds = oldJobs.map((j: any) => j.id);

            if (oldAssetIds.length !== newAssets.length) return true;
            const sortedOld = [...oldAssetIds].sort();
            const sortedNew = [...newAssets].sort();
            return sortedOld.some((id, i) => id !== sortedNew[i]);
        } catch {
            return true; // 文件不存在视为变化
        }
    }

    // ========================================================================
    // 工厂方法
    // ========================================================================

    /**
     * 从文档目录扫描并重建依赖图
     * 确保每次 generate 前都是最新版本
     */
    static async buildFromProject(projectRoot: string): Promise<DependencyGraph> {
        const graph = new DependencyGraph();
        const documents: ParsedDocument[] = [];

        // 推断 graphName（取 videospec 目录的父目录名或 videospec）
        let graphName = 'videospec';
        const videospecPath = path.join(projectRoot, 'videospec');
        if (await fs.access(videospecPath).then(() => true).catch(() => false)) {
            graphName = 'videospec';
        } else {
            // 尝试从当前目录名推断
            const cwd = path.basename(projectRoot);
            if (cwd) graphName = cwd;
        }

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
        await graph.saveGraph(projectRoot, graphName);
        return graph;
    }
}
